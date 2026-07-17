/**
 * ZzFX parameter array type
 * @see https://github.com/KilledByAPixel/ZzFX
 */
export type ZzFXParams = [
  volume?: number,
  randomness?: number,
  frequency?: number,
  attack?: number,
  sustain?: number,
  release?: number,
  shape?: number,
  shapeCurve?: number,
  slide?: number,
  deltaSlide?: number,
  pitchJump?: number,
  pitchJumpTime?: number,
  repeatTime?: number,
  noise?: number,
  modulation?: number,
  bitCrush?: number,
  delay?: number,
  sustainVolume?: number,
  decay?: number,
  tremolo?: number,
  filter?: number,
]

/**
 * ZzFX-compatible sound function
 */
export type PlaySoundFn = (...params: ZzFXParams) => void

/**
 * Display mode.
 *
 * - `hero`: embedded attract loop on the docs landing page. No chrome.
 *   Infinite lives. World transitions to a new seed when the driller
 *   passes the bottom of the deepest biome.
 * - `full`: standalone /play route with title attract screen + leaderboard.
 *   Three lives; on third death a leaderboard prompt collects a name and
 *   the run resets with a new seed.
 */
export type DrillerMode = 'hero' | 'full'

/**
 * Props for the mini-game component
 */
export interface MiniGameProps {
  /** ZzFX-compatible function - receives raw params like zzfx() */
  zzfx?: PlaySoundFn
  /** Whether game is visible (for pausing when off-screen) */
  isVisible?: boolean
  /** Custom class name for styling */
  className?: string
}

/**
 * Driller-specific props.
 */
export interface DrillerProps extends MiniGameProps {
  /** Display mode (default: 'hero') */
  mode?: DrillerMode
  /** Optional fixed seed for reproducible runs (e.g. via URL ?seed=) */
  seed?: number
}
