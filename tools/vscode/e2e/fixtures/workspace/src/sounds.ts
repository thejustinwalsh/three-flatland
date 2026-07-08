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

// --- A-series fixtures: multi-library audio Play/Stop lenses -----------
// zzfxm.song and audio.file (three.js/Howler/Wad/bare-Audio) positive and
// negative cases — see tools/codelens-service/CLAUDE.md's Finding union.
// Real .wav/.ogg files live alongside this fixture workspace: sounds/
// jump.wav (workspace root), public/explosion.ogg (public/), src/click.wav
// (this file's own directory) — one per audioFileResolver.ts resolution
// tier.

declare function zzfxm(
  instruments: number[][],
  patterns: number[][][],
  sequence: number[],
  bpm?: number
): unknown
declare function zzfxM(...args: unknown[]): unknown
declare class Howl {
  constructor(opts: { src: string[] })
  play(): void
}
declare class Wad {
  constructor(opts: { source: string })
  play(): void
}
declare const audioLoader: { load: (path: string, onLoad?: () => void) => void }

// A combined [instruments, patterns, sequence, bpm] tuple — the shape a
// bare-identifier zzfxm(NAME) call resolves via varRef (a SPREAD first
// argument does NOT, see songResolver.ts's file doc comment).
const fanfareSong = [[[0.6, 0, 220, 0, 0.05, 0.2, 1]], [[[0, 0, 12, 12]]], [0, 0], 140]

// Positive case: zzfxm.song, named-const bare-identifier call site —
// resolves fanfareSong's declaration above via varRef, same shape as
// zzfx's LASER case.
export function playFanfare() {
  zzfxm(fanfareSong)
}

// Positive case: zzfxm.song, true positional literal call (no varRef) —
// CodeLens reads the raw argument-list text directly.
export function playChiptune() {
  zzfxm([[0.5, 0, 300]], [[[0, 0, 12, 12]]], [0])
}

// Positive case (the CodeLens still appears — the sidecar doesn't
// validate call shape) but a graceful-refusal case at Play time: a
// SPREAD first argument does not resolve a varRef the way a bare
// identifier does (see sidecar/src/parse.rs::extract_zzfxm_call's doc
// comment), so its raw `...fanfareSong` argument text is not a parseable
// song literal — Play surfaces a loadError rather than throwing or
// silently no-op'ing.
export function playFanfareSpread() {
  zzfxM(...fanfareSong)
}

// Negative case: commented out — must NOT surface a CodeLens.
// zzfxm([[0.1, 0, 100]], [[[0, 0, 4]]], [0])

// Positive case: audio.file via three.js AudioLoader — resolves via the
// WORKSPACE ROOT (sounds/jump.wav sits next to src/, not inside it).
export function loadJumpSfx() {
  audioLoader.load('sounds/jump.wav')
}

// Positive case: audio.file via Howler — resolves via this file's OWN
// DIRECTORY (click.wav sits right next to sounds.ts).
export function playClickSfx() {
  new Howl({ src: ['click.wav'] }).play()
}

// Positive case: audio.file via Wad — resolves via `public/` under the
// workspace root (no copy exists at the source dir or workspace root).
export function playExplosionSfx() {
  new Wad({ source: 'explosion.ogg' }).play()
}

// Negative case: audio.file via bare Audio, an UNRESOLVABLE path — the
// lens must be ABSENT (no copy of this file exists anywhere the resolver
// looks).
export function playMissingSfx() {
  new Audio('nonexistent-sound.mp3').play()
}

// Negative cases: commented out — must NOT surface a CodeLens.
// new Audio('should-not-appear.wav')
// new Howl({ src: ['also-should-not-appear.wav'] })
