import type { SkiaContext } from './context'
import type { SkiaPathEffect } from './path-effect'
import type { SkiaShader } from './shader'
import type { SkiaImageFilter } from './image-filter'
import type { SkiaColorFilter } from './color-filter'
import { type StrokeCap, type StrokeJoin, type BlendMode, type BlurStyle, STROKE_CAP, STROKE_JOIN, BLEND_MODE, BLUR_STYLE, BLEND_MODE_REVERSE, STROKE_CAP_REVERSE, STROKE_JOIN_REVERSE } from './types'

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
    paintRegistry.register(this, { handle: this._handle, drop: (h: number) => context._exports.skia_paint_delete(h) }, this)
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

  /**
   * Set blur mask filter.
   * @param sigma - Blur radius
   * @param style - 'normal' (default), 'solid' (solid inside, fuzzy outside),
   *                'outer' (nothing inside, fuzzy outside), 'inner' (fuzzy inside, nothing outside)
   */
  setBlur(sigma: number, style: BlurStyle = 'normal'): this {
    this._ctx._exports.skia_paint_set_blur_style(this._handle, sigma, BLUR_STYLE[style])
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

  // ── Path Effect ──

  setPathEffect(effect: SkiaPathEffect): this {
    this._ctx._exports.skia_paint_set_path_effect(this._handle, effect._handle)
    return this
  }

  clearPathEffect(): this {
    this._ctx._exports.skia_paint_clear_path_effect(this._handle)
    return this
  }

  // ── General Shader ──

  setShader(shader: SkiaShader): this {
    this._ctx._exports.skia_paint_set_shader_obj(this._handle, shader._handle)
    return this
  }

  // ── TwoPointConical Gradient ──

  setTwoPointConicalGradient(
    startX: number, startY: number, startR: number,
    endX: number, endY: number, endR: number,
    colors: number[], stops: number[],
  ): this {
    const colorsPtr = this._ctx._writeU32(colors)
    const stopsPtr = this._ctx._writeF32(stops)
    this._ctx._exports.skia_paint_set_two_point_conical_gradient(
      this._handle, startX, startY, startR, endX, endY, endR, colorsPtr, stopsPtr, colors.length,
    )
    return this
  }

  // ── Filters ──

  setImageFilter(filter: SkiaImageFilter): this {
    this._ctx._exports.skia_paint_set_image_filter(this._handle, filter._handle)
    return this
  }

  clearImageFilter(): this {
    this._ctx._exports.skia_paint_clear_image_filter(this._handle)
    return this
  }

  setColorFilter(filter: SkiaColorFilter): this {
    this._ctx._exports.skia_paint_set_color_filter(this._handle, filter._handle)
    return this
  }

  clearColorFilter(): this {
    this._ctx._exports.skia_paint_clear_color_filter(this._handle)
    return this
  }

  // ── Getters ──

  getColor(): { r: number; g: number; b: number; a: number } {
    const ptr = this._ctx._writeF32([0, 0, 0, 0])
    this._ctx._exports.skia_paint_get_color(this._handle, ptr)
    const dv = new DataView(this._ctx._memory.buffer)
    return { r: dv.getFloat32(ptr, true), g: dv.getFloat32(ptr + 4, true), b: dv.getFloat32(ptr + 8, true), a: dv.getFloat32(ptr + 12, true) }
  }

  getAlpha(): number {
    return this._ctx._exports.skia_paint_get_alpha(this._handle)
  }

  getBlendMode(): BlendMode {
    return BLEND_MODE_REVERSE[this._ctx._exports.skia_paint_get_blend_mode(this._handle)] ?? 'srcOver'
  }

  getStrokeCap(): StrokeCap {
    return STROKE_CAP_REVERSE[this._ctx._exports.skia_paint_get_stroke_cap(this._handle)] ?? 'butt'
  }

  getStrokeJoin(): StrokeJoin {
    return STROKE_JOIN_REVERSE[this._ctx._exports.skia_paint_get_stroke_join(this._handle)] ?? 'miter'
  }

  getStrokeWidth(): number {
    return this._ctx._exports.skia_paint_get_stroke_width(this._handle)
  }

  getStrokeMiter(): number {
    return this._ctx._exports.skia_paint_get_stroke_miter(this._handle)
  }

  getStyle(): 'fill' | 'stroke' | 'strokeAndFill' {
    const v = this._ctx._exports.skia_paint_get_style(this._handle)
    return v === 1 ? 'stroke' : v === 2 ? 'strokeAndFill' : 'fill'
  }

  copy(): SkiaPaint {
    const newHandle = this._ctx._exports.skia_paint_copy(this._handle)
    const paint = Object.create(SkiaPaint.prototype) as SkiaPaint
    ;(paint as unknown as { _ctx: SkiaContext })._ctx = this._ctx
    paint._handle = newHandle
    paintRegistry.register(paint, { handle: newHandle, drop: (h: number) => this._ctx._exports.skia_paint_delete(h) }, paint)
    return paint
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
