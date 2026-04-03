import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import { SkiaNode } from './SkiaNode'

/**
 * Draw points, connected lines, or a polygon outline.
 */
export class SkiaPointsNode extends SkiaNode {
  /** Flat array of [x, y, x, y, ...] coordinates */
  points: number[] = []
  /** Drawing mode: individual points, connected lines, or closed polygon */
  mode: 'points' | 'lines' | 'polygon' = 'points'

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    if (this.points.length < 2) return
    ctx.drawPoints(this.mode, this.points, this._resolvePaint(skia))
  }
}
