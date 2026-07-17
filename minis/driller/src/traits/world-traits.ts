import { trait } from 'koota'
import type { DrillerMode } from '../types'

/**
 * Top-level game state machine.
 *
 * - `attract`: title screen / pre-run (full mode only); hero mode skips this and starts in `playing`
 * - `playing`: simulation running, driller alive
 * - `dying`: crush impact; gems scattering; ghost chute starting
 * - `leaderboard`: full mode third-death prompt
 */
export type RunState = 'attract' | 'playing' | 'dying' | 'leaderboard'

/**
 * Singleton game state. One per world.
 */
export const GameState = trait({
  mode: (): DrillerMode => 'hero',
  runState: (): RunState => 'playing',
  /** Monotonically increasing 60Hz tick counter. */
  tick: 0,
  /** Gem currency pouch — auto-collected + user-collected gems land here. Spent on Brace. */
  gems: 0,
  /** Lives remaining; full mode starts at 3, hero mode is effectively infinite (never decrements). */
  lives: 3,
  /** Current driller depth in cells (1 cell = 1 meter for display). */
  depthM: 0,
  /** Deepest depth reached this run. */
  deepestM: 0,
  /** Hero mode world counter — increments after each world-fall transition. */
  worldNumber: 0,
})

/**
 * RNG seed. Stable per run; world-fall in hero mode rotates this.
 */
export const Seed = trait({ value: 0 })

/**
 * Singleton camera state.
 *
 * `y` is the floating-point world-pixel Y of the top edge of the visible play canvas.
 * `targetY` is where the deadzone-follow algorithm wants `y` to be.
 * `scale` is the integer pixel scale (1, 2, 4, or 8) chosen by `lib/scale.ts`.
 * `rows` is the visible row count — always PLAY_ROWS=40 under the
 * fixed mobile-portrait layout.
 */
export const Camera = trait({
  y: 0,
  targetY: 0,
  scale: 4,
  rows: 40,
})
