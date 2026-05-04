// Long-lived worker that owns the wasm transcoder. Receives KTX2 bytes
// from the main thread (transferred), runs the full transcode pipeline,
// posts mipmap data back as transferable ArrayBuffers.
//
// Loaded by Ktx2Loader.ts via `new Worker(new URL('./ktx2-worker.js',
// import.meta.url), { type: 'module' })`. Vite/Rollup recognize this
// pattern and split it into its own chunk; the main thread never imports
// `transcoder-loader.ts` (and therefore never instantiates the wasm).

/// <reference lib="webworker" />

import { transcodeKtx2, transferablesOf, type Ktx2Capabilities } from './ktx2-transcode.js'

interface TranscodeRequest {
  type: 'transcode'
  id: number
  buffer: ArrayBuffer
  caps: Ktx2Capabilities
}

type WorkerRequest = TranscodeRequest

// Promise-chain queue: messages arrive in order, the chain serializes
// transcodes. The wasm transcoder isn't internally reentrant; queueing
// keeps the implementation simple while preserving response ordering.
let busy: Promise<void> = Promise.resolve()

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type !== 'transcode') return

  busy = busy.then(async () => {
    try {
      const result = await transcodeKtx2(msg.buffer, msg.caps)
      // Transfer all mipmap ArrayBuffers back to the main thread. They
      // detach in worker scope on send.
      ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(
        { type: 'transcode-done', id: msg.id, result },
        transferablesOf(result),
      )
    } catch (err) {
      ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({
        type: 'transcode-error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
})
