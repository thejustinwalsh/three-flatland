import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'

export class SkiaLine extends SkiaNode {
  x1 = 0
  y1 = 0
  x2 = 100
  y2 = 100

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    ctx.drawLine(this.x1, this.y1, this.x2, this.y2, this._resolvePaint(skia))
  }
}
