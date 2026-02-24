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
 * Props for the mini-game component
 */
export interface MiniGameProps {
  /** ZzFX-compatible function - receives raw params like zzfx() */
  zzfx?: PlaySoundFn
  /** Whether game is visible (for pausing when off-screen) */
  isVisible?: boolean
  /** Custom class name for styling */
  className?: string
  /** Show FPS / sprite / batch stats overlay */
  showStats?: boolean
}

/**
 * Game mode state machine
 */
export type GameMode = 'attract' | 'ready' | 'playing' | 'gameover'
