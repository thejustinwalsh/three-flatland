import { type BasisExports } from '../runtime/basis-runtime.js'

export interface Ktx2Options {
  mode?: 'etc1s' | 'uastc'
  quality?: number
  mipmaps?: boolean
  uastcLevel?: 0 | 1 | 2 | 3 | 4
  /**
   * KTX2 supercompression for UASTC. zstd is the default — basisu's
   * UASTC + zstd pipeline yields the smallest basis output at any given
   * quality. Set to `'none'` to opt out (uncommon — typically only for
   * compatibility with consumers that can't decode zstd-supercompressed
   * KTX2). Ignored for ETC1S (basisu refuses to combine zstd with VAQ).
   * The transcoder reads the scheme from the KTX2 header at decode time,
   * so no decode-side setting is needed.
   */
  supercompression?: 'none' | 'zstd'
}

const OPTS_BYTES = 6 * 4 // 6 × uint32

function resolveSupercompression(opts: Ktx2Options): 0 | 1 {
  // ETC1S never uses zstd — basisu rejects the combination, so we always
  // pass 0 regardless of caller intent. For UASTC: explicit `'none'` wins;
  // any other value (including unset) defaults to zstd.
  if (opts.mode !== 'uastc') return 0
  return opts.supercompression === 'none' ? 0 : 1
}

function writeOpts(exports: BasisExports, opts: Ktx2Options): number {
  const ptr = exports.fl_basis_alloc(OPTS_BYTES)
  const view = new DataView(exports.memory.buffer, ptr, OPTS_BYTES)
  view.setUint32(0, opts.mode === 'uastc' ? 1 : 0, true)   // uastc
  view.setUint32(4, opts.mipmaps ? 1 : 0, true)            // mipmaps
  view.setUint32(8, opts.quality ?? 128, true)             // quality
  view.setUint32(12, opts.uastcLevel ?? 2, true)           // uastc_level
  view.setUint32(16, 1, true)                              // check_for_alpha
  view.setUint32(20, resolveSupercompression(opts), true)  // supercompression
  return ptr
}

/**
 * Convenience: lazy-load the wasm encoder + run an encode. Used by the
 * inline (main-thread) path. Worker callers MUST use
 * `encodeKtx2WithExports` after instantiating their own encoder from
 * postMessage'd bytes.
 *
 * `loadBasisWasm` is dynamically imported so this module's static graph
 * stays URL-free — Vite's `?worker&inline` plugin warns when it walks
 * a worker's deps and finds `new URL(..., import.meta.url)` patterns.
 * The worker only uses `encodeKtx2WithExports`; this lazy import
 * ensures the URL-fetching code is never in its graph.
 */
export async function encodeKtx2(image: ImageData, opts: Ktx2Options = {}): Promise<Uint8Array> {
  const { loadBasisWasm } = await import('../runtime/basis-loader.js')
  return encodeKtx2WithExports(image, opts, await loadBasisWasm())
}

/**
 * Run a KTX2/Basis encode against a caller-provided wasm encoder
 * instance. Worker-friendly: the worker holds its own BasisExports
 * (instantiated once at init time) and reuses it across many encodes.
 */
export async function encodeKtx2WithExports(
  image: ImageData,
  opts: Ktx2Options,
  exports: BasisExports,
): Promise<Uint8Array> {
  const w = image.width
  const h = image.height
  const inLen = w * h * 4
  const inPtr = exports.fl_basis_alloc(inLen)
  const optsPtr = writeOpts(exports, opts)
  const outBoxPtr = exports.fl_basis_alloc(8) // [u32 ptr, u32 len]
  const enc = exports.fl_basis_encoder_create()
  if (enc === 0) {
    exports.fl_basis_free(inPtr)
    exports.fl_basis_free(optsPtr)
    exports.fl_basis_free(outBoxPtr)
    throw new Error('fl_basis_encoder_create returned null')
  }
  try {
    new Uint8Array(exports.memory.buffer, inPtr, inLen).set(
      new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength),
    )
    const rc = exports.fl_basis_encode(enc, inPtr, w, h, optsPtr, outBoxPtr, outBoxPtr + 4)
    if (rc !== 0) throw new Error(`fl_basis_encode failed: ${rc}`)
    const view = new DataView(exports.memory.buffer)
    const outPtr = view.getUint32(outBoxPtr, true)
    const outLen = view.getUint32(outBoxPtr + 4, true)
    if (outLen === 0) throw new Error('basis encoder returned 0 bytes')
    // .slice() copies out of wasm linear memory — required because
    // fl_basis_encoder_destroy releases the underlying storage.
    return new Uint8Array(exports.memory.buffer, outPtr, outLen).slice()
  } finally {
    exports.fl_basis_encoder_destroy(enc)
    exports.fl_basis_free(inPtr)
    exports.fl_basis_free(optsPtr)
    exports.fl_basis_free(outBoxPtr)
  }
}
