// Shared environment setup for the two Tone offline-render probes
// (`offlineToneProbe.mjs`, `offlineTonePluckProbe.mjs`). Both import
// `tone` to render production Tone init through an `OfflineAudioContext`;
// both therefore hit the same device-less landmine, and both must install
// what's here BEFORE their `import('tone')`.

/**
 * Back Tone's UNAVOIDABLE eager import-time realtime-context construction
 * with an `OfflineAudioContext`, so the Tone probes run on a device-less
 * runner (e.g. `ubuntu-latest` under `xvfb`, no audio device).
 *
 * WHY THIS IS NEEDED: merely importing `tone` (`build/esm/index.js`)
 * evaluates `export const Transport = getContext().transport` at
 * MODULE-EVALUATION time — before any code can call `Tone.setContext(...)`
 * — and `getContext()`'s lazy-default path constructs a realtime context
 * via `new window.AudioContext()`. On a device-less host
 * `audioContextGuard` catches the native device-less throw and returns a
 * minimal degraded stand-in with NO `.destination`; `standardized-audio-
 * context` (a `tone` dependency) then crashes with
 * `Cannot read properties of undefined (reading 'channelCount')` while
 * constructing that eager context's `AudioDestinationNode`. Verified with
 * a standalone repro reproducing the exact CI stack, and by the
 * device-less `vscode-e2e` run that first surfaced it.
 *
 * An `OfflineAudioContext` needs no audio device and exposes a real
 * `.destination`, so the eager construction survives. The eager context
 * is a throwaway — the probe disposes it (`Tone.getContext().dispose()`)
 * and rebinds to its own explicit render `OfflineAudioContext` via
 * `loadToneEngine(offline)` — so an offline-backed stand-in is
 * behaviorally fine for it. PRODUCTION never needs this: it Nacks
 * (`assertAudioDeviceAvailable`) before importing `tone` on a device-less
 * host, so it never constructs a Tone context device-less at all — this
 * is a probe-only concern, in the same category as the probes' existing
 * `requestAnimationFrame`/`isSecureContext` environment shims.
 *
 * Patches the same four globals `audioContextGuard` patches
 * (bare + `window`, `AudioContext` + `webkitAudioContext`) so whichever
 * one `standardized-audio-context` reads picks up the offline-backed ctor.
 */
export function installOfflineEagerAudioContext(OfflineAudioContext, sampleRate = 44100) {
  const ctor = function () {
    return new OfflineAudioContext(2, sampleRate, sampleRate)
  }
  globalThis.AudioContext = ctor
  globalThis.window.AudioContext = ctor
  globalThis.webkitAudioContext = ctor
  globalThis.window.webkitAudioContext = ctor
}

/**
 * Replace `Math.random` with a deterministic mulberry32 PRNG so a probe's
 * render is bit-reproducible run to run. Used ONLY by the PluckSynth
 * probe: `Tone.PluckSynth`'s Karplus-Strong excitation
 * (`Tone.Noise`'s noise buffer + its `Math.random()`-chosen start offset)
 * is the sole nondeterministic input to the otherwise-deterministic
 * comb-filter DSP. Seeding before `import('tone')` (Tone builds + caches
 * its noise buffer lazily on first `Noise` construction) makes
 * peak/energy/zeroCrossings exact, so the gate asserts tight two-sided
 * bounds — a real deterministic oracle — instead of a probabilistic
 * empirical floor (which could false-fail on an unlucky run: exactly the
 * flake class this whole determinism effort exists to kill). Integer-only
 * ops (`Math.imul`, `>>>`) → identical stream on every platform.
 */
export function seedMathRandom(seed) {
  let a = seed >>> 0
  globalThis.Math.random = function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
