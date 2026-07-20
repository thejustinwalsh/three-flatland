#!/usr/bin/env node
// DETERMINISTIC audibility gate for Tone.js — the sibling of
// `offlineRenderProbe.mjs` (zzfx/zzfxm's `playSampleChannels` only) and
// `offlineWadProbe.mjs` (Wad). Tone has its own output graph
// (`tools/audio-play/src/player.ts`'s `playToneSynth`) with its own
// historically-real Electron/Node bug classes documented in
// `tools/audio-play/AGENTS.md` — the AudioWorklet crash (`PluckSynth`'s
// internal `LowpassCombFilter`, see `offlineTonePluckProbe.mjs` for the
// dedicated regression guard) and the `getConstant()` detached-buffer trap
// (`DuoSynth`'s vibrato `LFO`, currently dormant since `val === 0` happens
// to be the buffer's already-correct zero default). THIS probe covers the
// device-independent regression-guard for the non-AudioWorklet Tone path:
// render a real `Tone.Synth` play through an `OfflineAudioContext` and
// assert the known non-zero samples survive to the rendered buffer. No
// audio device, no analyser poll, no warmup, no timer/sleep of THIS
// probe's own — `offline.startRendering()` resolving IS the completion
// signal (see "Tone's own perpetual timer" below for the one closely
// related wrinkle this file has to work around, which is not that).
//
// It calls the REAL production `loadToneEngine`/`setupToneEnvironment`
// (`tools/audio-play/src/toneEngineLoader.ts`) and `playToneSynth`
// (`tools/audio-play/src/player.ts`) against a REAL, unmodified `tone`
// package — it does not reimplement Tone's synth/envelope DSP OR the
// `isSecureContext`/`self` environment shims by hand (a prior version of
// this probe hand-rolled the shims itself, sharing only `player.ts`'s
// graph with production — a regression in `sidecar.ts`'s OWN shim-setting
// code could have stayed green; see `offlineTonePluckProbe.mjs`'s
// break-and-revert coverage for the guard this now provides).
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
// under Node; construction throws, caught internally, and it falls back
// to `"timeout"`: a `setTimeout` that reschedules ITSELF forever
// (`_createTimeout`), with no natural termination. Verified empirically:
// left alone, this keeps the process alive indefinitely.
//
// `sidecar.ts` never notices this — it's a long-lived process that would
// stay alive anyway, and one abandoned default context's timer is a minor,
// pre-existing resource characteristic, not something this probe's task
// owns fixing (this is why the dispose-the-eager-context dance below lives
// in THIS probe, not in `toneEngineLoader.ts`'s shared production helper —
// production never needs it). This probe is a short-lived, single-shot
// process that MUST exit promptly once it has its verdict, so it captures
// the eager default context and disposes it BEFORE switching to the
// offline one — the exact same "dispose the old wrapper, then setContext"
// order `contextLifecycle.ts`'s `onReacquired` hook already uses for the
// unrelated reacquire-after-device-loss case, just triggered here by
// import-time eagerness instead of a context swap.
//
// --- Why that eager construction must be given an offline-backed context ---
// That same import-time `new window.AudioContext()` is ALSO why this
// probe can't just run as-is on a device-less runner: the guard hands
// back a degraded stand-in with no `.destination`, and `standardized-
// audio-context` crashes reading `destination.channelCount` while
// building the eager context — before this probe renders a single sample.
// `installOfflineEagerAudioContext` (`toneOfflineEnv.mjs`, called below
// before `import('tone')`) backs that throwaway construction with an
// `OfflineAudioContext` instead, which needs no device and has a real
// `.destination`. That is what makes "No audio device" above actually
// true on CI, not just on a dev box that happens to have one.
//
// This probe's OWN `import('tone')` (used only to grab+dispose that eager
// context) happens BEFORE `toneEngineLoader.ts`'s `loadToneEngine` ever
// runs — so it must call the shared `setupToneEnvironment` explicitly
// FIRST, itself, before that import: `standardized-audio-context` (a
// `tone` dependency) computes its exported `AudioWorkletNode` ONCE, at ITS
// OWN module-evaluation time (i.e. at `tone`'s FIRST import, wherever it
// happens), gated on `window.isSecureContext` — setting the shim any later
// would be a no-op. `loadToneEngine` also calls `setupToneEnvironment`
// itself (idempotent), so this is not a duplicated reimplementation of the
// shim logic — just the same production function invoked once earlier by
// this probe, for this probe's own eager-context-dispose need.
//
// `Context.dispose()` cascades into `Draw`'s own teardown
// (`core/util/Draw.js`), which unconditionally calls the browser-only
// `cancelAnimationFrame` global — absent under plain Node/node-web-audio-
// api, so disposal throws a `ReferenceError` without a stub. The two
// `requestAnimationFrame`/`cancelAnimationFrame` shims below are a plain
// environment shim this PROBE needs for ITS OWN dispose call (production
// never disposes a Tone context this way), not a reimplementation of
// anything Tone or `toneEngineLoader.ts` does.
//
// Prints exactly one verdict line on stdout (`offlineRenderOracle.mjs`):
//   RENDER_OK peak=<n> energy=<n> frames=<n> zeroCrossings=<n>
//   RENDER_SILENT peak=<n> energy=<n>
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { analyzeRenderedBuffer, printVerdict } from './offlineRenderOracle.mjs'
import { installOfflineEagerAudioContext } from './toneOfflineEnv.mjs'

