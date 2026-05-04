/**
 * Ktx2Loader — three-flatland's owned KTX2 loader.
 *
 * Originally adapted from three.js r0.183.1 KTX2Loader (MIT, © 2010-2024
 * three.js authors). Phase 2.1.2 simplified it heavily:
 *
 * - One long-lived Worker (no pool); falls back to inline main-thread
 *   transcode when Worker is unavailable (Node, vitest).
 * - Transcoder runs inside the worker. Main thread never instantiates
 *   the wasm, never sees transcoder-loader.js — the worker owns it.
 * - Uses our `@three-flatland/image` zig-built basis_transcoder.wasm
 *   instead of three's vendored transcoder.
 * - Only Basis-encoded KTX2 (ETC1S / UASTC / UASTC HDR). Raw KTX2 paths
 *   (vkFormat≠UNDEFINED, ZSTD supercompression) deferred — re-add behind
 *   a flag if needed.
 * - 2D, cubemap (faceCount=6), and array (layerCount>1) textures all
 *   supported.
 *
 * TODO(future-pass-on-recovery): mipmap CPU copies are currently retained
 * for device-lost recovery (three's standard texture lifecycle). A later
 * pass on the recovery story may transfer mipmap buffers back to the
 * worker on `texture.dispose()` to offload main-thread GC. Today's
 * `RecoveryDescriptor.url` path also handles recovery via re-fetch +
 * re-transcode, so this optimization is a performance refinement, not a
 * correctness requirement. See `.library/three-flatland/loader-architecture.md`.
 */

import {
  CompressedArrayTexture,
  CompressedCubeTexture,
  CompressedTexture,
  FileLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Loader,
  NoColorSpace,
  SRGBColorSpace,
} from 'three'
import type { LoadingManager } from 'three'

import {
  transcodeKtx2,
  type Ktx2Capabilities,
  type Ktx2TranscodeResult,
} from './ktx2-transcode.js'
import { fetchTranscoderBytes } from '../runtime/transcoder-loader.js'

// KHR Data Format Descriptor constants from the KTX2 spec.
const KHR_DF_TRANSFER_SRGB = 2
const KHR_DF_FLAG_ALPHA_PREMULTIPLIED = 1

// Worker message types — keep in sync with ktx2-worker.ts.
interface TranscodeDone {
  type: 'transcode-done'
  id: number
  result: Ktx2TranscodeResult
}
interface TranscodeError {
  type: 'transcode-error'
  id: number
  message: string
}
type WorkerResponse = TranscodeDone | TranscodeError

// Three's @types narrow the generic on CompressedTexture vs CompressedArrayTexture
// (the array variant accepts `CompressedTextureImageData[]` per layer);
// widening here so the union can hold any of the three variants without
// per-call casts at consumer code.
type AnyCompressedTexture =
  | CompressedTexture
  | CompressedCubeTexture
  | InstanceType<typeof CompressedArrayTexture>

class Ktx2Loader extends Loader<AnyCompressedTexture> {
  private workerConfig: Ktx2Capabilities | null = null
  private workerPromise: Promise<Worker> | null = null
  private nextId = 0
  private pending = new Map<
    number,
    { resolve: (r: Ktx2TranscodeResult) => void; reject: (e: Error) => void }
  >()

  constructor(manager?: LoadingManager) {
    super(manager)
  }

  /**
   * Detects hardware support for compressed texture formats. Must be
   * called with a renderer before `load()` / `parse()` so we can pick a
   * transcoder target the GPU can actually upload.
   *
   * Accepts WebGLRenderer or WebGPURenderer (duck-typed via
   * `isWebGPURenderer`). For renderer-less use (e.g., Node tests), call
   * `setSupportedFormats(...)` instead.
   */
  detectSupport(renderer: { isWebGPURenderer?: boolean } & Record<string, any>): this {
    if (renderer.isWebGPURenderer === true) {
      this.workerConfig = {
        astcSupported: renderer.hasFeature('texture-compression-astc'),
        astcHDRSupported: false, // gpuweb/gpuweb#3856
        etc1Supported: renderer.hasFeature('texture-compression-etc1'),
        etc2Supported: renderer.hasFeature('texture-compression-etc2'),
        dxtSupported: renderer.hasFeature('texture-compression-s3tc'),
        bptcSupported: renderer.hasFeature('texture-compression-bc'),
        pvrtcSupported: renderer.hasFeature('texture-compression-pvrtc'),
      }
      return this
    }

    const exts = renderer.extensions as { has(n: string): boolean; get(n: string): any }
    const caps: Ktx2Capabilities = {
      astcSupported: exts.has('WEBGL_compressed_texture_astc'),
      astcHDRSupported:
        exts.has('WEBGL_compressed_texture_astc') &&
        exts.get('WEBGL_compressed_texture_astc').getSupportedProfiles().includes('hdr'),
      etc1Supported: exts.has('WEBGL_compressed_texture_etc1'),
      etc2Supported: exts.has('WEBGL_compressed_texture_etc'),
      dxtSupported: exts.has('WEBGL_compressed_texture_s3tc'),
      bptcSupported: exts.has('EXT_texture_compression_bptc'),
      pvrtcSupported:
        exts.has('WEBGL_compressed_texture_pvrtc') ||
        exts.has('WEBKIT_WEBGL_compressed_texture_pvrtc'),
    }

    // Linux/Mesa workaround copied from three's KTX2Loader: ETC2 + ASTC
    // are exposed by Mesa drivers but software-decompressed at upload,
    // causing main-thread stalls. Disabling them forces the transcoder
    // to pick BC/uncompressed instead.
    if (
      typeof navigator !== 'undefined' &&
      navigator.platform?.includes('Linux') &&
      navigator.userAgent?.includes('Firefox') &&
      caps.astcSupported &&
      caps.etc2Supported &&
      caps.bptcSupported &&
      caps.dxtSupported
    ) {
      caps.astcSupported = false
      caps.etc2Supported = false
    }

    this.workerConfig = caps
    return this
  }

