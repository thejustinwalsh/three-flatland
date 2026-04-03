import type { SkiaContext } from './context'
import type { SkiaColorFilter } from './color-filter'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia image filter — blur, drop shadow, morphology, etc.
 * Attach to a paint (for saveLayer) to apply effects to a group of drawing commands.
 *
 * All factory methods are static — filters are immutable once created.
 *
 * ```ts
 * const blur = SkiaImageFilter.blur(skia, 4, 4)
 * const shadow = SkiaImageFilter.dropShadow(skia, 4, 4, 3, 3, 0x80000000)
 * paint.setImageFilter(blur)
 * ctx.saveLayer(null, paint)
 * // ... draw children — they'll all be blurred
 * ctx.restore()
 * ```
 */
export class SkiaImageFilter {
  /** @internal */
  _handle: number
  private readonly _ctx: SkiaContext

  private constructor(context: SkiaContext, handle: number) {
    this._ctx = context
    this._handle = handle
    registry.register(this, { handle, drop: context._exports.skia_imagefilter_destroy }, this)
  }

  static blur(context: SkiaContext, sigmaX: number, sigmaY: number, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_blur(sigmaX, sigmaY, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static dropShadow(context: SkiaContext, dx: number, dy: number, sigmaX: number, sigmaY: number, color: number, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_drop_shadow(dx, dy, sigmaX, sigmaY, color, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static dropShadowOnly(context: SkiaContext, dx: number, dy: number, sigmaX: number, sigmaY: number, color: number, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_drop_shadow_only(dx, dy, sigmaX, sigmaY, color, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static offset(context: SkiaContext, dx: number, dy: number, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_offset(dx, dy, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static colorFilter(context: SkiaContext, cf: SkiaColorFilter, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_color_filter(cf._handle, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static compose(context: SkiaContext, outer: SkiaImageFilter, inner: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_compose(outer._handle, inner._handle)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static dilate(context: SkiaContext, radiusX: number, radiusY: number, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_dilate(radiusX, radiusY, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static displacementMap(context: SkiaContext, xChannel: 'alpha' | 'red' | 'green' | 'blue',
                         yChannel: 'alpha' | 'red' | 'green' | 'blue', scale: number,
                         displacement: SkiaImageFilter, color?: SkiaImageFilter): SkiaImageFilter | null {
    const channelMap = { alpha: 1, red: 2, green: 3, blue: 4 }
    const h = context._exports.skia_imagefilter_displacement_map(
      channelMap[xChannel], channelMap[yChannel], scale,
      displacement._handle, color?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  static erode(context: SkiaContext, radiusX: number, radiusY: number, input?: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_erode(radiusX, radiusY, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h) : null
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_imagefilter_destroy(this._handle)
      this._handle = 0
    }
  }
}
