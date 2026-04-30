import type { MergeResult } from '@three-flatland/io/atlas'
import type { MergeState } from './mergeStore'

// Composite each source frame onto a fresh OffscreenCanvas at its packed
// position. Returns a PNG-encoded Blob ready for ObjectURL or shipping
// to the host for write.
export async function compositePngBlob(
  result: Extract<MergeResult, { kind: 'ok' }>,
  sources: MergeState['sources'],
): Promise<Blob | null> {
  const { atlas, placements } = result
  const canvas = new OffscreenCanvas(atlas.meta.size.w, atlas.meta.size.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Decode each unique source image once.
  const bitmapByUri = new Map<string, ImageBitmap>()
  for (const src of sources) {
    if (bitmapByUri.has(src.uri)) continue
    const res = await fetch(src.imageUri)
    bitmapByUri.set(src.uri, await createImageBitmap(await res.blob()))
  }
  for (const p of placements) {
    const bmp = bitmapByUri.get(p.sourceUri)
    if (!bmp) continue
    ctx.drawImage(
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
  return await canvas.convertToBlob({ type: 'image/png' })
}
