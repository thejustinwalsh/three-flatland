/// <reference lib="webworker" />

// Off-main-thread atlas compositor. Receives source PNG blobs + the
// merge result's `placements` array, decodes each unique source via
// `createImageBitmap` (already off-main-thread), draws every placement
// onto an OffscreenCanvas, and encodes the final PNG. Returns the
// encoded Blob — structured-cloneable, no copy on receive.
//
// Decoupled from main-thread because PNG encoding for a 4096² atlas
// can spike to 50–200ms; running it here keeps the React tree
// responsive during the user's edits.

type Placement = {
  sourceUri: string
  srcRect: { x: number; y: number; w: number; h: number }
  dstRect: { x: number; y: number; w: number; h: number }
}

type CompositeRequest = {
  id: number
  width: number
  height: number
  placements: ReadonlyArray<Placement>
  // Map of source URI to its raw image bytes. Blobs are structurally
  // cloneable cheaply (reference-based — bytes aren't copied).
  sources: ReadonlyArray<{ uri: string; blob: Blob }>
}

type CompositeResponse =
  | { id: number; blob: Blob }
  | { id: number; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (e: MessageEvent<CompositeRequest>) => {
  const { id, width, height, placements, sources } = e.data
  try {
    const canvas = new OffscreenCanvas(width, height)
    const c2d = canvas.getContext('2d')
    if (!c2d) throw new Error('OffscreenCanvas 2D context unavailable in worker')

    // Decode each unique source image once.
    const bitmapByUri = new Map<string, ImageBitmap>()
    for (const src of sources) {
      if (bitmapByUri.has(src.uri)) continue
      bitmapByUri.set(src.uri, await createImageBitmap(src.blob))
    }

    for (const p of placements) {
      const bmp = bitmapByUri.get(p.sourceUri)
      if (!bmp) continue
      c2d.drawImage(
        bmp,
        p.srcRect.x,
        p.srcRect.y,
        p.srcRect.w,
        p.srcRect.h,
        p.dstRect.x,
        p.dstRect.y,
        p.dstRect.w,
        p.dstRect.h,
      )
    }
    for (const bmp of bitmapByUri.values()) bmp.close()

    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const response: CompositeResponse = { id, blob }
    ctx.postMessage(response)
  } catch (err) {
    const response: CompositeResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    ctx.postMessage(response)
  }
}
