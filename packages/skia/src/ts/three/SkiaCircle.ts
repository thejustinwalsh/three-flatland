import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'

export class SkiaCircle extends SkiaNode {
  cx = 0
  cy = 0
  r = 50

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    ctx.drawCircle(this.cx, this.cy, this.r, this._resolvePaint(skia))
  }
}
