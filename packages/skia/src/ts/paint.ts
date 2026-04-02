import type { SkiaContext } from './context'
import { type StrokeCap, type StrokeJoin, type BlendMode, STROKE_CAP, STROKE_JOIN, BLEND_MODE } from './types'

const paintRegistry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/**
 * Skia paint — controls fill, stroke, color, effects, and shaders.
 * All setters return `this` for fluent chaining.
 *
 * ```ts
 * const paint = new SkiaPaint(skia)
 *   .setColor(1, 0, 0, 1)
 *   .setFill()
 *
 * ctx.drawRect(10, 10, 100, 50, paint)
 * paint.dispose()
 * ```
 */
export class SkiaPaint {
  /** @internal */
  _handle: number
  private readonly _ctx: SkiaContext

  constructor(context: SkiaContext) {
    this._ctx = context
    this._handle = context._exports.skia_paint_new()
    paintRegistry.register(this, { handle: this._handle, drop: context._exports.skia_paint_delete }, this)
  }

  // ── Color ──

  setColor(r: number, g: number, b: number, a = 1): this {
    this._ctx._exports.skia_paint_color(this._handle, r, g, b, a)
    return this
  }

  setAlpha(alpha: number): this {
    this._ctx._exports.skia_paint_set_alpha(this._handle, alpha)
    return this
  }

  // ── Style ──

  setFill(): this {
    this._ctx._exports.skia_paint_set_fill_style(this._handle)
    return this
  }

  setStroke(width: number): this {
    this._ctx._exports.skia_paint_set_stroke_style(this._handle, width)
    return this
  }

  setStrokeCap(cap: StrokeCap): this {
    this._ctx._exports.skia_paint_set_stroke_cap(this._handle, STROKE_CAP[cap])
    return this
  }

  setStrokeJoin(join: StrokeJoin): this {
    this._ctx._exports.skia_paint_set_stroke_join(this._handle, STROKE_JOIN[join])
    return this
  }

  setStrokeMiter(limit: number): this {
    this._ctx._exports.skia_paint_set_stroke_miter(this._handle, limit)
    return this
  }

  // ── Effects ──

  setAntiAlias(enabled = true): this {
    this._ctx._exports.skia_paint_set_anti_alias(this._handle, enabled ? 1 : 0)
    return this
  }

  setBlendMode(mode: BlendMode): this {
    this._ctx._exports.skia_paint_set_blend_mode(this._handle, BLEND_MODE[mode])
    return this
  }

  setDash(intervals: number[], phase = 0): this {
    const ptr = this._ctx._writeF32(intervals)
    this._ctx._exports.skia_paint_set_dash(this._handle, ptr, intervals.length, phase)
    return this
  }

  clearDash(): this {
    this._ctx._exports.skia_paint_clear_dash(this._handle)
    return this
  }

  setBlur(sigma: number): this {
    this._ctx._exports.skia_paint_set_blur(this._handle, sigma)
    return this
  }

  clearBlur(): this {
    this._ctx._exports.skia_paint_clear_blur(this._handle)
    return this
  }

  // ── Shaders ──

  /**
   * Set a linear gradient shader.
   * @param colors - Array of 0xAARRGGBB packed colors
   * @param stops - Array of position values [0..1], same length as colors
   */
  setLinearGradient(
    x0: number, y0: number, x1: number, y1: number,
    colors: number[], stops: number[],
  ): this {
    const colorsPtr = this._ctx._writeU32(colors)
    const stopsPtr = this._ctx._writeF32(stops)
    this._ctx._exports.skia_paint_set_linear_gradient_n(
      this._handle, x0, y0, x1, y1, colorsPtr, stopsPtr, colors.length,
    )
    return this
  }

  setRadialGradient(
    cx: number, cy: number, radius: number,
    colors: number[], stops: number[],
  ): this {
    const colorsPtr = this._ctx._writeU32(colors)
    const stopsPtr = this._ctx._writeF32(stops)
    this._ctx._exports.skia_paint_set_radial_gradient(
      this._handle, cx, cy, radius, colorsPtr, stopsPtr, colors.length,
    )
    return this
  }

  setSweepGradient(
    cx: number, cy: number,
    colors: number[], stops: number[],
  ): this {
    const colorsPtr = this._ctx._writeU32(colors)
    const stopsPtr = this._ctx._writeF32(stops)
    this._ctx._exports.skia_paint_set_sweep_gradient(
      this._handle, cx, cy, colorsPtr, stopsPtr, colors.length,
    )
    return this
  }

  clearShader(): this {
    this._ctx._exports.skia_paint_clear_shader(this._handle)
    return this
  }

  /** Explicitly release the paint handle */
  dispose(): void {
    if (this._handle !== 0) {
      paintRegistry.unregister(this)
      this._ctx._exports.skia_paint_delete(this._handle)
      this._handle = 0
    }
  }
}
