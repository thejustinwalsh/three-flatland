// Self-contained fixture for the A-series (multi-library audio Play/Stop
// lens) work — see zzfx-audio-lenses.spec.ts. Kept in its OWN file rather
// than appended to sounds.ts (the Z9-era fixture) so that file's own,
// pre-existing zzfx.spec.ts assertion ("exactly these 4 lenses for the
// whole document") stays valid regardless of what this file's scanner
// coverage grows to — one fixture file per spec file's "whole document"
// scope, not a shared grab-bag every test has to filter around.
//
// Covers all five Finding kinds tools/codelens-service/CLAUDE.md
// documents: zzfx.call (literal + named-const, mirroring sounds.ts's own
// positive cases so this file's own zzfx.call lenses are pinned too),
// zzfxm.song (bare-identifier varRef, positional literal, and a
// spread-of-identifier call resolving the same varRef — see
// songResolver.ts's file doc comment), audio.file (three.js/Howler/Wad,
// one real file per audioFileResolver.ts FAST resolution tier, one
// slow-search-only file, one unresolvable path, commented-out decoys of
// every positive case, plus #44's expanded Wad coverage: a
// convolution-reverb impulse positive and a TRUE decoy block — mic/
// sprite/preset — that must surface ZERO lenses), wad.synth (#47: all 5
// oscillator/noise keywords as real toggling lenses, plus a resolvable
// and an unresolvable bare-identifier var-ref case), and tone.synth (#47:
// pitched/no-note/chord-with-explicit-voice positives, one fully-static-
// or-nothing negative).
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
  constructor(opts: {
    source?: string
    reverb?: { impulse?: string }
    sprite?: Record<string, [number, number]>
  })
  play(): void
  static presets: Record<string, ConstructorParameters<typeof Wad>[0]>
}
declare const audioLoader: { load: (path: string, onLoad?: () => void) => void }
declare namespace Tone {
  class Instrument {
    toDestination(): this
    connect(node: unknown): this
    triggerAttackRelease(...args: unknown[]): this
  }
  class Synth extends Instrument {}
  class AMSynth extends Instrument {}
  class FMSynth extends Instrument {}
  class DuoSynth extends Instrument {}
  class MembraneSynth extends Instrument {}
  class MetalSynth extends Instrument {}
  class PluckSynth extends Instrument {}
  class NoiseSynth extends Instrument {}
  class PolySynth extends Instrument {
    constructor(voice?: new (...args: unknown[]) => Instrument)
  }
}

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

// Positive case (#44): audio.file via Wad's convolution reverb — the
// impulse-response FILE sits two object levels down
// ({ reverb: { impulse } }); the depth-agnostic scanner reaches it with
// no Wad-specific code. Resolves via this file's OWN DIRECTORY
// (click.wav, the same real .wav playClickSfx uses).
export function playWithReverb() {
  new Wad({ reverb: { impulse: 'click.wav' } }).play()
}

// Positive cases (#47): Wad's oscillator/noise synthesis keywords are
// now first-class wad.synth findings — before #47 gave synthesis mode
// its own finding kind, these were pinned as audio.file NEGATIVES
// instead; now each gets a real, toggling, audible ▶ Play lens. All 5
// allowlisted keywords covered (`sine` was previously missing from this
// fixture entirely — square/sawtooth/triangle/noise were the only 4).
export function wadOscillators() {
  new Wad({ source: 'sine' }).play()
  new Wad({ source: 'square' }).play()
  new Wad({ source: 'sawtooth' }).play()
  new Wad({ source: 'triangle' }).play()
  new Wad({ source: 'noise' }).play()
}

// Positive case (#47): wad.synth via a resolvable bare-identifier
// var-ref — the scanner always emits a finding for a bare identifier
// (permissive posture, deferring "is this valid" to the client), and
// this declaration genuinely resolves to a valid oscillator config, so
// Play produces real audio via wadSynthResolver.ts.
const wadOscillatorConfig = { source: 'square' }
export function playWadFromVar() {
  new Wad(wadOscillatorConfig).play()
}

