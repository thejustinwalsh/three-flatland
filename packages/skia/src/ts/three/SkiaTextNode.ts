import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaFont } from '../font'
import { SkiaNode } from './SkiaNode'

export class SkiaTextNode extends SkiaNode {
  text = ''
  x = 0
  y = 0
  font: SkiaFont | null = null

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    if (!this.font || !this.text) return
    ctx.drawText(this.text, this.x, this.y, this.font, this._resolvePaint(skia))
  }
}
