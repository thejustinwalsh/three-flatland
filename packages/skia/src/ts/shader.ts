import type { SkiaContext } from './context'
import type { SkiaImage } from './image'

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
    registry.register(this, { handle, drop: context._exports.skia_shader_destroy }, this)
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
