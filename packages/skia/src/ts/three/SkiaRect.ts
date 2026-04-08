import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'

export class SkiaRect extends SkiaNode {
  x = 0
  y = 0
  width = 100
  height = 100
  cornerRadius = 0

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    const paint = this._resolvePaint(skia)
    if (this.cornerRadius > 0) {
      ctx.drawRoundRect(this.x, this.y, this.width, this.height, this.cornerRadius, this.cornerRadius, paint)
    } else {
      ctx.drawRect(this.x, this.y, this.width, this.height, paint)
    }
  }
}
