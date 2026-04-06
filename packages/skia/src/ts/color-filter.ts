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

  /** @internal Creation params for change detection */
  _params: unknown[] = []

  private constructor(context: SkiaContext, handle: number, params: unknown[] = []) {
    this._ctx = context
    this._handle = handle
    this._params = params
    registry.register(this, { handle, drop: context._exports.skia_colorfilter_destroy }, this)
  }

  /** @internal Check if existing filter was created with the given params */
  private static _matches(existing: SkiaColorFilter | null | undefined, params: unknown[]): boolean {
    if (!existing || existing._handle === 0) return false
    if (existing._params.length !== params.length) return false
    for (let i = 0; i < params.length; i++) {
      if (existing._params[i] !== params[i]) return false
    }
    return true
  }

  /** Blend a solid color using a blend mode */
  static blend(context: SkiaContext, color: number, blendMode: BlendMode, existing?: SkiaColorFilter | null): SkiaColorFilter | null {
    const params = ['blend', color, blendMode]
    if (this._matches(existing, params)) return existing!
    existing?.dispose()
    const h = context._exports.skia_colorfilter_blend(color, BLEND_MODE[blendMode])
    return h ? new SkiaColorFilter(context, h, params) : null
  }

  /**
   * Apply a 4x5 color matrix (20 floats, row-major).
   * Pass `existing` to reuse the handle if the matrix hasn't changed.
   */
  static matrix(context: SkiaContext, matrix: number[], existing?: SkiaColorFilter | null): SkiaColorFilter | null {
    if (matrix.length !== 20) throw new Error('Color matrix must have 20 elements')
    // For matrix comparison, embed all 20 values in the params
    const params: unknown[] = ['matrix', ...matrix]
    if (this._matches(existing, params)) return existing!
    existing?.dispose()
    const ptr = context._writeF32(matrix)
    const h = context._exports.skia_colorfilter_matrix(ptr)
    return h ? new SkiaColorFilter(context, h, params) : null
  }

  /** Compose two color filters: result = outer(inner(color)) */
  static compose(context: SkiaContext, outer: SkiaColorFilter, inner: SkiaColorFilter): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_compose(outer._handle, inner._handle)
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Interpolate between two color filters (t=0 → dst, t=1 → src) */
  static lerp(context: SkiaContext, t: number, dst: SkiaColorFilter, src: SkiaColorFilter): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_lerp(t, dst._handle, src._handle)
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Per-channel lookup table (256 entries, applied to all RGBA channels) */
  static table(context: SkiaContext, table: Uint8Array): SkiaColorFilter | null {
    if (table.length !== 256) throw new Error('Color table must have 256 entries')
    const [ptr] = context._writeBytes(table)
    const h = context._exports.skia_colorfilter_table(ptr)
    return h ? new SkiaColorFilter(context, h) : null
  }

  /** Per-channel lookup tables (256 entries each for A, R, G, B) */
  static tableARGB(context: SkiaContext, a: Uint8Array, r: Uint8Array, g: Uint8Array, b: Uint8Array): SkiaColorFilter | null {
    const [aPtr] = context._writeBytes(a)
    const [rPtr] = context._writeBytes(r)
    const [gPtr] = context._writeBytes(g)
    const [bPtr] = context._writeBytes(b)
    const h = context._exports.skia_colorfilter_table_argb(aPtr, rPtr, gPtr, bPtr)
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

  /** Luminance-to-alpha color filter */
  static luma(context: SkiaContext): SkiaColorFilter | null {
    const h = context._exports.skia_colorfilter_luma()
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
