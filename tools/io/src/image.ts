/**
 * Decode a PNG/WebP/AVIF Blob/ArrayBuffer to `ImageData` via `createImageBitmap`.
 * Browser-only — relies on the DOM. Node callers must use a separate decode path.
 */
export async function decodeImageData(source: Blob | ArrayBuffer | Uint8Array): Promise<ImageData> {
  const blob = toBlob(source)
  const bmp = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for decode')
  ctx.drawImage(bmp, 0, 0)
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height)
  bmp.close()
  return data
}

/** Fetch an image URI into an HTMLImageElement (suitable as a texture source). */
export function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image at ${uri}`))
    img.src = uri
  })
}

function toBlob(source: Blob | ArrayBuffer | Uint8Array): Blob {
  if (source instanceof Blob) return source
  if (source instanceof Uint8Array) {
    return new Blob([source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer])
  }
  return new Blob([source])
}