// Not-a-valid-config case (#47): wad.synth via a bare-identifier var-ref
// whose declaration does NOT resolve to a valid oscillator config — the
// scanner still always emits a finding (it can't know the declaration is
// invalid without resolving it), so a ▶ Play lens exists, but clicking
// Play must gracefully surface an error (wadSynthResolver.ts's
// loadError path) rather than throw or hang.
const invalidWadConfig = { source: 'jump.wav' }
export function playWadUnresolvable() {
  new Wad(invalidWadConfig).play()
}

// Negative cases: live mic input (not statically playable), sprite
// segments (numbers, not a source keyword), and a stock preset (member
// expression, no object literal for the scanner to read) — none match
// wad.synth's `{source: <oscillator keyword>}` shape, and none end in a
// recognized audio extension either. ZERO lenses for this entire block,
// proven by the spec's exact-total assertion and per-line checks.
export function synthDecoys() {
  new Wad({ source: 'mic' }).play()
  new Wad({ sprite: { hello: [0, 0.4] } }).play()
  new Wad(Wad.presets.hiHatClosed).play()
}

// --- tone.synth: Tone.js triggerAttackRelease call chains (#47) --------

// Positive case: pitched synth, direct triggerAttackRelease(note, duration).
export function playToneNote() {
  new Tone.Synth().toDestination().triggerAttackRelease('C4', '8n')
}

// Positive case: NoiseSynth's triggerAttackRelease takes no note —
// duration only.
export function playToneNoise() {
  new Tone.NoiseSynth().toDestination().triggerAttackRelease('8n')
}

// Positive case: PolySynth with an explicit voice type (its own
// constructor's own first argument, a bare class reference) — a chord
// (array of notes) + duration.
export function playToneChord() {
  new Tone.PolySynth(Tone.FMSynth).toDestination().triggerAttackRelease(['C4', 'E4', 'G4'], '4n')
}

// Positive case: PluckSynth — the ONE allowlisted class whose internal
// LowpassCombFilter constructs an AudioWorkletNode through
// standardized-audio-context (none of the other 8 classes do). Dedicated
// coverage here specifically because that path used to crash the whole
// sidecar process (window.isSecureContext undefined) — see zzfx-play's
// CLAUDE.md and sidecar.ts's module-scope fix comment.
export function playTonePluck() {
  new Tone.PluckSynth().toDestination().triggerAttackRelease('C4', '8n')
}

// Positive case: a bare-identifier note resolves a varRef against its
// same-file declaration — same permissive posture zzfx/zzfxm/wad.synth
// already take for a bare-identifier argument (duration stays
// literal-only). Structurally identical to zzfx(...preset) resolving a
// same-file const; there's no reason this should read as "unsupported".
const dynamicNote = 'C4'
export function playToneDynamicNote() {
  new Tone.Synth().toDestination().triggerAttackRelease(dynamicNote, '8n')
}

// Negative-ish case: the note comes from a function parameter, not a
// top-level declaration the scanner can resolve — still surfaces a
// CodeLens (permissive posture: the scanner can't know a parameter's
// runtime value, so it defers to the client the same way an unresolvable
// wad.synth/zzfxm varRef already does), but clicking Play must fail
// gracefully with a loadError rather than attempting playback.
export function playToneUnresolvableNote(note: string) {
  new Tone.Synth().toDestination().triggerAttackRelease(note, '8n')
}

// Positive case (slow tier): audio.file via bare Audio whose path misses
// every FAST tier — thunder.ogg lives only at media/deep/thunder.ogg, so
// the lens resolves via the workspace-wide basename fallback search
// (`$(search) Searching…` → ▶ Play). Also the lazy-repair cycle's subject: the
// e2e deletes/re-adds the file around Play attempts.
export function playThunderSfx() {
  new Audio('thunder.ogg').play()
}

// Not-found case: audio.file via bare Audio, an UNRESOLVABLE path — no
// copy exists anywhere, so the fallback search settles to a
// `$(search) Not Found` lens (an informational signal, not silent
// absence — see #41).
export function playMissingSfx() {
  new Audio('nonexistent-sound.mp3').play()
}

// Negative cases: commented out — must NOT surface a CodeLens.
// new Audio('should-not-appear.wav')
// new Howl({ src: ['also-should-not-appear.wav'] })
