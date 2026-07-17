/**
 * Audio types shared between bridge + proxy + storage.
 *
 * `ZzFxParams` is the 21-position parameter array that ZzFX takes —
 * named here for readability. The same shape is used by mini consumers
 * who receive a `zzfx`-compatible function via prop injection.
 */

export type ZzFxParams = [
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

/** ZzFX-compatible play function — what mini consumers receive as a prop. */
export type PlaySoundFn = (...params: ZzFxParams) => void
