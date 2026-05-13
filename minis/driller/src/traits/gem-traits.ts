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
  /**
   * Previous row before the in-flight fall step. Used to smoothly lerp
   * the visible py from prev → current cell across the fall step's
   * duration. When the gem is at rest, prev === row and the lerp is a
   * no-op.
   */
  prevRow: 0,
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
  /**
   * Total duration of the in-flight fall step (ms). Used with
   * fallCooldownMs to compute lerp progress from prevRow → row.
   */
  stepDurationMs: 0,
  /**
   * Time-pressure expiry: tick after which the gem self-destroys.
   * Triggered when the row the gem sits on is mutated (drill or
   * paint), giving the player a window to grab it before it fades.
   * 0 = no expiry armed (default; only the void-band shower and the
   * just-spawned in-soil state).
   *
   * `expireAtTick - GEM_FADE_TICKS` marks the moment the fade
   * animation starts; the renderer interpolates an ease-in grow
   * followed by an elastic-snap shrink + alpha fade across that
   * window. After expireAtTick the entity destroys itself.
   */
  expireAtTick: 0,
})
