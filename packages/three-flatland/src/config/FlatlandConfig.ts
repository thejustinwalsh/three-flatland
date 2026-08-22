import type { TextureOptions, TexturePreset } from '../loaders/texturePresets'

/** Named presets coordinated across Flatland subsystems. */
export type FlatlandPreset = TexturePreset

/** Options coordinated by the library-wide preset. */
export interface FlatlandConfigOptions {
  /** Snap cameras and final projected object pivots to physical pixels. */
  pixelPerfect?: boolean
  /** Default texture-loader preset or custom texture options. */
  texture?: TexturePreset | TextureOptions
}

/** A named Flatland preset or a partial custom configuration. */
export type FlatlandSetting = FlatlandPreset | FlatlandConfigOptions

const SYSTEM_FLATLAND_OPTIONS: Readonly<Required<FlatlandConfigOptions>> = Object.freeze({
  pixelPerfect: true,
  texture: 'pixel-art',
})

/** Coordinated library-wide presets. */
export const FLATLAND_PRESETS: Readonly<Record<FlatlandPreset, Readonly<Required<FlatlandConfigOptions>>>> =
  Object.freeze({
    'pixel-art': Object.freeze({ pixelPerfect: true, texture: 'pixel-art' }),
    smooth: Object.freeze({ pixelPerfect: false, texture: 'smooth' }),
    none: Object.freeze({ pixelPerfect: false, texture: 'none' }),
  })

function applySetting(
  base: Readonly<Required<FlatlandConfigOptions>>,
  setting: FlatlandSetting
): Required<FlatlandConfigOptions> {
  return typeof setting === 'string' ? { ...FLATLAND_PRESETS[setting] } : { ...base, ...setting }
}

/**
 * Library-wide configuration above rendering and texture-specific defaults.
 *
 * The system defaults to `'pixel-art'`, coordinating integer camera scaling,
 * projected-pivot snapping, and pixel-art texture loading. More-specific
 * subsystem, class, and instance options can override either branch.
 *
 * @example
 * ```ts
 * FlatlandConfig.options = 'smooth'
 *
 * // Or customize one branch while retaining the pixel-art system defaults.
 * FlatlandConfig.options = { texture: 'smooth' }
 * ```
 */
export class FlatlandConfig {
  private static _options: FlatlandSetting = 'pixel-art'

  static get options(): FlatlandSetting {
    return this._options
  }

  static set options(value: FlatlandSetting) {
    this._options = value
  }

  /** Fully resolved library-wide options. */
  static get resolved(): Readonly<Required<FlatlandConfigOptions>> {
    return applySetting(SYSTEM_FLATLAND_OPTIONS, this._options)
  }

  /** Reset the library-wide setting to the coordinated `'pixel-art'` preset. */
  static reset(): void {
    this._options = 'pixel-art'
  }
}
