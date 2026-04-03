import type { SkiaContext } from './context'
import { type BlendMode, BLEND_MODE } from './types'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia color filter — transforms colors during drawing.
 * Attach to a paint via `paint.setColorFilter()`.
 *
 * ```ts
 * // Grayscale filter
 * const grayscale = SkiaColorFilter.matrix(skia, [
 *   0.2126, 0.7152, 0.0722, 0, 0,
 *   0.2126, 0.7152, 0.0722, 0, 0,
 *   0.2126, 0.7152, 0.0722, 0, 0,
 *   0,      0,      0,      1, 0,
 * ])
 * paint.setColorFilter(grayscale)
 * ```
 */
export class SkiaColorFilter {
  /** @internal */
  _handle: number
  private readonly _ctx: SkiaContext

  private constructor(context: SkiaContext, handle: number) {
    this._ctx = context
    this._handle = handle
    registry.register(this, { handle, drop: context._exports.skia_colorfilter_destroy }, this)
  }

  /** Blend a solid color using a blend mode */
  static blend(context: SkiaContext, color: number, blendMode: BlendMode): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_blend(color, BLEND_MODE[blendMode])
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Apply a 4x5 color matrix (20 floats, row-major) */
  static matrix(context: SkiaContext, matrix: number[]): SkiaColorFilter | null {
    if (matrix.length !== 20) throw new Error('Color matrix must have 20 elements')
    const ptr = context._writeF32(matrix)
    const h = context._exports.skia_colorfilter_matrix(ptr)
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Compose two color filters: result = outer(inner(color)) */
  static compose(context: SkiaContext, outer: SkiaColorFilter, inner: SkiaColorFilter): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_compose(outer._handle, inner._handle)
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Convert from linear to sRGB gamma */
  static linearToSRGB(context: SkiaContext): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_linear_to_srgb()
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Convert from sRGB to linear gamma */
  static srgbToLinear(context: SkiaContext): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_srgb_to_linear()
    return h ? new SkiaColorFilter(context, h) : null
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_colorfilter_destroy(this._handle)
      this._handle = 0
    }
  }
}
