import type { SkiaContext } from './context'
import type { SkiaImage } from './image'
import { type BlendMode, BLEND_MODE } from './types'

const registry = new FinalizationRegistry<{ handle: number; drop: (h: number) => void }>(
  ({ handle, drop }) => drop(handle),
)

/** Tile mode for image shaders */
export type TileMode = 'clamp' | 'repeat' | 'mirror' | 'decal'
const TILE_MODE: Record<TileMode, number> = { clamp: 0, repeat: 1, mirror: 2, decal: 3 }

/**
 * Skia shader — procedural patterns and image tiling.
 * Attach to a paint via `paint.setShader(shader)`.
 *
 * ```ts
 * const noise = SkiaShader.fractalNoise(skia, 0.05, 0.05, 4, 42)
 * paint.setShader(noise)
 * ctx.drawRect(0, 0, 512, 512, paint)
 * ```
 */
export class SkiaShader {
  _handle: number
  private readonly _ctx: SkiaContext

  private constructor(context: SkiaContext, handle: number) {
    this._ctx = context
    this._handle = handle
    registry.register(this, { handle, drop: (h: number) => context._exports.skia_shader_destroy(h) }, this)
  }

  /** Procedural fractal noise pattern */
  static fractalNoise(context: SkiaContext, freqX: number, freqY: number, octaves: number, seed: number): SkiaShader | null {
    const h = context._exports.skia_shader_fractal_noise(freqX, freqY, octaves, seed)
    return h ? new SkiaShader(context, h) : null
  }

  /** Procedural turbulence pattern */
  static turbulence(context: SkiaContext, freqX: number, freqY: number, octaves: number, seed: number): SkiaShader | null {
    const h = context._exports.skia_shader_turbulence(freqX, freqY, octaves, seed)
    return h ? new SkiaShader(context, h) : null
  }

  /** Solid color shader */
  static color(context: SkiaContext, r: number, g: number, b: number, a: number): SkiaShader | null {
    const h = context._exports.skia_shader_color(r, g, b, a)
    return h ? new SkiaShader(context, h) : null
  }

  /** Blend two shaders using a blend mode */
  static blend(context: SkiaContext, blendMode: BlendMode, dst: SkiaShader, src: SkiaShader): SkiaShader | null {
    const h = context._exports.skia_shader_blend(BLEND_MODE[blendMode], dst._handle, src._handle)
    return h ? new SkiaShader(context, h) : null
  }

  /** Linear gradient shader (standalone, not paint-bound) */
  static linearGradient(context: SkiaContext, x0: number, y0: number, x1: number, y1: number, colors: number[], stops: number[]): SkiaShader | null {
    const colorsPtr = context._writeU32(colors)
    const stopsPtr = context._writeF32(stops)
    const h = context._exports.skia_shader_linear_gradient(x0, y0, x1, y1, colorsPtr, stopsPtr, colors.length)
    return h ? new SkiaShader(context, h) : null
  }

  /** Radial gradient shader (standalone, not paint-bound) */
  static radialGradient(context: SkiaContext, cx: number, cy: number, r: number, colors: number[], stops: number[]): SkiaShader | null {
    const colorsPtr = context._writeU32(colors)
    const stopsPtr = context._writeF32(stops)
    const h = context._exports.skia_shader_radial_gradient(cx, cy, r, colorsPtr, stopsPtr, colors.length)
    return h ? new SkiaShader(context, h) : null
  }

  /** Sweep gradient shader (standalone, not paint-bound) */
  static sweepGradient(context: SkiaContext, cx: number, cy: number, colors: number[], stops: number[]): SkiaShader | null {
    const colorsPtr = context._writeU32(colors)
    const stopsPtr = context._writeF32(stops)
    const h = context._exports.skia_shader_sweep_gradient(cx, cy, colorsPtr, stopsPtr, colors.length)
    return h ? new SkiaShader(context, h) : null
  }

  /** Two-point conical gradient shader (standalone, not paint-bound) */
  static twoPointConicalGradient(context: SkiaContext, sx: number, sy: number, sr: number, ex: number, ey: number, er: number, colors: number[], stops: number[]): SkiaShader | null {
    const colorsPtr = context._writeU32(colors)
    const stopsPtr = context._writeF32(stops)
    const h = context._exports.skia_shader_two_point_conical_gradient(sx, sy, sr, ex, ey, er, colorsPtr, stopsPtr, colors.length)
    return h ? new SkiaShader(context, h) : null
  }

  /** Tile an image as a repeating pattern */
  static image(context: SkiaContext, img: SkiaImage, tileModeX: TileMode = 'clamp', tileModeY: TileMode = 'clamp'): SkiaShader | null {
    const h = context._exports.skia_shader_image(img._handle, TILE_MODE[tileModeX], TILE_MODE[tileModeY])
    return h ? new SkiaShader(context, h) : null
  }

  dispose(): void {
    if (this._handle !== 0) {
      registry.unregister(this)
      this._ctx._exports.skia_shader_destroy(this._handle)
      this._handle = 0
    }
  }
}
