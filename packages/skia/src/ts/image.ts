import type { SkiaContext } from './context'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia image — raster image for drawing on canvas.
 *
 * Create from raw RGBA pixel data. For loading images from URLs in the browser,
 * use the browser's native `createImageBitmap()` + canvas to get pixel data,
 * then pass it here.
 *
 * ```ts
 * // From raw pixels (width * height * 4 bytes, RGBA premultiplied)
 * const image = SkiaImage.fromPixels(skia, pixelData, 256, 256)
 * ctx.drawImage(image, 10, 10)
 * image.dispose()
 * ```
 */
export class SkiaImage {
  /** @internal */
  _handle: number
  readonly width: number
  readonly height: number
  private readonly _ctx: SkiaContext

  private constructor(context: SkiaContext, handle: number, width: number, height: number) {
    this._ctx = context
    this._handle = handle
    this.width = width
    this.height = height
    registry.register(this, { handle, drop: (h: number) => context._exports.skia_image_destroy(h) }, this)
  }

  /**
   * Create an image from raw RGBA pixel data.
   * @param pixels - Uint8Array of RGBA premultiplied pixels (width * height * 4 bytes)
   * @param width - Image width
   * @param height - Image height
   */
  static fromPixels(context: SkiaContext, pixels: Uint8Array, width: number, height: number): SkiaImage | null {
    if (pixels.length < width * height * 4) throw new Error('Pixel buffer too small')
    const [ptr] = context._writeBytes(pixels)
    const h = context._exports.skia_image_from_pixels(ptr, width, height)
    return h ? new SkiaImage(context, h, width, height) : null
  }

  /**
   * Load an image from a URL using the browser's native image decoder.
   * No image codecs compiled into WASM — the browser handles decoding.
   */
  static async fromURL(context: SkiaContext, url: string): Promise<SkiaImage | null> {
    const response = await fetch(url)
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)

    // Draw to offscreen canvas to get raw RGBA pixels
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx2d = canvas.getContext('2d')!
    ctx2d.drawImage(bitmap, 0, 0)
    const imageData = ctx2d.getImageData(0, 0, bitmap.width, bitmap.height)
    bitmap.close()

    return SkiaImage.fromPixels(context, new Uint8Array(imageData.data.buffer), bitmap.width, bitmap.height)
  }

  /** Read the image pixels as RGBA data. Returns null on failure. */
  readPixels(): Uint8Array | null {
    const size = this.width * this.height * 4
    const outPtr = this._ctx._exports.cabi_realloc(0, 0, 1, size)
    const ok = this._ctx._exports.skia_image_read_pixels(this._handle, outPtr, this.width, this.height)
    if (!ok) return null
    return new Uint8Array(this._ctx._memory.buffer.slice(outPtr, outPtr + size))
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_image_destroy(this._handle)
      this._handle = 0
    }
  }
}
