// Pure transcode function used by both the main-thread fallback path in
// Ktx2Loader.ts and the long-lived worker in ktx2-worker.ts. Single source
// of truth for the format-selection table + the wasm calling sequence.
//
// The transcode result returns plain TypedArrays whose backing ArrayBuffers
// are guaranteed transferable from the worker (we slice() out of wasm
// memory so each Uint8Array owns its own ArrayBuffer).

import {
  readKtx2Header,
  readKtx2LevelInfo,
  HEADER_SIZE_BYTES,
  LEVEL_INFO_SIZE_BYTES,
  FL_TRANSCODER_E_OK,
  type Ktx2Header,
  type Ktx2LevelInfo,
  type TranscoderExports,
} from '../runtime/transcoder-runtime.js'

// Capability flags surfaced from a renderer's WebGL extensions or WebGPU
// device features. Drives format selection. Mirrors three's
// KTX2LoaderWorkerConfig shape so detectSupport() consumers don't have to
// translate.
export interface Ktx2Capabilities {
  astcSupported: boolean
  astcHDRSupported: boolean
  etc1Supported: boolean
  etc2Supported: boolean
  dxtSupported: boolean
  bptcSupported: boolean
  pvrtcSupported: boolean
}

// One mipmap level, ready to wrap in three's CompressedTexture / DataTexture.
// `data` is a typed array view; the underlying ArrayBuffer is transferable.
export interface Ktx2Mipmap {
  data: Uint8Array | Uint16Array
  width: number
  height: number
}

// One face (or one image for non-cube textures). Cubemaps have 6 faces;
// 2D textures have one. Each face has its own mip chain.
export interface Ktx2Face {
  mipmaps: Ktx2Mipmap[]
}

// Result of transcoding a single KTX2 file. Three's engine format/type
// values are passed through verbatim — Ktx2Loader maps them onto the right
// three.js texture class (CompressedTexture / CompressedArrayTexture /
// CompressedCubeTexture).
export interface Ktx2TranscodeResult {
  faces: Ktx2Face[]                    // length 1 (2D / array) or 6 (cubemap)
  width: number                        // physical (block-aligned) width of level 0
  height: number                       // physical height of level 0
  origWidth: number                    // original (non-block-aligned) width
  origHeight: number                   // original height
  layerCount: number                   // 0 / 1 = non-array; N = array of N
  faceCount: number                    // 1 = 2D / array; 6 = cubemap
  format: number                       // three.js engineFormat (e.g. RGBA_BPTC_Format)
  type: number                         // three.js engineType
  hasAlpha: boolean
  dfdFlags: number
  dfdColorModel: number
  dfdTransferFunc: number
}

// ── Format selection ──────────────────────────────────────────────────────

// basist::transcoder_texture_format values mirrored from
// vendor/basisu/transcoder/basisu_transcoder.h. Kept narrow — only the
// targets actually used in the FORMAT_OPTIONS table below.
const TF = {
  ETC1_RGB: 0,
  ETC2_RGBA: 1,
  BC1_RGB: 2,
  BC3_RGBA: 3,
  BC7_RGBA: 6,
  PVRTC1_4_RGB: 8,
  PVRTC1_4_RGBA: 9,
  ASTC_4x4_RGBA: 10,
  RGBA32: 13,
  BC6H: 22,
  RGBA_HALF: 25,
} as const

// basist::basis_tex_format values. Only the three we ever see from
// fl_ktx2_get_header.
const BasisFormat = { ETC1S: 0, UASTC: 1, UASTC_HDR: 2 } as const

// Three.js EngineFormat / EngineType numeric IDs. Static fields on three's
// Texture class — we resolve them at module load. `import * as THREE`
// would bloat the worker; we'd rather grab the constants once here.
import {
  RGBAFormat,
  RGBA_ASTC_4x4_Format,
  RGBA_BPTC_Format,
  RGB_BPTC_UNSIGNED_Format,
  RGBA_S3TC_DXT1_Format,
  RGBA_S3TC_DXT5_Format,
  RGB_ETC1_Format,
  RGB_ETC2_Format,
  RGBA_ETC2_EAC_Format,
  RGB_PVRTC_4BPPV1_Format,
  RGBA_PVRTC_4BPPV1_Format,
  UnsignedByteType,
  HalfFloatType,
} from 'three'

interface FormatOption {
  cap?: keyof Ktx2Capabilities
  basis: number[]                      // basis source format(s) this row applies to
  transcoder: [number] | [number, number] // [opaque] or [opaque, alpha]
  engine: [number] | [number, number]
  type: number
  priorityETC1S?: number
  priorityUASTC?: number
  priorityHDR?: number
  needsPowerOfTwo?: boolean
}