// host-bridge -> e2e -> vscode -> (sibling) audio-play.
const requireFromAudioPlay = createRequire(
  new URL('../../../audio-play/package.json', import.meta.url)
)

// Real `globalThis.window` (via `node-web-audio-api/polyfill.js`), same
// module `sidecar.ts` imports first.
await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/audioContextGuard.js')).href)

const { loadToneEngine, setupToneEnvironment } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('./dist/toneEngineLoader.js')).href
)

// The EXACT production shim function — must run before THIS probe's own
// `import('tone')` below (see file doc comment). `loadToneEngine` (called
// later) also calls this itself; redundant-safe (idempotent).
setupToneEnvironment()

// Environment shims for Tone's context-dispose teardown (Draw.js) — see
// "Tone's own perpetual timer" above. Real browsers provide both; Node
// does not. Probe-only: production never disposes a Tone context this way.
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 16)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

const { OfflineAudioContext } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('node-web-audio-api')).href
)
const { playToneSynth } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('./dist/player.js')).href
)

// Back Tone's UNAVOIDABLE eager import-time realtime-context construction
// with an OfflineAudioContext — MUST precede `import('tone')`. Without it
// this probe crashes at import on a device-less runner (the guard's
// degraded stand-in has no `.destination`). See `toneOfflineEnv.mjs`.
installOfflineEagerAudioContext(OfflineAudioContext)

const Tone = await import(pathToFileURL(requireFromAudioPlay.resolve('tone')).href)

// Dispose the eager default realtime context's Ticker BEFORE switching —
// see "Tone's own perpetual timer" above. This is the ONLY reason this
// probe touches `Tone.getContext()` directly; the context it returns here
// is never used for anything else.
Tone.getContext().dispose()

const sampleRate = 44100
const frames = Math.floor(sampleRate * 0.3) // covers the fixture's 0.1s note + 0.05s release comfortably
const offline = new OfflineAudioContext(1, frames, sampleRate)

// The EXACT production Tone bring-up (`toneEngineLoader.ts`'s
// `loadToneEngine`) — env shims (redundant-safe re-application) +
// `import('tone')` (cache hit, same module instance) + `Tone.setContext` +
// the explicit nine-class `ToneEngine` table. No reimplementation here.
const { engine } = await loadToneEngine(offline)

// A fixed, known non-zero fixture: a plain `Tone.Synth` (oscillator +
// amplitude envelope — none of the AudioWorklet-routed classes), a short
// note against a short release override (Tone.Synth's own default release
// is 1s — far longer than this probe's render window needs).
playToneSynth(
  offline,
  engine,
  {
    synthType: 'Synth',
    note: 'C4',
    duration: 0.1,
    config: { envelope: { release: 0.05 } },
  },
  1 // masterVolume — same param `sidecar.ts` computes as `ZZFX.volume * volume`
)

const rendered = await offline.startRendering() // <- the deterministic signal
printVerdict(analyzeRenderedBuffer(rendered))
// No process.exit() — see offlineRenderProbe.mjs's doc comment for why.
// Disposing the eager default context's Ticker above is what makes falling
// off the end here actually exit promptly instead of hanging forever.
process.exitCode = 0
