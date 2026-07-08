// Self-contained fixture for the A-series (multi-library audio Play/Stop
// lens) work — see zzfx-audio-lenses.spec.ts. Kept in its OWN file rather
// than appended to sounds.ts (the Z9-era fixture) so that file's own,
// pre-existing zzfx.spec.ts assertion ("exactly these 4 lenses for the
// whole document") stays valid regardless of what this file's scanner
// coverage grows to — one fixture file per spec file's "whole document"
// scope, not a shared grab-bag every test has to filter around.
//
// Covers all three Finding kinds tools/codelens-service/CLAUDE.md
// documents: zzfx.call (literal + named-const, mirroring sounds.ts's own
// positive cases so this file's own zzfx.call lenses are pinned too),
// zzfxm.song (bare-identifier varRef, positional literal, and a spread
// call demonstrating the graceful-refusal path — see songResolver.ts's
// file doc comment for why spread never resolves a varRef), and
// audio.file (three.js/Howler/Wad, one real file per audioFileResolver.ts
// resolution tier, one unresolvable path, and commented-out decoys of
// every positive case).
//
// Real .wav/.ogg files: sounds/jump.wav (workspace root),
// public/explosion.ogg (public/), src/click.wav (this file's own
// directory, since this file also lives in src/).

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

// --- zzfx.call: literal + named-const, own positive/negative cases -----

// Chime - bright pop, distinct from sounds.ts's own presets so this file
// is a real independent fixture, not a copy.
const CHIME: ZzFXParams = [0.4, 0, 900, 0, 0.02, 0.06, 1, 1.5, 0, 0, 400, 0.02]

// Positive case: literal spread-array call site.
export function playBlip() {
  zzfx(...[0.4, 0, 700, 0, 0.02, 0.04, 1])
}

// Positive case: named-const spread call site — resolves CHIME's
// declaration above via varRef.
export function playChime() {
  zzfx(...CHIME)
}

// Negative case: commented out — must NOT surface a CodeLens.
// zzfx(...[0.2, 0, 100, 0, 0.01, 0.02, 0])

// --- zzfxm.song: bare-identifier varRef, positional literal, spread ----

// A combined [instruments, patterns, sequence, bpm] tuple — the shape a
// bare-identifier zzfxm(NAME) call resolves via varRef (a SPREAD first
// argument does NOT, see songResolver.ts's file doc comment).
const fanfareSong = [[[0.6, 0, 220, 0, 0.05, 0.2, 1]], [[[0, 0, 12, 12]]], [0, 0], 140]

// Positive case: zzfxm.song, named-const bare-identifier call site —
// resolves fanfareSong's declaration above via varRef, same shape as
// zzfx's CHIME case above.
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

// --- audio.file: three tiers + unresolvable + decoys --------------------

// Positive case: audio.file via three.js AudioLoader — resolves via the
// WORKSPACE ROOT (sounds/jump.wav sits next to src/, not inside it).
export function loadJumpSfx() {
  audioLoader.load('sounds/jump.wav')
}

// Positive case: audio.file via Howler — resolves via this file's OWN
// DIRECTORY (click.wav sits right next to this file, same as sounds.ts).
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
