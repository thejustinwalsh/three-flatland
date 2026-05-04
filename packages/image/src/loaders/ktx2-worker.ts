// Long-lived worker that owns the wasm transcoder. Receives KTX2 bytes
// from the main thread (transferred), runs the full transcode pipeline,
// posts mipmap data back as transferable ArrayBuffers.
//
// Imported by Ktx2Loader.ts via `import('./ktx2-worker.js?worker&inline')`.
// Vite recognizes that query, walks this file's import graph, and bundles
// everything into a single base64-encoded blob URL Worker constructor —
// CSP-friendly under VSCode webview's `worker-src blob:` rule.
//
// At runtime inside the worker, transcoder-loader.ts fetches the wasm via
// `new URL('../../libs/basis/basis_transcoder.wasm', import.meta.url)`.
// In a Vite-bundled worker chunk, that URL resolves to the dist'd asset
// path; in source mode (vitest, dev), Vite's worker plugin handles
// it the same way. No bytes go over postMessage — the worker fetches its
// own wasm, just like any other module worker.

/// <reference lib="webworker" />

import { transcodeKtx2, transferablesOf, type Ktx2Capabilities } from './ktx2-transcode.js'

interface TranscodeRequest {
  type: 'transcode'
  id: number
  buffer: ArrayBuffer
  caps: Ktx2Capabilities
}
type WorkerRequest = TranscodeRequest

const scope = self as unknown as DedicatedWorkerGlobalScope

// Promise-chain queue: messages arrive in order, the chain serializes
// transcodes. The wasm transcoder isn't internally reentrant; queueing
// keeps the implementation simple while preserving response ordering.
let busy: Promise<void> = Promise.resolve()

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type !== 'transcode') return

  busy = busy.then(async () => {
    try {
      const result = await transcodeKtx2(msg.buffer, msg.caps)
      scope.postMessage({ type: 'transcode-done', id: msg.id, result }, transferablesOf(result))
    } catch (err) {
      scope.postMessage({
        type: 'transcode-error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
})
