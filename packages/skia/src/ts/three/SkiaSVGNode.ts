import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaSVG } from '../svg'
import { SkiaNode } from './SkiaNode'

export class SkiaSVGNode extends SkiaNode {
  svg: SkiaSVG | null = null
  x = 0
  y = 0
  svgWidth?: number
  svgHeight?: number

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    if (!this.svg) return
    ctx.save()
    if (this.x || this.y) ctx.translate(this.x, this.y)
    if (this.svgWidth && this.svgHeight) this.svg.setSize(this.svgWidth, this.svgHeight)
    ctx.drawSVG(this.svg)
    ctx.restore()
  }
}