// Priority ranks high-quality first, low-quality next, uncompressed last.
// Rationale + reference: https://github.com/KhronosGroup/3D-Formats-Guidelines
const FORMAT_OPTIONS: FormatOption[] = [
  {
    cap: 'astcSupported',
    basis: [BasisFormat.UASTC],
    transcoder: [TF.ASTC_4x4_RGBA, TF.ASTC_4x4_RGBA],
    engine: [RGBA_ASTC_4x4_Format, RGBA_ASTC_4x4_Format],
    type: UnsignedByteType,
    priorityETC1S: Infinity,
    priorityUASTC: 1,
  },
  {
    cap: 'bptcSupported',
    basis: [BasisFormat.ETC1S, BasisFormat.UASTC],
    transcoder: [TF.BC7_RGBA, TF.BC7_RGBA],
    engine: [RGBA_BPTC_Format, RGBA_BPTC_Format],
    type: UnsignedByteType,
    priorityETC1S: 3,
    priorityUASTC: 2,
  },
  {
    cap: 'dxtSupported',
    basis: [BasisFormat.ETC1S, BasisFormat.UASTC],
    transcoder: [TF.BC1_RGB, TF.BC3_RGBA],
    engine: [RGBA_S3TC_DXT1_Format, RGBA_S3TC_DXT5_Format],
    type: UnsignedByteType,
    priorityETC1S: 4,
    priorityUASTC: 5,
  },
  {
    cap: 'etc2Supported',
    basis: [BasisFormat.ETC1S, BasisFormat.UASTC],
    transcoder: [TF.ETC1_RGB, TF.ETC2_RGBA],
    engine: [RGB_ETC2_Format, RGBA_ETC2_EAC_Format],
    type: UnsignedByteType,
    priorityETC1S: 1,
    priorityUASTC: 3,
  },
  {
    cap: 'etc1Supported',
    basis: [BasisFormat.ETC1S, BasisFormat.UASTC],
    transcoder: [TF.ETC1_RGB],
    engine: [RGB_ETC1_Format],
    type: UnsignedByteType,
    priorityETC1S: 2,
    priorityUASTC: 4,
  },
  {
    cap: 'pvrtcSupported',
    basis: [BasisFormat.ETC1S, BasisFormat.UASTC],
    transcoder: [TF.PVRTC1_4_RGB, TF.PVRTC1_4_RGBA],
    engine: [RGB_PVRTC_4BPPV1_Format, RGBA_PVRTC_4BPPV1_Format],
    type: UnsignedByteType,
    priorityETC1S: 5,
    priorityUASTC: 6,
    needsPowerOfTwo: true,
  },
  {
    cap: 'bptcSupported',
    basis: [BasisFormat.UASTC_HDR],
    transcoder: [TF.BC6H],
    engine: [RGB_BPTC_UNSIGNED_Format],
    type: HalfFloatType,
    priorityHDR: 1,
  },
  // Uncompressed fallbacks — always matched last.
  {
    basis: [BasisFormat.ETC1S, BasisFormat.UASTC],
    transcoder: [TF.RGBA32, TF.RGBA32],
    engine: [RGBAFormat, RGBAFormat],
    type: UnsignedByteType,
    priorityETC1S: 100,
    priorityUASTC: 100,
  },
  {
    basis: [BasisFormat.UASTC_HDR],
    transcoder: [TF.RGBA_HALF],
    engine: [RGBAFormat],
    type: HalfFloatType,
    priorityHDR: 100,
  },
]

const isPowerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0

interface SelectedFormat {
  transcoderFormat: number
  engineFormat: number
  engineType: number
}

function selectFormat(
  basisFormat: number,
  width: number,
  height: number,
  hasAlpha: boolean,
  caps: Ktx2Capabilities,
): SelectedFormat {
  const sortKey: keyof FormatOption =
    basisFormat === BasisFormat.ETC1S
      ? 'priorityETC1S'
      : basisFormat === BasisFormat.UASTC
        ? 'priorityUASTC'
        : 'priorityHDR'

  const candidates = FORMAT_OPTIONS.filter((o) => o.basis.includes(basisFormat)).sort(
    (a, b) => ((a[sortKey] as number) ?? Infinity) - ((b[sortKey] as number) ?? Infinity),
  )

  for (const opt of candidates) {
    if (opt.cap && !caps[opt.cap]) continue
    if (hasAlpha && opt.transcoder.length < 2) continue
    if (opt.needsPowerOfTwo && !(isPowerOfTwo(width) && isPowerOfTwo(height))) continue
    const idx = hasAlpha ? 1 : 0
    return {
      transcoderFormat: opt.transcoder[idx] ?? opt.transcoder[0],
      engineFormat: opt.engine[idx] ?? opt.engine[0],
      engineType: opt.type,
    }
  }
  throw new Error('Ktx2Loader: failed to identify transcoding target')
}

