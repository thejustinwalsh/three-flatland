import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaPath } from '../path'
import type { SkiaPaint } from '../paint'
import type { SkiaImageFilter } from '../image-filter'
import type { SkiaColorFilter } from '../color-filter'
import { SkiaPaint as SkiaPaintClass } from '../paint'
import { SkiaNode } from './SkiaNode'

/**
 * Skia group — transform, clip, opacity, and filter container.
 *
 * Children are drawn within this group's context. If `imageFilter`, `colorFilter`,
 * `layer`, or `opacity < 1` is set, children are rendered into an offscreen layer
 * (via `saveLayer`) and the filter/opacity is applied when compositing back.
 *
 * This matches react-native-skia's `<Group layer={paint}>` pattern.
 *
 * ```tsx
 * <skiaGroup imageFilter={SkiaImageFilter.blur(skia, 4, 4)}>
 *   <skiaRect fill={[1,0,0,1]} />  // blurred
 *   <skiaCircle fill={[0,1,0,1]} /> // also blurred
 * </skiaGroup>
 * ```
 */
export class SkiaGroup extends SkiaNode {
  tx = 0
  ty = 0
  skiaRotate = 0
  scaleSkiaX = 1
  scaleSkiaY = 1
  clipRect: [number, number, number, number] | null = null
  clipRoundRect: { x: number; y: number; w: number; h: number; rx: number; ry: number } | null = null
  clipPath: SkiaPath | null = null

  /** Explicit layer paint — full control over saveLayer behavior */
  layer: SkiaPaint | null = null
  /** Convenience: image filter applied to children via saveLayer */
  imageFilter: SkiaImageFilter | null = null
  /** Convenience: color filter applied to children via saveLayer */
  colorFilter: SkiaColorFilter | null = null

  private _layerPaint: SkiaPaint | null = null

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    const needsLayer = this.layer || this.imageFilter || this.colorFilter || this.opacity < 1

    if (needsLayer) {
      const layerPaint = this._resolveLayerPaint(skia)
      ctx.saveLayer(undefined, layerPaint)
    } else {
      ctx.save()
    }

    if (this.tx !== 0 || this.ty !== 0) ctx.translate(this.tx, this.ty)
    if (this.skiaRotate) ctx.rotate(this.skiaRotate)
    if (this.scaleSkiaX !== 1 || this.scaleSkiaY !== 1) ctx.scale(this.scaleSkiaX, this.scaleSkiaY)
    if (this.clipRect) ctx.clipRect(...this.clipRect)
    if (this.clipRoundRect) {
      const cr = this.clipRoundRect
      ctx.clipRoundRect(cr.x, cr.y, cr.w, cr.h, cr.rx, cr.ry)
    }
    if (this.clipPath) ctx.clipPath(this.clipPath)

    for (const child of this.children) {
      if (!child.visible) continue
      if ('_draw' in child) {
        (child as SkiaNode)._draw(ctx, skia)
      }
    }

    ctx.restore()
  }

  private _resolveLayerPaint(skia: SkiaContext): SkiaPaint {
    if (this.layer) return this.layer

    if (!this._layerPaint) {
      this._layerPaint = new SkiaPaintClass(skia)
    }

    const p = this._layerPaint
    if (this.opacity < 1) p.setAlpha(this.opacity)
    if (this.imageFilter) p.setImageFilter(this.imageFilter)
    if (this.colorFilter) p.setColorFilter(this.colorFilter)

    return p
  }

  dispose(): void {
    super.dispose()
    this._layerPaint?.dispose()
    this._layerPaint = null
  }
}
