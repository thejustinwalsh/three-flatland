// Long-lived worker that owns the wasm transcoder. Receives wasm bytes
// via the init postMessage (main thread fetches them once + transfers
// them in), then handles transcode requests using the cached exports.
//
// Why init protocol + not URL fetch inside the worker: this file is
// imported via `?worker&inline` which produces a blob URL Worker. Inside
// that worker, `import.meta.url` IS the blob URL — relative URL
// resolution like `new URL('../libs/basis/foo.wasm', import.meta.url)`
// throws "Invalid URL" because blob URLs don't have a sensible base
// path. Sending the bytes from the main thread sidesteps this entirely
// and matches how three's KTX2Loader bootstraps its worker.
//
// Vite's `?worker&inline` plugin walks this file's import graph and
// inlines `transcodeKtx2WithExports`, `instantiateTranscoder`, and the
// rest of their reachable deps into a single self-contained chunk —
// CSP-friendly under VSCode webview's `worker-src blob:` rule.

/// <reference lib="webworker" />

import {
  transcodeKtx2WithExports,
  transferablesOf,
  type Ktx2Capabilities,
} from './ktx2-transcode.js'
import { instantiateTranscoder, type TranscoderExports } from '../runtime/transcoder-loader.js'

interface InitRequest {
  type: 'init'
  wasmBytes: ArrayBuffer
}
interface TranscodeRequest {
  type: 'transcode'
  id: number
  buffer: ArrayBuffer
  caps: Ktx2Capabilities
}
type WorkerRequest = InitRequest | TranscodeRequest

const scope = self as unknown as DedicatedWorkerGlobalScope

let exportsPromise: Promise<TranscoderExports> | null = null
// Promise-chain queue: messages arrive in order, the chain serializes
// transcodes. The wasm transcoder isn't internally reentrant; queueing
// keeps the implementation simple while preserving response ordering.
let busy: Promise<void> = Promise.resolve()

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'init') {
    // Caller transferred the wasm bytes — they're now owned by this worker.
    // Module-level promise shared across every subsequent transcode.
    exportsPromise = instantiateTranscoder(msg.wasmBytes)
    // Surface init failures eagerly so the caller's first transcode rejects
    // cleanly rather than hanging on the queue.
    exportsPromise.catch((err: unknown) => {
      scope.postMessage({
        type: 'init-error',
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return
  }
  if (msg.type !== 'transcode') return

  busy = busy.then(async () => {
    try {
      if (!exportsPromise) throw new Error('ktx2-worker: received transcode before init')
      const exports = await exportsPromise
      const result = await transcodeKtx2WithExports(msg.buffer, msg.caps, exports)
      scope.postMessage(
        { type: 'transcode-done', id: msg.id, result },
        transferablesOf(result),
      )
    } catch (err) {
      scope.postMessage({
        type: 'transcode-error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
})
