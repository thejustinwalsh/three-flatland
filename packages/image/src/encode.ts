import type { ImageEncodeOptions } from './types.js'
import type { Ktx2Options } from './codecs/ktx2.js'
import { encodePng } from './codecs/png.js'
import { encodeWebp } from './codecs/webp.js'
import { encodeAvif } from './codecs/avif.js'
import { encodeKtx2 } from './codecs/ktx2.js'
// `basis-loader` is dynamically imported at the call site below (not
// statically imported) so its module — and the wasm URL it owns — can
// move into a separate chunk. `codecs/ktx2.ts` already dynamic-imports
// the same module; if encode.ts were to static-import it too, Vite
// can't split it out and warns about the conflict.

// ─── KTX2 encoder worker — auto-routed off main thread ───────────────────────
//
// KTX2 is the slow encode path (2-5s for ETC1S on a 2048² texture). Running
// inline blocks the main thread end-to-end: the React loading state set just
// before the encode never paints because the wasm work blocks before the
// next tick, and slider/zoom/pan all freeze for the duration.
//
// Mirrors the Ktx2Loader worker pattern: lazy-spawn one worker via Vite's
// `?worker&inline` (CSP-friendly blob URL Worker), bootstrap with wasm
// bytes via init postMessage, dispatch encode requests through it.
//
// PNG/WebP/AVIF stay inline — they're sub-second through jsquash and any
// would benefit less from a worker round-trip than from their internal
// jsquash threading (avif_enc_mt already uses workers under the hood).

interface PendingEncode {
  resolve: (bytes: Uint8Array) => void
  reject: (err: Error) => void
}

interface EncodeDoneMsg {
  type: 'encode-done'
  id: number
  bytes: Uint8Array
}
interface EncodeErrorMsg {
  type: 'encode-error'
  id: number
  message: string
}
interface InitErrorMsg {
  type: 'init-error'
  message: string
}
type WorkerResponse = EncodeDoneMsg | EncodeErrorMsg | InitErrorMsg

let workerPromise: Promise<Worker> | null = null
let nextId = 0
const pending = new Map<number, PendingEncode>()

function onWorkerMessage(e: MessageEvent<WorkerResponse>): void {
  const msg = e.data
  if (msg.type === 'init-error') {
    // Reject every pending — encoder will never come up.
    const err = new Error(`basis-encoder-worker init failed: ${msg.message}`)
    for (const h of pending.values()) h.reject(err)
    pending.clear()
    workerPromise = null
    return
  }
  const handlers = pending.get(msg.id)
  if (!handlers) return
  pending.delete(msg.id)
  if (msg.type === 'encode-done') handlers.resolve(msg.bytes)
  else handlers.reject(new Error(msg.message))
}

function onWorkerError(_e: ErrorEvent): void {
  const err = new Error('basis-encoder-worker crashed')
  for (const h of pending.values()) h.reject(err)
  pending.clear()
  workerPromise = null
}

async function getOrCreateEncoderWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Vite's `?worker&inline` returns a blob URL Worker constructor.
      // Bundlers that don't recognize the syntax will throw — caller's
      // try/catch falls back to inline encode.
      const mod = await import('./runtime/basis-encoder-worker.js?worker&inline')
      const WorkerCtor = (mod as { default: new () => Worker }).default
      const w = new WorkerCtor()
      w.addEventListener('message', onWorkerMessage)
      w.addEventListener('error', onWorkerError)
      // Bootstrap: fetch wasm on main thread (where import.meta.url
      // resolves to a real URL), transfer to worker via init.
      const { fetchBasisBytes } = await import('./runtime/basis-loader.js')
      const wasmBytes = await fetchBasisBytes()
      w.postMessage({ type: 'init', wasmBytes }, [wasmBytes])
      return w
    })()
  }
  return workerPromise
}

async function encodeKtx2ViaWorker(image: ImageData, opts: Ktx2Options): Promise<Uint8Array> {
  const worker = await getOrCreateEncoderWorker()
  const id = nextId++
  return new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    // ImageData itself is structured-clone-friendly. We don't transfer
    // the underlying buffer because the caller (encodePipeline) reuses
    // sourceImage across many encodes — detaching it would break the
    // next call and the inline fallback.
    worker.postMessage({ type: 'encode-ktx2', id, image, opts })
  })
}

export async function encodeImage(pixels: ImageData, opts: ImageEncodeOptions): Promise<Uint8Array> {
  switch (opts.format) {
    case 'png':  return encodePng(pixels)
    case 'webp': return encodeWebp(pixels, { quality: opts.quality, mode: opts.mode })
    case 'avif': return encodeAvif(pixels, { quality: opts.quality, mode: opts.mode })
    case 'ktx2': {
      const ktx2Opts: Ktx2Options = opts.basis ?? {}
      // Worker path: keeps main thread responsive during the 2-5s encode
      // so the loading-state spinner + slider/zoom remain interactive.
      // Falls back to inline if Worker unavailable (Node, no DOM) or if
      // the bundler doesn't recognize `?worker&inline`.
      if (typeof Worker !== 'undefined') {
        try {
          return await encodeKtx2ViaWorker(pixels, ktx2Opts)
        } catch (err) {
          workerPromise = null
          console.warn('basis-encoder-worker path failed, falling back to inline encode:', err)
        }
      }
      return encodeKtx2(pixels, ktx2Opts)
    }
    default:
      throw new Error(`unknown format: ${(opts as { format: string }).format}`)
  }
}
