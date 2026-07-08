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
// zzfxm.song (bare-identifier varRef, positional literal, and a
// spread-of-identifier call resolving the same varRef — see
// songResolver.ts's file doc comment), and
// audio.file (three.js/Howler/Wad, one real file per audioFileResolver.ts
// FAST resolution tier, one slow-search-only file, one unresolvable path,
// and commented-out decoys of every positive case).
//
// Real .wav/.ogg files: sounds/jump.wav (workspace root),
// public/explosion.ogg (public/), src/click.wav (this file's own
// directory, since this file also lives in src/), media/deep/thunder.ogg
// (no fast tier — resolves only via the workspace-wide fallback search).

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

// A combined [instruments, patterns, sequence, bpm] tuple — the shape
// both a bare-identifier zzfxm(NAME) call and a spread zzfxM(...NAME)
// call resolve via varRef (see songResolver.ts's file doc comment).
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

// Positive case: zzfxm.song, SPREAD-of-identifier call site — the
// canonical zzfxm-tool output shape. Resolves the SAME fanfareSong varRef
// the bare-identifier call above does (see
// sidecar/src/parse.rs::extract_zzfxm_call's doc comment), so Play
// produces real audio, exactly like playFanfare.
export function playFanfareSpread() {
  zzfxM(...fanfareSong)
}

// A LONG song (#43): one instrument, one 16-row pattern, sequence
// repeated 4 times at 125 BPM. True duration MEASURED (not eyeballed) by
// running ZZFXM.build over exactly this data and dividing the sample
// count by the sample rate: 338688 samples @ 44100 Hz = 7.680s. Long
// enough to prove sustained playback past the old magic 5s mark and a
// clean mid-playback stop with room to spare on both sides.
const longMarchSong = [
  [[0.5, 0, 220, 0.01, 0.1, 0.3, 1]],
  [[[0, 0, 12, 0, 15, 0, 17, 0, 12, 0, 15, 0, 19, 0, 17, 0, 15, 0]]],
  [0, 0, 0, 0],
  125,
]

// Positive case: the long-song play/stop subject — bare-identifier
// varRef, same resolution shape as playFanfare.
export function playLongMarch() {
  zzfxm(longMarchSong)
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

// Positive case (slow tier): audio.file via bare Audio whose path misses
// every FAST tier — thunder.ogg lives only at media/deep/thunder.ogg, so
// the lens resolves via the workspace-wide basename fallback search
// (`$(search) …` → ▶ Play). Also the lazy-repair cycle's subject: the
// e2e deletes/re-adds the file around Play attempts.
export function playThunderSfx() {
  new Audio('thunder.ogg').play()
}

// Not-found case: audio.file via bare Audio, an UNRESOLVABLE path — no
// copy exists anywhere, so the fallback search settles to a
// `$(search) not found` lens (an informational signal, not silent
// absence — see #41).
export function playMissingSfx() {
  new Audio('nonexistent-sound.mp3').play()
}

// Negative cases: commented out — must NOT surface a CodeLens.
// new Audio('should-not-appear.wav')
// new Howl({ src: ['also-should-not-appear.wav'] })
