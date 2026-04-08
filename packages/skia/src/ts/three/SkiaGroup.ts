import type { SkiaContext } from '../context'
import type { SkiaDrawingContext } from '../drawing-context'
import type { SkiaPath } from '../path'
import type { SkiaPaint } from '../paint'
import { SkiaPaint as SkiaPaintClass } from '../paint'
import { Object3D } from 'three'
import type { BlendMode } from '../types'
import { SkiaImageFilter } from '../image-filter'
import { SkiaColorFilter } from '../color-filter'
import type { SkiaNode } from './SkiaNode'

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
 * Uses standard Object3D `position`, `scale`, and `rotation.z` for transforms.
 * The `degrees` prop is a convenience for setting rotation in degrees directly.
 *
 * ```tsx
 * <skiaGroup position={[50, 50, 0]} blur={4} opacity={0.8}>
 *   <skiaRect fill={[1,0,0,1]} />
 * </skiaGroup>
 *
 * <skiaGroup shadow={{ dx: 4, dy: 4, blur: 3, color: 0x80000000 }}>
 *   <skiaRect fill={[1,1,1,1]} cornerRadius={8} />
 * </skiaGroup>
 *
 * <skiaGroup degrees={45} scale={[2, 2, 1]}>
 *   <skiaRect fill={[0,1,0,1]} width={50} height={50} />
 * </skiaGroup>
 * ```
 */
const RAD2DEG = 180 / Math.PI

export class SkiaGroup extends Object3D {
  // ── Transform ──
  /** Rotation in degrees (convenience — overrides rotation.z if non-zero) */
  degrees = 0
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

    // Apply transforms — position/scale from Object3D, rotation via degrees or rotation.z
    const px = this.position.x, py = this.position.y
    if (px !== 0 || py !== 0) ctx.translate(px, py)
    const deg = this.degrees || (this.rotation.z * RAD2DEG)
    if (deg) ctx.rotate(deg)
    const sx = this.scale.x, sy = this.scale.y
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy)
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
      this._shadowFilter = s.shadowOnly
        ? SkiaImageFilter.dropShadowOnly(skia, s.dx, s.dy, s.blur, s.blur, s.color, this._blurFilter ?? undefined, this._shadowFilter)
        : SkiaImageFilter.dropShadow(skia, s.dx, s.dy, s.blur, s.blur, s.color, this._blurFilter ?? undefined, this._shadowFilter)
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
