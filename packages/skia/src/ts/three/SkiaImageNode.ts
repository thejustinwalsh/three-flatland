import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaImage } from '../image'
import { SkiaNode } from './SkiaNode'

/**
 * Draw a raster image on the canvas.
 */
export class SkiaImageNode extends SkiaNode {
  image: SkiaImage | null = null
  x = 0
  y = 0
  /** Source rect for cropping [x, y, w, h] — if set, uses drawImageRect */
  src?: [number, number, number, number]
  /** Destination rect for scaling [x, y, w, h] — if set, uses drawImageRect */
  dst?: [number, number, number, number]

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    if (!this.image) return
    const paint = this._resolvePaint(skia)

    if (this.src && this.dst) {
      ctx.drawImageRect(this.image, this.src, this.dst, paint)
    } else if (this.dst) {
      const src: [number, number, number, number] = [0, 0, this.image.width, this.image.height]
      ctx.drawImageRect(this.image, src, this.dst, paint)
    } else {
      ctx.drawImage(this.image, this.x, this.y, paint)
    }
  }
}
