// Long-lived worker that owns the wasm encoder. Receives wasm bytes via
// the init postMessage (main thread fetches them once + transfers them
// in), then handles encode requests using the cached exports. Mirrors
// loaders/ktx2-worker.ts for transcode side.
//
// Why init-with-bytes (not URL fetch inside worker): when imported via
// `?worker&inline`, this file becomes a base64-encoded blob URL Worker.
// `import.meta.url` inside the worker IS the blob URL — relative URL
// resolution like `new URL('../libs/basis/foo.wasm', import.meta.url)`
// throws "Invalid URL" because blob URLs don't have a sensible base
// path. Bytes via postMessage sidestep that entirely.
//
// Vite's `?worker&inline` plugin walks this file's import graph and
// inlines `encodeKtx2WithExports`, `instantiateBasis`, etc. into a
// single self-contained chunk — CSP-friendly under VSCode webview's
// `worker-src blob:` rule.

/// <reference lib="webworker" />

import { encodeKtx2WithExports, type Ktx2Options } from '../codecs/ktx2.js'
import { instantiateBasis, type BasisExports } from './basis-runtime.js'

interface InitRequest {
  type: 'init'
  wasmBytes: ArrayBuffer
}
interface EncodeKtx2Request {
  type: 'encode-ktx2'
  id: number
  // ImageData is structured-cloneable across thread boundaries.
  image: ImageData
  opts: Ktx2Options
}
type WorkerRequest = InitRequest | EncodeKtx2Request

const scope = self as unknown as DedicatedWorkerGlobalScope

let exportsPromise: Promise<BasisExports> | null = null
// Promise-chain queue: serializes encodes through the single wasm
// encoder instance (basisu::basis_compressor isn't reentrant).
let busy: Promise<void> = Promise.resolve()

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'init') {
    exportsPromise = instantiateBasis(msg.wasmBytes)
    exportsPromise.catch((err: unknown) => {
      scope.postMessage({
        type: 'init-error',
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return
  }
  if (msg.type !== 'encode-ktx2') return

  busy = busy.then(async () => {
    try {
      if (!exportsPromise) throw new Error('basis-encoder-worker: encode before init')
      const exports = await exportsPromise
      const out = await encodeKtx2WithExports(msg.image, msg.opts, exports)
      // Transfer the encoded bytes back; main thread becomes the new owner.
      scope.postMessage(
        { type: 'encode-done', id: msg.id, bytes: out },
        [out.buffer as ArrayBuffer],
      )
    } catch (err) {
      scope.postMessage({
        type: 'encode-error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
})
