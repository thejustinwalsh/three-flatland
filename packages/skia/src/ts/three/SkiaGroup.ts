import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaPath } from '../path'
import type { SkiaPaint } from '../paint'
import { SkiaPaint as SkiaPaintClass } from '../paint'
import { Object3D } from 'three'
import type { BlendMode } from '../types'
import { SkiaImageFilter } from '../image-filter'
import { SkiaColorFilter } from '../color-filter'
import { SkiaNode } from './SkiaNode'

/** Drop shadow configuration */
export interface SkiaShadowProps {
  dx: number
  dy: number
  blur: number
  color: number // 0xAARRGGBB
  /** If true, only the shadow is drawn (no content) */
  shadowOnly?: boolean
}

/**
 * Skia group — transform, clip, and effects container.
 *
 * Semantic props for common effects — no Skia internals needed:
 *
 * ```tsx
 * <skiaGroup tx={50} ty={50} blur={4} opacity={0.8}>
 *   <skiaRect fill={[1,0,0,1]} />
 * </skiaGroup>
 *
 * <skiaGroup shadow={{ dx: 4, dy: 4, blur: 3, color: 0x80000000 }}>
 *   <skiaRect fill={[1,1,1,1]} cornerRadius={8} />
 * </skiaGroup>
 *
 * <skiaGroup backdropBlur={10} clipRect={[0,0,200,100]}>
 *   // frosted glass effect
 * </skiaGroup>
 * ```
 */
export class SkiaGroup extends Object3D {
  // ── Transform ──
  tx = 0
  ty = 0
  skiaRotate = 0
  scaleSkiaX = 1
  scaleSkiaY = 1
  skewX = 0
  skewY = 0

  // ── Clip ──
  clipRect: [number, number, number, number] | null = null
  clipRoundRect: { x: number; y: number; w: number; h: number; rx: number; ry: number } | null = null
  clipPath: SkiaPath | null = null

  // ── Semantic effects (trigger saveLayer internally) ──

  /** Opacity of the group as a whole (0-1) */
  opacity = 1
  /** Blend mode for layer compositing */
  blendMode: BlendMode | null = null
  /** Gaussian blur sigma applied to all children as a group */
  blur = 0
  /** Drop shadow on the group's composite shape */
  shadow: SkiaShadowProps | null = null
  /** 4x5 color matrix (20 floats) — grayscale, sepia, hue shift, etc. */
  colorMatrix: number[] | null = null
  /** Gaussian blur of the content BEHIND this group (frosted glass) */
  backdropBlur = 0

  // ── Escape hatch ──

  /** Explicit layer paint — overrides all semantic effect props */
  layer: SkiaPaint | null = null

  private _layerPaint: SkiaPaint | null = null
  private _blurFilter: SkiaImageFilter | null = null
  private _shadowFilter: SkiaImageFilter | null = null
  private _colorFilter: SkiaColorFilter | null = null
  private _backdropFilter: SkiaImageFilter | null = null

  _draw(ctx: SkiaDrawingContext, skia: SkiaContext): void {
    const needsLayer = this.layer || this.blur > 0 || this.shadow || this.colorMatrix ||
                       this.blendMode || this.opacity < 1
    const needsBackdrop = this.backdropBlur > 0

    if (needsBackdrop) {
      this._ensureBackdropFilter(skia)
      const layerPaint = needsLayer ? this._buildLayerPaint(skia) : undefined
      ctx.saveLayerWithBackdrop(undefined, layerPaint, this._backdropFilter!)
    } else if (needsLayer) {
      const layerPaint = this._buildLayerPaint(skia)
      ctx.saveLayer(undefined, layerPaint)
    } else {
      ctx.save()
    }

    // Apply transforms
    if (this.tx !== 0 || this.ty !== 0) ctx.translate(this.tx, this.ty)
    if (this.skiaRotate) ctx.rotate(this.skiaRotate)
    if (this.scaleSkiaX !== 1 || this.scaleSkiaY !== 1) ctx.scale(this.scaleSkiaX, this.scaleSkiaY)
    if (this.skewX !== 0 || this.skewY !== 0) ctx.skew(this.skewX, this.skewY)

    // Apply clips
    if (this.clipRect) ctx.clipRect(...this.clipRect)
    if (this.clipRoundRect) {
      const cr = this.clipRoundRect
      ctx.clipRoundRect(cr.x, cr.y, cr.w, cr.h, cr.rx, cr.ry)
    }
    if (this.clipPath) ctx.clipPath(this.clipPath)

    // Walk children
    for (const child of this.children) {
      if (!child.visible) continue
      if ('_draw' in child) {
        (child as SkiaNode)._draw(ctx, skia)
      }
    }

    ctx.restore()
  }

  private _buildLayerPaint(skia: SkiaContext): SkiaPaint {
    if (this.layer) return this.layer

    if (!this._layerPaint) this._layerPaint = new SkiaPaintClass(skia)
    const p = this._layerPaint

    if (this.opacity < 1) p.setAlpha(this.opacity)

    // Blur — factory handles change detection via `existing` param
    if (this.blur > 0) {
      this._blurFilter = SkiaImageFilter.blur(skia, this.blur, this.blur, undefined, this._blurFilter)
      if (this._blurFilter) p.setImageFilter(this._blurFilter)
    } else if (this._blurFilter) {
      this._blurFilter.dispose()
      this._blurFilter = null
    }

    // Shadow
    if (this.shadow) {
      const s = this.shadow
      const factory = s.shadowOnly ? SkiaImageFilter.dropShadowOnly : SkiaImageFilter.dropShadow
      this._shadowFilter = factory(skia, s.dx, s.dy, s.blur, s.blur, s.color,
        this._blurFilter ?? undefined, this._shadowFilter)
      if (this._shadowFilter) p.setImageFilter(this._shadowFilter)
    } else if (this._shadowFilter) {
      this._shadowFilter.dispose()
      this._shadowFilter = null
    }

    // Color matrix — factory handles change detection via `existing` param
    if (this.colorMatrix && this.colorMatrix.length === 20) {
      this._colorFilter = SkiaColorFilter.matrix(skia, this.colorMatrix, this._colorFilter)
      if (this._colorFilter) p.setColorFilter(this._colorFilter)
    } else if (this._colorFilter) {
      this._colorFilter.dispose()
      this._colorFilter = null
    }

    if (this.blendMode) p.setBlendMode(this.blendMode)

    return p
  }

  private _ensureBackdropFilter(skia: SkiaContext): void {
    this._backdropFilter = SkiaImageFilter.blur(skia, this.backdropBlur, this.backdropBlur, undefined, this._backdropFilter)
  }

  dispose(): void {
    this._layerPaint?.dispose()
    this._blurFilter?.dispose()
    this._shadowFilter?.dispose()
    this._colorFilter?.dispose()
    this._backdropFilter?.dispose()
    this._layerPaint = null
    this._blurFilter = null
    this._shadowFilter = null
    this._colorFilter = null
    this._backdropFilter = null
  }
}
