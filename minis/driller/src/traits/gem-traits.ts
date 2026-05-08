import { trait } from 'koota'

/**
 * Gem palette — matches the canonical tileset asset.
 * Note: there is no sapphire (the asset has 4 colors, not 5).
 */
export type GemColor = 'emerald' | 'topaz' | 'ruby' | 'amethyst'

/**
 * Gem size — picked at generation time from the biome distribution.
 * Larger gems are worth more (and are visually larger sprites).
 */
export type GemSize = 'small' | 'medium' | 'large' | 'huge'

/**
 * A collectible gem. While embedded in the world, `(col, row)` is the
 * integer grid cell; `scatteredUntilTick === 0`. After a death scatter,
 * `scatteredUntilTick` is set in the future and the gem occupies a
 * floating-point `(px, py)` until either (a) the user collects it,
 * (b) the driller walks into it, or (c) the timer expires.
 */
export const Gem = trait({
  col: 0,
  row: 0,
  color: 'amethyst' as GemColor,
  size: 'small' as GemSize,
  collected: false,
  scatteredUntilTick: 0,
  px: 0,
  py: 0,
  /** During collect-arc tween: 0 = at source, 1 = at driller. */
  collectProgress: 0,
  /** Gravity step cooldown (ms); gem falls one row when this hits 0. */
  fallCooldownMs: 0,
})
