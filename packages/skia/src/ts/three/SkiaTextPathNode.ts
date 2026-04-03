import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaFont } from '../font'
import type { SkiaPath } from '../path'
import { SkiaPathMeasure } from '../path-measure'
import { SkiaNode } from './SkiaNode'

/**
 * Draw text along a path. Each glyph is positioned and rotated to follow the path.
 */
export class SkiaTextPathNode extends SkiaNode {
  text = ''
  path: SkiaPath | null = null
  font: SkiaFont | null = null
  /** Offset along the path (0 = start) */
  offset = 0

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    if (!this.path || !this.font || !this.text) return

    const pm = new SkiaPathMeasure(skia, this.path)
    const paint = this._resolvePaint(skia)
    const totalLen = pm.length
    let dist = this.offset

    for (const char of this.text) {
      const width = this.font.measureText(char)
      dist += width / 2

      if (dist > totalLen) break

      const pt = pm.getPosTan(dist)
      if (pt) {
        ctx.save()
        ctx.translate(pt.x, pt.y)
        ctx.rotate(Math.atan2(pt.ty, pt.tx) * (180 / Math.PI))
        ctx.drawText(char, -width / 2, 0, this.font, paint)
        ctx.restore()
      }

      dist += width / 2
    }

    pm.dispose()
  }
}
