/// <reference lib="webworker" />

// Off-main-thread image decoder. Receives an `ImageBitmap` (transferred
// from the caller, so it leaves main thread immediately) plus a
// correlation `id`, and posts back the decoded `ImageData`. Both the
// drawImage copy into the OffscreenCanvas and the subsequent
// getImageData readback execute on this worker thread, so the main
// thread never spends time on pixel data — even for multi-megapixel
// atlases. The returned ImageData buffer is transferred back, so no
// copy on the receive side either.

type DecodeRequest = { id: number; bitmap: ImageBitmap }
type DecodeResponse =
  | { id: number; data: ImageData }
  | { id: number; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<DecodeRequest>) => {
  const { id, bitmap } = e.data
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const c2d = canvas.getContext('2d')
    if (!c2d) throw new Error('2D context unavailable in worker')
    c2d.drawImage(bitmap, 0, 0)
    const data = c2d.getImageData(0, 0, bitmap.width, bitmap.height)
    bitmap.close()
    const response: DecodeResponse = { id, data }
    ctx.postMessage(response, [data.data.buffer])
  } catch (err) {
    const response: DecodeResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    ctx.postMessage(response)
  }
}