  /**
   * Bypass renderer-based detection. Useful for inspect-mode (where the
   * renderer is a throwaway) or testing.
   */
  setSupportedFormats(caps: Ktx2Capabilities): this {
    this.workerConfig = caps
    return this
  }

  load(
    url: string,
    onLoad: (texture: AnyCompressedTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): void {
    if (this.workerConfig === null) {
      throw new Error('Ktx2Loader: call detectSupport() or setSupportedFormats() before load()')
    }
    const fileLoader = new FileLoader(this.manager)
    fileLoader.setPath(this.path)
    fileLoader.setCrossOrigin(this.crossOrigin)
    fileLoader.setWithCredentials(this.withCredentials)
    fileLoader.setRequestHeader(this.requestHeader)
    fileLoader.setResponseType('arraybuffer')
    fileLoader.load(
      url,
      (buffer) => {
        this.parse(buffer as ArrayBuffer)
          .then(onLoad)
          .catch(onError ?? ((err) => console.error('Ktx2Loader:', err)))
      },
      onProgress,
      onError,
    )
  }

  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<AnyCompressedTexture> {
    return new Promise((resolve, reject) => {
      this.load(url, resolve, onProgress, reject)
    })
  }

  /**
   * Transcode raw KTX2 bytes into a CompressedTexture. The input buffer
   * is transferred to the worker (caller loses ownership).
   */
  async parse(buffer: ArrayBuffer): Promise<AnyCompressedTexture> {
    if (this.workerConfig === null) {
      throw new Error('Ktx2Loader: call detectSupport() or setSupportedFormats() before parse()')
    }
    const result = await this.runTranscode(buffer, this.workerConfig)
    return buildTexture(result)
  }

  private async runTranscode(
    buffer: ArrayBuffer,
    caps: Ktx2Capabilities,
  ): Promise<Ktx2TranscodeResult> {
    // Browser path: lazy-spawn a worker on first use, reuse across calls.
    // The factory creates a CSP-friendly blob URL Worker (works under
    // VSCode webview's `worker-src blob:` rule) and pre-initializes the
    // wasm transcoder before returning.
    if (typeof Worker !== 'undefined') {
      try {
        const worker = await this.getOrCreateWorker()
        return await this.transcodeViaWorker(worker, buffer, caps)
      } catch (err) {
        // If worker creation/use fails (e.g., CSP regression, fetch
        // failure), drop the cached promise so a future parse() retries,
        // and fall through to the inline path so this call still returns
        // a result.
        this.workerPromise = null
        console.warn('Ktx2Loader: worker path failed, falling back to inline transcode:', err)
      }
    }
    // Inline path: Node, vitest, or worker-creation failure. Runs on the
    // calling thread.
    return transcodeKtx2(buffer, caps)
  }

  private async getOrCreateWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        // Vite (and rolldown-based bundlers like the upcoming tsdown) recognize
        // `?worker&inline` and bundle the worker source + all its imports into
        // a base64-encoded blob URL Worker constructor — CSP-friendly under
        // VSCode webview's `worker-src blob:` rule. In source mode (vitest,
        // dev) the same plugin path runs.
        //
        // Bundlers that don't recognize the suffix will throw at module
        // resolution; the caller's try/catch in parse() drops back to the
        // inline transcode path so KTX2 still loads, just on the main thread.
        const mod = await import('./ktx2-worker.js?worker&inline')
        const WorkerCtor = (mod as { default: new () => Worker }).default
        const w = new WorkerCtor()
        w.addEventListener('message', (e: MessageEvent<WorkerResponse>) => this.onWorkerMessage(e))
        w.addEventListener('error', (e) => this.onWorkerError(e))
        // Bootstrap: fetch the wasm bytes on the main thread (where
        // `import.meta.url` resolves to a real URL — inside a `?worker&inline`
        // blob URL Worker, `import.meta.url` IS the blob URL with no valid
        // base path, so URL-relative wasm fetches throw "Invalid URL"). Send
        // bytes via init message; transfer to detach from main thread and
        // hand ownership to the worker.
        const wasmBytes = await fetchTranscoderBytes()
        w.postMessage({ type: 'init', wasmBytes }, [wasmBytes])
        return w
      })()
    }
    return this.workerPromise
  }

  private onWorkerMessage(e: MessageEvent<WorkerResponse>): void {
    const msg = e.data
    const handlers = this.pending.get(msg.id)
    if (!handlers) return
    this.pending.delete(msg.id)
    if (msg.type === 'transcode-done') handlers.resolve(msg.result)
    else handlers.reject(new Error(msg.message))
  }

  private onWorkerError(_e: ErrorEvent): void {
    // Reject all pending — worker is unrecoverable. Drop the cached
    // promise so the next parse() spawns a fresh one.
    const err = new Error('Ktx2Loader: worker crashed')
    for (const h of this.pending.values()) h.reject(err)
    this.pending.clear()
    this.workerPromise = null
  }

  private transcodeViaWorker(
    worker: Worker,
    buffer: ArrayBuffer,
    caps: Ktx2Capabilities,
  ): Promise<Ktx2TranscodeResult> {
    const id = this.nextId++
    return new Promise<Ktx2TranscodeResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      // Note: NO transferable list. We let structured clone copy the
      // KTX2 input buffer so that if the worker rejects (or crashes)
      // and we fall back to inline `transcodeKtx2(buffer, ...)`, the
      // main-thread buffer remains intact. KTX2 inputs are typically a
      // few MB at most; the copy overhead is sub-millisecond. Mipmap
      // results going the other way DO transfer (worker → main, see
      // ktx2-worker.ts) since main thread becomes the new owner.
      worker.postMessage({ type: 'transcode', id, buffer, caps })
    })
  }

  /**
   * Releases the worker (if one was spawned). Pending transcodes reject.
   * Subsequent `parse()` calls spawn a fresh worker on demand.
   */
  dispose(): this {
    if (this.workerPromise) {
      const err = new Error('Ktx2Loader: disposed')
      for (const h of this.pending.values()) h.reject(err)
      this.pending.clear()
      void this.workerPromise.then((w) => w.terminate()).catch(() => {})
      this.workerPromise = null
    }
    return this
  }
}

