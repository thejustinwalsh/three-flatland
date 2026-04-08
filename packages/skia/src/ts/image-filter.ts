import type { SkiaContext } from './context'
import type { SkiaColorFilter } from './color-filter'
import { type BlendMode, BLEND_MODE } from './types'

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

  /** @internal Creation params for change detection */
  _params: unknown[] = []

  private constructor(context: SkiaContext, handle: number, params: unknown[] = []) {
    this._ctx = context
    this._handle = handle
    this._params = params
    registry.register(this, { handle, drop: (h: number) => context._exports.skia_imagefilter_destroy(h) }, this)
  }

  /** Check if this filter was created with the given params (avoids unnecessary recreation) */
  private static _matches(existing: SkiaImageFilter | null | undefined, params: unknown[]): boolean {
    if (!existing || existing._handle === 0) return false
    if (existing._params.length !== params.length) return false
    for (let i = 0; i < params.length; i++) {
      if (existing._params[i] !== params[i]) return false
    }
    return true
  }

  /**
   * Create a blur filter, or return `existing` if it was created with the same params.
   * Disposes `existing` if params changed. Pass `existing` from your cached field.
   */
  static blur(context: SkiaContext, sigmaX: number, sigmaY: number, input?: SkiaImageFilter, existing?: SkiaImageFilter | null): SkiaImageFilter | null {
    const params = ['blur', sigmaX, sigmaY, input?._handle ?? 0]
    if (this._matches(existing, params)) return existing!
    existing?.dispose()
    const h = context._exports.skia_imagefilter_blur(sigmaX, sigmaY, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h, params) : null
  }

  static dropShadow(context: SkiaContext, dx: number, dy: number, sigmaX: number, sigmaY: number, color: number, input?: SkiaImageFilter, existing?: SkiaImageFilter | null): SkiaImageFilter | null {
    const params = ['dropShadow', dx, dy, sigmaX, sigmaY, color, input?._handle ?? 0]
    if (this._matches(existing, params)) return existing!
    existing?.dispose()
    const h = context._exports.skia_imagefilter_drop_shadow(dx, dy, sigmaX, sigmaY, color, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h, params) : null
  }

  static dropShadowOnly(context: SkiaContext, dx: number, dy: number, sigmaX: number, sigmaY: number, color: number, input?: SkiaImageFilter, existing?: SkiaImageFilter | null): SkiaImageFilter | null {
    const params = ['dropShadowOnly', dx, dy, sigmaX, sigmaY, color, input?._handle ?? 0]
    if (this._matches(existing, params)) return existing!
    existing?.dispose()
    const h = context._exports.skia_imagefilter_drop_shadow_only(dx, dy, sigmaX, sigmaY, color, input?._handle ?? 0)
    return h ? new SkiaImageFilter(context, h, params) : null
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

  /** Blend two image filter results using a blend mode */
  static blend(context: SkiaContext, blendMode: BlendMode, bg: SkiaImageFilter, fg: SkiaImageFilter): SkiaImageFilter | null {
    const h = context._exports.skia_imagefilter_blend(BLEND_MODE[blendMode], bg._handle, fg._handle)
    return h ? new SkiaImageFilter(context, h) : null
  }

  /** Apply a matrix transform to the filter input */
  static matrixTransform(context: SkiaContext, matrix: Float32Array | number[], input?: SkiaImageFilter): SkiaImageFilter | null {
    const arr = matrix instanceof Float32Array ? matrix : new Float32Array(matrix)
    const ptr = context._writeF32(arr)
    const h = context._exports.skia_imagefilter_matrix_transform(ptr, 0, input?._handle ?? 0)
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
