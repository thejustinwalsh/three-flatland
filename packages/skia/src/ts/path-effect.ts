import type { SkiaContext } from './context'
import type { SkiaPath } from './path'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/** Path1D stamp style */
export type Path1DStyle = 'translate' | 'rotate' | 'morph'
const PATH1D_STYLE: Record<Path1DStyle, number> = { translate: 0, rotate: 1, morph: 2 }

/**
 * Skia path effect — modifies how paths are stroked/filled.
 * Attach to a paint via `paint.setPathEffect(effect)`.
 *
 * ```ts
 * // Round corners
 * const corner = SkiaPathEffect.corner(skia, 8)
 * paint.setPathEffect(corner)
 *
 * // Trim path to first half
 * const trim = SkiaPathEffect.trim(skia, 0, 0.5)
 *
 * // Compose: first trim, then round corners
 * const composed = SkiaPathEffect.compose(skia, corner, trim)
 * ```
 */
export class SkiaPathEffect {
  _handle: number
  private readonly _ctx: SkiaContext

  private constructor(context: SkiaContext, handle: number) {
    this._ctx = context
    this._handle = handle
    registry.register(this, { handle, drop: context._exports.skia_patheffect_destroy }, this)
  }

  /** Dash pattern — same as paint.setDash but as a reusable effect */
  static dash(context: SkiaContext, intervals: number[], phase = 0): SkiaPathEffect | null {
    const ptr = context._writeF32(intervals)
    const h = context._exports.skia_patheffect_dash(ptr, intervals.length, phase)
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Round sharp corners with a given radius */
  static corner(context: SkiaContext, radius: number): SkiaPathEffect | null {
    const h = context._exports.skia_patheffect_corner(radius)
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Randomly jitter path segments */
  static discrete(context: SkiaContext, segLength: number, deviation: number, seed = 0): SkiaPathEffect | null {
    const h = context._exports.skia_patheffect_discrete(segLength, deviation, seed)
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Trim path to a fraction [start..stop] where 0=begin, 1=end */
  static trim(context: SkiaContext, start: number, stop: number, inverted = false): SkiaPathEffect | null {
    const h = context._exports.skia_patheffect_trim(start, stop, inverted ? 1 : 0)
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Stamp a path along the stroke */
  static path1D(context: SkiaContext, stampPath: SkiaPath, advance: number, phase: number, style: Path1DStyle): SkiaPathEffect | null {
    const h = context._exports.skia_patheffect_path1d(stampPath._handle, advance, phase, PATH1D_STYLE[style])
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Apply outer effect to the result of inner effect */
  static compose(context: SkiaContext, outer: SkiaPathEffect, inner: SkiaPathEffect): SkiaPathEffect | null {
    const h = context._exports.skia_patheffect_compose(outer._handle, inner._handle)
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Stamp a path in a 2D pattern using a matrix transform */
  static path2D(context: SkiaContext, matrix: Float32Array | number[], stampPath: SkiaPath): SkiaPathEffect | null {
    const arr = matrix instanceof Float32Array ? matrix : new Float32Array(matrix)
    const ptr = context._writeF32(arr)
    const h = context._exports.skia_patheffect_path2d(ptr, stampPath._handle)
    return h ? new SkiaPathEffect(context, h) : null
  }

  /** Apply both effects and combine the results */
  static sum(context: SkiaContext, first: SkiaPathEffect, second: SkiaPathEffect): SkiaPathEffect | null {
    const h = context._exports.skia_patheffect_sum(first._handle, second._handle)
    return h ? new SkiaPathEffect(context, h) : null
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_patheffect_destroy(this._handle)
      this._handle = 0
    }
  }
}
