#!/usr/bin/env node
// DETERMINISTIC audibility gate for Tone.js — the sibling of
// `offlineRenderProbe.mjs` (zzfx/zzfxm's `playSampleChannels` only) and
// `offlineWadProbe.mjs` (Wad). Tone has its own output graph
// (`tools/audio-play/src/player.ts`'s `playToneSynth`) with its own
// historically-real Electron/Node bug classes documented in
// `tools/audio-play/CLAUDE.md` — the AudioWorklet crash (`PluckSynth`'s
// internal `LowpassCombFilter`) and the `getConstant()` detached-buffer
// trap (`DuoSynth`'s vibrato `LFO`, currently dormant since `val === 0`
// happens to be the buffer's already-correct zero default). This probe
// closes the device-independent regression-guard gap for the Tone path:
// render a real `Tone.Synth` play through an `OfflineAudioContext` and
// assert the known non-zero samples survive to the rendered buffer. No
// audio device, no analyser poll, no warmup, no timer/sleep of THIS
// probe's own — `offline.startRendering()` resolving IS the completion
// signal (see "Tone's own perpetual timer" below for the one closely
// related wrinkle this file has to work around, which is not that).
//
// It imports and executes the REAL production `playToneSynth` (`tools/
// audio-play/src/player.ts`) against a REAL, unmodified `tone` package,
// built into the exact same `ToneEngine` shape `sidecar.ts`'s
// `loadToneEngine()` builds — it does not reimplement Tone's synth/
// envelope DSP, so a real regression in either the wiring or the upstream
// package is caught, not mimicked.
//
// --- The two environment shims `sidecar.ts` sets before importing `tone` ---
// Mirrored here, unconditionally, at module scope, before `tone`'s own
// first import — exactly `sidecar.ts`'s own ordering (see that file's
// header comment for the full empirical trace): `standardized-audio-
// context` (a `tone` dependency) computes its exported `AudioWorkletNode`
// once at import time gated on `window.isSecureContext`, which our shim
// `window` never sets, permanently resolving it to `undefined`; separately
// `tone`'s own `createAudioWorkletNode` reads the bare `self` global, which
// doesn't exist under Node at all. Neither of this probe's own synth types
// route through `ToneAudioWorklet` (only `PluckSynth` does, per
// `tools/audio-play/CLAUDE.md`), so neither shim is strictly exercised by
// THIS probe's fixture — they're set anyway, matching the exact
// unconditional ordering `sidecar.ts` uses, so this probe proves the same
// environment a real `playToneSynth` call runs in, not a hand-picked
// subset of it.
//
// --- Tone's own perpetual timer, and why this probe disposes a context it never asked for ---
// Merely importing `tone` (`build/esm/index.js`) eagerly evaluates
// `export const Transport = getContext().transport` (and `Destination`/
// `Listener`/`Draw`/`context` alongside it) at MODULE-EVALUATION time —
// before this probe (or `sidecar.ts`, for that matter) gets a chance to
// call `Tone.setContext(...)`. `getContext()`'s lazy-default path
// constructs a brand-new REALTIME `Context` wrapping `new
// window.AudioContext()`, and that `Context`'s constructor unconditionally
// creates a `Ticker` (`core/clock/Ticker.js`). The Ticker's preferred
// `"worker"` clock source needs a real `Worker` global, which doesn't exist
// under Node — construction throws, caught internally, and it falls back
// to `"timeout"`: a `setTimeout` that reschedules ITSELF forever
// (`_createTimeout`), with no natural termination. Verified empirically:
// left alone, this keeps the process alive indefinitely — the process
// never exits on its own, confirmed by a run that had to be killed after
// exceeding a 2-minute wall-clock cap.
//
// `sidecar.ts` never notices this — it's a long-lived process that would
// stay alive anyway, and one abandoned default context's timer is a minor,
// pre-existing resource characteristic, not something this probe's task
// owns fixing. This probe is a short-lived, single-shot process that MUST
// exit promptly once it has its verdict, so it captures the eager default
// context and disposes it BEFORE switching to the offline one — the exact
// same "dispose the old wrapper, then setContext" order
// `contextLifecycle.ts`'s `onReacquired` hook already uses for the
// unrelated reacquire-after-device-loss case (`toneApi.getContext().
// dispose()` then `toneApi.setContext(ctx)`), just triggered here by
// import-time eagerness instead of a context swap.
//
// `Context.dispose()` cascades into `Draw`'s own teardown
// (`core/util/Draw.js`), which unconditionally calls the browser-only
// `cancelAnimationFrame` global — absent under plain Node/node-web-audio-
// api, so disposal throws a `ReferenceError` without a stub. The two
// `requestAnimationFrame`/`cancelAnimationFrame` shims below are a plain
// environment shim (Node genuinely lacks a browser global Tone's cleanup
// path assumes), not a reimplementation of anything Tone or this package
// does — same category as `isSecureContext`/`self` above.
//
// Prints exactly one verdict line on stdout:
//   RENDER_OK peak=<n> energy=<n> frames=<n>
//   RENDER_SILENT peak=<n> energy=<n>
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// host-bridge -> e2e -> vscode -> (sibling) audio-play.
const requireFromAudioPlay = createRequire(new URL('../../../audio-play/package.json', import.meta.url))

