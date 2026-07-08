// Trimmed from `minis/breakout/src/systems/sounds.ts` — kept a handful of
// the real ZzFX presets verbatim, then appended call-site variants that the
// original file doesn't have (it only ever spreads a `params` variable
// inside `play()`). The variants below give the future ZzFX CodeLens
// provider positive and negative fixtures: a literal spread-array call, a
// named-const spread call, and a commented-out call that must NOT surface
// a CodeLens.

type ZzFXParams = [
  number,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
  number?,
]

declare function zzfx(...params: ZzFXParams): unknown

// Paddle hit - satisfying pop
export const PADDLE_HIT: ZzFXParams = [0.5, 0, 300, 0, 0.02, 0.05, 1]

// Wall bounce - soft thud
export const WALL_HIT: ZzFXParams = [0.3, 0.05, 200, 0, 0.015, 0.03, 3]

// Block break - bright chime
export const BLOCK_BREAK: ZzFXParams = [0.5, 0, 800, 0, 0.02, 0.08, 0]

// Laser - not part of the original preset list, added for the
// named-const call-site case below.
const LASER: ZzFXParams = [0.6, 0, 1500, 0, 0.03, 0.05, 4, 2, 0, 0, 900, 0.03]

// Positive case: literal spread-array call site — CodeLens should attach
// directly above this line.
zzfx(...[0.5, 0, 300, 0, 0.02, 0.05, 1])

// Positive case: named-const spread call site — CodeLens should resolve
// LASER's declaration above to read its literal params.
zzfx(...LASER)

// Negative case: commented out — CodeLens must NOT surface here.
// zzfx(...WALL_HIT)

export function createSoundPlayer(play: (params: ZzFXParams) => void) {
  const lastSoundTimes = new Map<string, number>()
  const MIN_INTERVAL = 30 // ms debounce

  const trigger = (name: string, params: ZzFXParams) => {
    const now = Date.now()
    if (now - (lastSoundTimes.get(name) ?? 0) < MIN_INTERVAL) return
    lastSoundTimes.set(name, now)
    play(params)
  }

  return {
    paddleHit: () => trigger('paddleHit', PADDLE_HIT),
    wallHit: () => trigger('wallHit', WALL_HIT),
    blockBreak: () => trigger('blockBreak', BLOCK_BREAK),
  }
}

export type SoundPlayer = ReturnType<typeof createSoundPlayer>
