import type { Texture, Wrapping } from 'three'
import { NearestFilter, LinearFilter, ClampToEdgeWrapping, SRGBColorSpace } from 'three'
import { FlatlandConfig } from '../config/FlatlandConfig'

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
 * Texture-specific configuration beneath `FlatlandConfig`.
 *
 * Leave this unset to inherit the library-wide preset. Individual loaders can
 * override via their static `options` property, and per-load overrides are
 * supported via options parameters.
 *
 * @example
 * ```typescript
 * import { TextureConfig } from 'three-flatland'
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
  private static _options: TexturePreset | TextureOptions | undefined

  /** Get the global texture options */
  static get options(): TexturePreset | TextureOptions {
    return this._options ?? FlatlandConfig.resolved.texture
  }

  /** Set the global texture options */
  static set options(value: TexturePreset | TextureOptions) {
    this._options = value
  }

  /** Remove the texture-specific override and follow FlatlandConfig again. */
  static reset(): void {
    this._options = undefined
  }
}

/**
 * Apply texture preset or custom options to a texture.
 */
export function applyTextureOptions(texture: Texture, preset: TexturePreset | TextureOptions): void {
  const opts = typeof preset === 'string' ? TEXTURE_PRESETS[preset] : preset

  if (opts.minFilter !== undefined) texture.minFilter = opts.minFilter
  if (opts.magFilter !== undefined) texture.magFilter = opts.magFilter
  if (opts.wrapS !== undefined) texture.wrapS = opts.wrapS
  if (opts.wrapT !== undefined) texture.wrapT = opts.wrapT
  if (opts.generateMipmaps !== undefined) texture.generateMipmaps = opts.generateMipmaps
  if (opts.colorSpace !== undefined) texture.colorSpace = opts.colorSpace
}

/**
 * Resolve options from hierarchy: load > loader class > TextureConfig > FlatlandConfig > system preset.
 */
export function resolveTextureOptions(
  instanceOptions?: TexturePreset | TextureOptions,
  loaderOptions?: TexturePreset | TextureOptions
): TexturePreset | TextureOptions {
  return instanceOptions ?? loaderOptions ?? TextureConfig.options
}