// ── Main transcode function ───────────────────────────────────────────────

/**
 * Convenience: lazy-instantiate the wasm transcoder via `loadTranscoderWasm()`
 * and run a transcode. Used by the inline (main-thread) fallback path.
 *
 * Worker callers MUST use `transcodeKtx2WithExports` after they've
 * instantiated their own transcoder from postMessage'd bytes.
 *
 * The `loadTranscoderWasm` import is dynamic so this module's static
 * import graph stays URL-free — Vite's `?worker&inline` plugin would
 * otherwise warn about the `new URL(..., import.meta.url)` pattern in
 * `transcoder-loader.ts` even though the worker only uses
 * `transcodeKtx2WithExports`.
 */
export async function transcodeKtx2(
  buffer: ArrayBuffer,
  caps: Ktx2Capabilities,
): Promise<Ktx2TranscodeResult> {
  const { loadTranscoderWasm } = await import('../runtime/transcoder-loader.js')
  return transcodeKtx2WithExports(buffer, caps, await loadTranscoderWasm())
}

/**
 * Run a transcode against a caller-provided wasm transcoder instance. This
 * is the worker-friendly entry point — the worker holds its own
 * TranscoderExports (instantiated once at init time) and reuses it across
 * many transcodes.
 */
export function transcodeKtx2WithExports(
  buffer: ArrayBuffer,
  caps: Ktx2Capabilities,
  t: TranscoderExports,
): Promise<Ktx2TranscodeResult> {
  const memory = t.memory

  // Allocate input buffer in wasm memory and copy bytes in.
  const inputLen = buffer.byteLength
  const inputPtr = t.fl_transcoder_alloc(inputLen)
  if (inputPtr === 0) throw new Error('Ktx2Loader: transcoder_alloc(input) failed')

  const transcoder = t.fl_ktx2_transcoder_create()
  if (transcoder === 0) {
    t.fl_transcoder_free(inputPtr)
    throw new Error('Ktx2Loader: ktx2_transcoder_create failed')
  }

  const headerPtr = t.fl_transcoder_alloc(HEADER_SIZE_BYTES)
  const levelPtr = t.fl_transcoder_alloc(LEVEL_INFO_SIZE_BYTES)

  try {
    new Uint8Array(memory.buffer, inputPtr, inputLen).set(new Uint8Array(buffer))

    let rc = t.fl_ktx2_init(transcoder, inputPtr, inputLen)
    if (rc !== FL_TRANSCODER_E_OK) {
      throw new Error(`Ktx2Loader: invalid or unsupported KTX2 file (rc=${rc})`)
    }
    rc = t.fl_ktx2_start_transcoding(transcoder)
    if (rc !== FL_TRANSCODER_E_OK) {
      throw new Error(`Ktx2Loader: start_transcoding failed (rc=${rc})`)
    }

    rc = t.fl_ktx2_get_header(transcoder, headerPtr)
    if (rc !== FL_TRANSCODER_E_OK) throw new Error(`Ktx2Loader: get_header rc=${rc}`)
    const header: Ktx2Header = readKtx2Header(memory, headerPtr)

    if (!header.isEtc1s && !header.isUastc) {
      // UASTC HDR is signaled via isHdr; ETC1S/UASTC are LDR. We don't
      // support raw KTX2 (vkFormat ≠ UNDEFINED) — those would need a
      // separate non-Basis path that we're deferring per the
      // simplification plan. Most callers won't hit this since our
      // encoder always emits Basis-encoded output.
      if (!header.isHdr) {
        throw new Error('Ktx2Loader: only Basis-encoded KTX2 supported (raw vkFormat path is unimplemented)')
      }
    }

    // Determine basis_tex_format ID for selectFormat. Our header carries
    // the value verbatim from basist::ktx2_transcoder.get_basis_tex_format.
    // For the JS-side selection table we condense to ETC1S / UASTC /
    // UASTC_HDR mirroring three's mapping.
    const basisFormat = header.isEtc1s
      ? BasisFormat.ETC1S
      : header.isHdr
        ? BasisFormat.UASTC_HDR
        : BasisFormat.UASTC

    const layerCount = header.layerCount || 1
    const faceCount = header.faceCount

    // Read level 0 info for format selection (alpha + dimensions).
    rc = t.fl_ktx2_get_level_info(transcoder, 0, 0, 0, levelPtr)
    if (rc !== FL_TRANSCODER_E_OK) throw new Error(`Ktx2Loader: get_level_info rc=${rc}`)
    const baseLevel: Ktx2LevelInfo = readKtx2LevelInfo(memory, levelPtr)

    const { transcoderFormat, engineFormat, engineType } = selectFormat(
      basisFormat,
      baseLevel.width,
      baseLevel.height,
      header.hasAlpha,
      caps,
    )

    const bytesPerBlockOrPixel = t.fl_basis_get_bytes_per_block_or_pixel(transcoderFormat)
    const isUncompressed = t.fl_basis_format_is_uncompressed(transcoderFormat) === 1

    if (
      header.levelCount > 0 &&
      (baseLevel.origWidth % 4 !== 0 || baseLevel.origHeight % 4 !== 0)
    ) {
      console.warn(
        'Ktx2Loader: ETC1S and UASTC textures should use multiple-of-four dimensions.',
      )
    }

    const faces: Ktx2Face[] = []

    for (let face = 0; face < faceCount; face++) {
      const mipmaps: Ktx2Mipmap[] = []

      for (let mip = 0; mip < header.levelCount; mip++) {
        // Read this level's info (per face/mip; layer 0 used as
        // representative — all layers share dimensions).
        rc = t.fl_ktx2_get_level_info(transcoder, mip, 0, face, levelPtr)
        if (rc !== FL_TRANSCODER_E_OK) {
          throw new Error(`Ktx2Loader: get_level_info(mip=${mip}, face=${face}) rc=${rc}`)
        }
        const info: Ktx2LevelInfo = readKtx2LevelInfo(memory, levelPtr)

        // For multi-mip textures, three uses orig dimensions; for single
        // base mip, physical dimensions handle non-power-of-two sources.
        // See three.js issue #25908 for the rationale.
        const reportedWidth = header.levelCount > 1 ? info.origWidth : info.width
        const reportedHeight = header.levelCount > 1 ? info.origHeight : info.height

        // Concatenate all layers for this (mip, face) into one contiguous buffer
        // so three's CompressedArrayTexture sees stride-correct input.
        const sizeUnits = isUncompressed
          ? info.width * info.height
          : info.totalBlocks
        const bytesPerLayer = sizeUnits * bytesPerBlockOrPixel
        const totalBytes = bytesPerLayer * layerCount

        // Single allocation per (mip, face). The buffer is sliced out of
        // wasm memory (.slice() on the typed array copies into a new
        // ArrayBuffer that we own + can transfer).
        const concatenated = new Uint8Array(totalBytes)

        for (let layer = 0; layer < layerCount; layer++) {
          const dstPtr = t.fl_transcoder_alloc(bytesPerLayer)
          if (dstPtr === 0) throw new Error(`Ktx2Loader: alloc(${bytesPerLayer}) failed`)
          try {
            rc = t.fl_ktx2_transcode_level(
              transcoder,
              mip,
              layer,
              face,
              transcoderFormat,
              dstPtr,
              sizeUnits,
              0, // decode_flags
            )
            if (rc !== FL_TRANSCODER_E_OK) {
              throw new Error(`Ktx2Loader: transcode_level rc=${rc} (mip=${mip}, layer=${layer}, face=${face})`)
            }
            // Copy out of wasm memory before any subsequent alloc could
            // grow + relocate it.
            concatenated.set(
              new Uint8Array(memory.buffer, dstPtr, bytesPerLayer),
              layer * bytesPerLayer,
            )
          } finally {
            t.fl_transcoder_free(dstPtr)
          }
        }

        // HDR formats deliver float16 data; expose as Uint16Array so three
        // wires up the right pixel-pack path.
        const data: Uint8Array | Uint16Array =
          engineType === HalfFloatType
            ? new Uint16Array(concatenated.buffer, 0, concatenated.byteLength / 2)
            : concatenated

        mipmaps.push({ data, width: reportedWidth, height: reportedHeight })
      }

      faces.push({ mipmaps })
    }

    return {
      faces,
      width: baseLevel.width,
      height: baseLevel.height,
      origWidth: baseLevel.origWidth,
      origHeight: baseLevel.origHeight,
      layerCount,
      faceCount,
      format: engineFormat,
      type: engineType,
      hasAlpha: header.hasAlpha,
      dfdFlags: header.dfdFlags,
      dfdColorModel: header.dfdColorModel,
      dfdTransferFunc: header.dfdTransferFunc,
    }
  } finally {
    t.fl_transcoder_free(headerPtr)
    t.fl_transcoder_free(levelPtr)
    t.fl_ktx2_transcoder_destroy(transcoder)
    t.fl_transcoder_free(inputPtr)
  }
}

// Helper: extract transferable buffers from a result for postMessage.
export function transferablesOf(result: Ktx2TranscodeResult): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  for (const face of result.faces) {
    for (const mip of face.mipmaps) {
      buffers.push(mip.data.buffer as ArrayBuffer)
    }
  }
  return buffers
}