// ── Texture construction ───────────────────────────────────────────────────

function buildTexture(result: Ktx2TranscodeResult): AnyCompressedTexture {
  const colorSpace = parseColorSpace(result)
  const premultiply = !!(result.dfdFlags & KHR_DF_FLAG_ALPHA_PREMULTIPLIED)
  const minFilter =
    result.faces[0]!.mipmaps.length === 1 ? LinearFilter : LinearMipmapLinearFilter

  let texture: AnyCompressedTexture

  // Three's @types use narrow union enums for format/type that can't see
  // through our numeric pass-through. The runtime accepts any number; we
  // cast to keep the JS contract explicit rather than fight the types.
  const fmt = result.format as never
  const typ = result.type as never

  if (result.faceCount === 6) {
    // Cubemap — three's CompressedCubeTexture takes the array of faces.
    texture = new CompressedCubeTexture(
      result.faces as unknown as CompressedTexture[],
      fmt,
      typ,
    )
  } else if (result.layerCount > 1) {
    texture = new CompressedArrayTexture(
      result.faces[0]!.mipmaps as never,
      result.width,
      result.height,
      result.layerCount,
      fmt,
      typ,
    )
  } else {
    texture = new CompressedTexture(
      result.faces[0]!.mipmaps as never,
      result.width,
      result.height,
      fmt,
      typ,
    ) as CompressedTexture
  }

  texture.minFilter = minFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.colorSpace = colorSpace
  texture.premultiplyAlpha = premultiply
  // KTX2 stores image data origin-bottom-left (OpenGL convention). For
  // compressed formats three's GL backend ignores `flipY` (compressed
  // blocks can't be flipped at upload), so the data stays bottom-up and
  // the consumer flips at sample time. For uncompressed `RGBAFormat`
  // (our caps-all-false fallback), three WOULD honor `flipY = true` at
  // upload — which double-flips when the consumer also V-flips at
  // sample time. Setting it false ensures uniform behavior across
  // compressed + uncompressed: data stays bottom-up, consumer flips.
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}

function parseColorSpace(result: Ktx2TranscodeResult): string {
  // For Basis-encoded KTX2, the color primaries field on the DFD isn't
  // directly exposed by our flat C API (basist::ktx2_transcoder doesn't
  // surface it as a getter). The transfer function IS exposed — that's
  // sufficient to distinguish sRGB-encoded vs linear data, which is what
  // three's color management actually branches on for sprite-style work.
  // BT709 primaries are assumed; Display P3 primaries would need a future
  // C API addition (`fl_ktx2_get_dfd_primaries`) if a real consumer needs
  // it.
  if (result.dfdTransferFunc === KHR_DF_TRANSFER_SRGB) return SRGBColorSpace
  if (result.dfdTransferFunc === 0) return NoColorSpace // unspecified → leave alone
  return LinearSRGBColorSpace
}

export { Ktx2Loader }
export type { Ktx2Capabilities }