// Real `globalThis.window` (via `node-web-audio-api/polyfill.js`), same
// module `sidecar.ts` imports first — see offlineWadProbe.mjs's matching
// comment for why importing the REAL module beats a second hand-rolled
// polyfill import.
await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/audioContextGuard.js')).href)

// Set BEFORE tone's own first import — see file doc comment.
globalThis.window.isSecureContext = true
globalThis.self ??= globalThis.window
// Environment shims for Tone's context-dispose teardown (Draw.js) — see
// "Tone's own perpetual timer" above. Real browsers provide both; Node
// does not.
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 16)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

const { OfflineAudioContext } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('node-web-audio-api')).href
)
const { playToneSynth } = await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/player.js')).href)

const sampleRate = 44100
const frames = Math.floor(sampleRate * 0.3) // covers the fixture's 0.1s note + 0.05s release comfortably
const offline = new OfflineAudioContext(1, frames, sampleRate)

const Tone = await import(pathToFileURL(requireFromAudioPlay.resolve('tone')).href)

// Dispose the eager default realtime context's Ticker BEFORE switching —
// see "Tone's own perpetual timer" above. This is the ONLY reason this
// probe touches `Tone.getContext()` at all; the context it returns here is
// never used for anything else.
Tone.getContext().dispose()

// Same call `sidecar.ts`'s `loadToneEngine()` makes, just pointed at an
// OfflineAudioContext instead of the realtime `ZZFX.audioContext` — `Tone.
// setContext` itself branches on `isOfflineAudioContext(...)` and wraps it
// in Tone's own `OfflineContext` (whose `clockSource: "offline"` creates NO
// ticker at all, unlike the default realtime one above), matching the
// task's "OfflineAudioContext bound via Tone.setContext" shape.
Tone.setContext(offline)

// The exact `ToneEngine` shape `sidecar.ts`'s `loadToneEngine()` builds
// from the real `tone` module (`tools/audio-play/src/player.ts`'s
// `ToneEngine` type) — reproduced here structurally rather than imported,
// since `loadToneEngine` itself is a private, non-exported closure over
// `sidecar.ts`'s own stdin/stdout process wiring this probe must not start.
const toneEngine = {
  classes: {
    Synth: Tone.Synth,
    AMSynth: Tone.AMSynth,
    FMSynth: Tone.FMSynth,
    DuoSynth: Tone.DuoSynth,
    MembraneSynth: Tone.MembraneSynth,
    MetalSynth: Tone.MetalSynth,
    PluckSynth: Tone.PluckSynth,
    NoiseSynth: Tone.NoiseSynth,
    PolySynth: Tone.PolySynth,
  },
  Time: (value) => Tone.Time(value),
}

// A fixed, known non-zero fixture: a plain `Tone.Synth` (oscillator +
// amplitude envelope — none of the AudioWorklet-routed classes), a short
// note against a short release override (Tone.Synth's own default release
// is 1s — far longer than this probe's render window needs).
playToneSynth(
  offline,
  toneEngine,
  {
    synthType: 'Synth',
    note: 'C4',
    duration: 0.1,
    config: { envelope: { release: 0.05 } },
  },
  1 // masterVolume — same param `sidecar.ts` computes as `ZZFX.volume * volume`
)

const rendered = await offline.startRendering() // <- the deterministic signal
const out = new Float32Array(rendered.length)
rendered.copyFromChannel(out, 0)
let peak = 0
let energy = 0
for (const v of out) {
  const a = Math.abs(v)
  if (a > peak) peak = a
  energy += v * v
}

console.log(
  peak > 1e-3
    ? `RENDER_OK peak=${peak.toFixed(4)} energy=${energy.toFixed(1)} frames=${out.length}`
    : `RENDER_SILENT peak=${peak.toFixed(6)} energy=${energy.toFixed(6)}`
)
// No process.exit() — see offlineRenderProbe.mjs's doc comment for why.
// Disposing the eager default context's Ticker above is what makes falling
// off the end here actually exit promptly instead of hanging forever.
process.exitCode = 0
