import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'

export class SkiaOval extends SkiaNode {
  x = 0
  y = 0
  width = 100
  height = 50

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    ctx.drawOval(this.x, this.y, this.width, this.height, this._resolvePaint(skia))
  }
}
