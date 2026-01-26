import type { Texture, Wrapping } from 'three'
import { NearestFilter, LinearFilter, ClampToEdgeWrapping, SRGBColorSpace } from 'three'

/** Named texture presets */
export type TexturePreset = 'pixel-art' | 'smooth' | 'none'

/** Custom texture options for full control */
export interface TextureOptions {
  minFilter?: typeof NearestFilter | typeof LinearFilter
  magFilter?: typeof NearestFilter | typeof LinearFilter
  wrapS?: Wrapping
  wrapT?: Wrapping
  generateMipmaps?: boolean
  colorSpace?: string
}

/** Preset definitions */
export const TEXTURE_PRESETS: Record<TexturePreset, TextureOptions> = {
  'pixel-art': {
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    generateMipmaps: false,
    colorSpace: SRGBColorSpace,
  },
  smooth: {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    generateMipmaps: true,
    colorSpace: SRGBColorSpace,
  },
  none: {},
}

/**
 * Global texture configuration.
 *
 * Sets system-wide defaults for texture loading. Individual loaders
 * can override via their static `options` property, and per-load
 * overrides are supported via options parameters.
 *
 * @example
 * ```typescript
 * import { TextureConfig } from '@three-flatland/core'
 *
 * // Use smooth filtering globally
 * TextureConfig.options = 'smooth'
 *
 * // Or use custom options
 * TextureConfig.options = {
 *   minFilter: NearestFilter,
 *   magFilter: LinearFilter,
 * }
 * ```
 */
export class TextureConfig {
  private static _options: TexturePreset | TextureOptions = 'pixel-art'

  /** Get the global texture options */
  static get options(): TexturePreset | TextureOptions {
    return this._options
  }

  /** Set the global texture options */
  static set options(value: TexturePreset | TextureOptions) {
    this._options = value
  }

  /** Reset to system default ('pixel-art') */
  static reset(): void {
    this._options = 'pixel-art'
  }
}

/**
 * Apply texture preset or custom options to a texture.
 */
export function applyTextureOptions(
  texture: Texture,
  preset: TexturePreset | TextureOptions
): void {
  const opts = typeof preset === 'string' ? TEXTURE_PRESETS[preset] : preset

  if (opts.minFilter !== undefined) texture.minFilter = opts.minFilter
  if (opts.magFilter !== undefined) texture.magFilter = opts.magFilter
  if (opts.wrapS !== undefined) texture.wrapS = opts.wrapS
  if (opts.wrapT !== undefined) texture.wrapT = opts.wrapT
  if (opts.generateMipmaps !== undefined) texture.generateMipmaps = opts.generateMipmaps
  if (opts.colorSpace !== undefined) texture.colorSpace = opts.colorSpace
}

/**
 * Resolve options from hierarchy: instance > loader > global > 'pixel-art'
 */
export function resolveTextureOptions(
  instanceOptions?: TexturePreset | TextureOptions,
  loaderOptions?: TexturePreset | TextureOptions
): TexturePreset | TextureOptions {
  return instanceOptions ?? loaderOptions ?? TextureConfig.options
}
