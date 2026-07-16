#!/usr/bin/env node
// DETERMINISTIC audibility gate for Tone's AudioWorklet path
// (`Tone.PluckSynth`'s internal `LowpassCombFilter`) — the sibling of
// `offlineToneProbe.mjs` (plain `Tone.Synth`, no AudioWorklet involved).
// `PluckSynth` is the ONE allowlisted Tone class whose construction routes
// through `ToneAudioWorklet` → `standardized-audio-context`'s
// `AudioWorkletNode`, which is exactly the path
// `tools/audio-play/CLAUDE.md` documents as having historically CRASHED
// THE ENTIRE SIDECAR PROCESS (`window.isSecureContext`/`self` undefined in
// our shim `window`) before `toneEngineLoader.ts`'s `setupToneEnvironment`
// fix. `zzfx-synth-lenses.spec.ts`'s device-less e2e tests for PluckSynth
// can only prove "the process didn't crash/hang" (ping liveness) — a
// device-less runner Nacks before Tone/AudioWorklet code ever runs, and
// the OLD `offlineToneProbe.mjs` exercised plain `Tone.Synth`, never the
// worklet path — so a regression in the `isSecureContext`/`self` shims
// could delete the production fix and stay green everywhere. THIS probe
// closes that gap: it renders a real `Tone.PluckSynth` play — genuinely
// constructing a native `AudioWorkletNode` via
// `standardized-audio-context` — through an `OfflineAudioContext`, and
// asserts the known non-zero samples survive. No audio device needed:
// `node-web-audio-api`'s AudioWorklet mechanism is native Worker-thread
// based, independent of any actual output device.
//
// It calls the REAL production `loadToneEngine`/`setupToneEnvironment`
// (`tools/audio-play/src/toneEngineLoader.ts`) and `playToneSynth`
// (`tools/audio-play/src/player.ts`) — no reimplementation of the shims or
// the synth/envelope/worklet DSP.
//
// --- Why this probe needs an extra wait `offlineToneProbe.mjs` doesn't ---
// `PluckSynth`'s `LowpassCombFilter` constructs a `ToneAudioWorklet`
// (`build/esm/core/worklet/ToneAudioWorklet.js`), whose constructor kicks
// off `this.context.addAudioWorkletModule(blobUrl).then(() => { this.
// _worklet = this.context.createAudioWorkletNode(...) })` WITHOUT
// awaiting it — by design, so synth construction stays synchronous. In
// the REALTIME sidecar this is harmless (the AudioContext just keeps
// running; the worklet node connects a few milliseconds later, and the
// pluck plays audibly, just slightly delayed). In an OFFLINE context,
// `startRendering()` captures a fixed time window in one shot — calling it
// immediately after `playToneSynth` returns would race ahead of the
// addModule()/createAudioWorkletNode() chain entirely (worker-thread
// startup + message round-trips take many event-loop ticks, nowhere near
// "next microtask"), rendering silence for reasons that have NOTHING to do
// with whether the shims/AudioWorklet path actually work — a false
// negative that would make this probe useless. `node-web-audio-api`'s own
// `OfflineAudioContext.startRendering()` DOES wait for already-registered
// AudioWorkletProcessor construction (`audioWorklet[kCheckProcessorsCreated]`
// in `AudioWorklet.js`), but that check only helps once a processor
// creation has actually been REQUESTED — it does nothing while
// `addAudioWorkletModule` itself is still in flight.
//
// The fix: await `Tone.getContext().workletsAreReady()` (Tone's own
// public API for exactly this — `OfflineContext.render()`, Tone's own
// offline-rendering entry point, uses the identical call before
// rendering) between `playToneSynth` and `offline.startRendering()`. This
// is a real completion signal (a Promise Tone itself exposes), not a
// test-authored timer/sleep — the same "await the real signal, don't
// guess a duration" posture every other probe in this family already
// uses for `offline.startRendering()` itself.
//
// See `offlineToneProbe.mjs`'s own header comment for the eager-default-
// context dispose dance (`Tone.getContext().dispose()` before switching)
// and the `requestAnimationFrame`/`cancelAnimationFrame` shims — both
// repeated here unchanged, for the same reasons.
//
// Prints exactly one verdict line on stdout (`offlineRenderOracle.mjs`):
//   RENDER_OK peak=<n> energy=<n> frames=<n> zeroCrossings=<n>
//   RENDER_SILENT peak=<n> energy=<n>
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { analyzeRenderedBuffer, printVerdict } from './offlineRenderOracle.mjs'

// host-bridge -> e2e -> vscode -> (sibling) audio-play.
const requireFromAudioPlay = createRequire(new URL('../../../audio-play/package.json', import.meta.url))

await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/audioContextGuard.js')).href)

const { loadToneEngine, setupToneEnvironment } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('./dist/toneEngineLoader.js')).href
)

// The EXACT production shim function — must run before THIS probe's own
// `import('tone')` below (see offlineToneProbe.mjs's doc comment for the
// full ordering rationale; identical here). `loadToneEngine` (called
// later) also calls this itself; redundant-safe (idempotent).
setupToneEnvironment()

// Probe-only environment shims for Tone's context-dispose teardown
// (Draw.js) — see offlineToneProbe.mjs's header comment.
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 16)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

const { OfflineAudioContext } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('node-web-audio-api')).href
)
const { playToneSynth } = await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/player.js')).href)

const Tone = await import(pathToFileURL(requireFromAudioPlay.resolve('tone')).href)

// Dispose the eager default realtime context's Ticker BEFORE switching —
// see offlineToneProbe.mjs's header comment.
Tone.getContext().dispose()

const sampleRate = 44100
// Generous window: PluckSynth's attack noise burst + comb-filter decay
// tail needs more room than the plain-Synth probe's 0.3s.
const frames = Math.floor(sampleRate * 0.5)
const offline = new OfflineAudioContext(1, frames, sampleRate)

// The EXACT production Tone bring-up (`toneEngineLoader.ts`'s
// `loadToneEngine`) — env shims (redundant-safe re-application) +
// `import('tone')` (cache hit) + `Tone.setContext` + the explicit
// nine-class `ToneEngine` table, INCLUDING `PluckSynth`. No
// reimplementation here.
const { engine, getContext } = await loadToneEngine(offline)

// A fixed, known non-zero fixture: `Tone.PluckSynth`, default config (no
// `envelope.release` override — PluckSynth has no `.envelope`, only a
// top-level `.release`, defaulted to 1s by Tone itself; `player.ts`'s
// `toneReleaseSeconds` reads that off the constructed instance, so
// `playToneSynth`'s own duration math already accounts for it).
playToneSynth(
  offline,
  engine,
  {
    synthType: 'PluckSynth',
    note: 'C4',
    duration: 0.1,
    config: {},
  },
  1 // masterVolume — same param `sidecar.ts` computes as `ZZFX.volume * volume`
)

// Wait for the AudioWorkletNode to actually be constructed and connected
// before capturing the render window — see the file doc comment's "Why
// this probe needs an extra wait" section. A real completion signal, not
// a sleep.
await getContext().workletsAreReady()

const rendered = await offline.startRendering() // <- the deterministic signal
printVerdict(analyzeRenderedBuffer(rendered))
// No process.exit() — see offlineRenderProbe.mjs's doc comment for why.
// Disposing the eager default context's Ticker above is what makes falling
// off the end here actually exit promptly instead of hanging forever.
process.exitCode = 0
