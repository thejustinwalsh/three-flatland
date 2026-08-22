import { FlatlandConfig, type FlatlandPreset } from './FlatlandConfig'

/** Named presentation presets. */
export type RenderingPreset = FlatlandPreset

/** Options coordinated by a rendering preset. */
export interface RenderingOptions {
  /** Snap cameras and final projected object pivots to physical pixels. */
  pixelPerfect?: boolean
}

/** A named rendering preset or a partial custom configuration. */
export type RenderingSetting = RenderingPreset | RenderingOptions

/** Presentation-only preset values. */
export const RENDERING_PRESETS: Readonly<Record<RenderingPreset, Readonly<Required<RenderingOptions>>>> = Object.freeze(
  {
    'pixel-art': Object.freeze({ pixelPerfect: true }),
    smooth: Object.freeze({ pixelPerfect: false }),
    none: Object.freeze({ pixelPerfect: false }),
  }
)

function applySetting(
  base: Readonly<Required<RenderingOptions>>,
  setting: RenderingSetting
): Required<RenderingOptions> {
  if (typeof setting !== 'string') return { ...base, ...setting }
  if (!Object.hasOwn(RENDERING_PRESETS, setting)) {
    throw new TypeError(`three-flatland: unknown rendering preset "${setting}"`)
  }
  const preset = RENDERING_PRESETS[setting]
  return { ...preset }
}

/**
 * Presentation-specific defaults beneath {@link FlatlandConfig}.
 *
 * Leave this unset to inherit the library-wide preset. Use it when camera and
 * object presentation should diverge from texture loading. Class and instance
 * options remain more specific.
 *
 * @example
 * ```ts
 * FlatlandConfig.options = 'pixel-art'
 * RenderingConfig.options = 'smooth' // keep pixel-art texture loading
 * ```
 */
export class RenderingConfig {
  private static _options: RenderingSetting | undefined

  static get options(): RenderingSetting {
    if (this._options !== undefined) return this._options
    const root = FlatlandConfig.options
    return typeof root === 'string' ? root : { pixelPerfect: FlatlandConfig.resolved.pixelPerfect }
  }

  static set options(value: RenderingSetting) {
    this._options = value
  }

  /** Fully resolved project-wide options. */
  static get resolved(): Readonly<Required<RenderingOptions>> {
    const inherited = { pixelPerfect: FlatlandConfig.resolved.pixelPerfect }
    return this._options === undefined ? inherited : applySetting(inherited, this._options)
  }

  /** Remove the rendering-specific override and follow FlatlandConfig again. */
  static reset(): void {
    this._options = undefined
  }
}

/** Resolve a class setting over the project-wide rendering configuration. */
export function resolveRenderingOptions(classSetting?: RenderingSetting): Readonly<Required<RenderingOptions>> {
  const global = RenderingConfig.resolved
  return classSetting === undefined ? global : applySetting(global, classSetting)
}

/** Resolve pixel snapping through instance → class → global → system defaults. */
export function resolvePixelPerfect(value?: boolean, classSetting?: RenderingSetting): boolean {
  return value ?? resolveRenderingOptions(classSetting).pixelPerfect
}
