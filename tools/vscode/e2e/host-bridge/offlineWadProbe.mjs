#!/usr/bin/env node
// DETERMINISTIC audibility gate for Wad (`web-audio-daw`) — the sibling of
// `offlineRenderProbe.mjs` (which covers zzfx/zzfxm's `playSampleChannels`
// output path only, per that file's header comment). Wad has its own,
// separate output graph (`tools/audio-play/src/player.ts`'s
// `playWadSynth`) with its own historically-real Electron silent-bug class
// (see `tools/audio-play/CLAUDE.md`'s "noise-buffer" pitfall) — this probe
// closes the device-independent regression-guard gap for it, the same way
// `offlineRenderProbe.mjs` does for zzfx/zzfxm: render a real Wad oscillator
// play through an `OfflineAudioContext` and assert the known non-zero
// samples survive to the rendered buffer. No audio device, no analyser
// poll, no warmup, no timer, no sleep — `offline.startRendering()`
// resolving IS the completion signal.
//
// It imports and executes the REAL production `playWadSynth` (`tools/
// audio-play/src/player.ts`) against a REAL, unmodified `web-audio-daw`
// constructor — it does not reimplement Wad's oscillator/envelope DSP, so a
// real regression in either the wiring or the upstream package is caught,
// not mimicked.
//
// --- Why the FakeAudioContext dance below is here at all ---
// Wad has no constructor-injection point for its `AudioContext` — its CJS
// bundle reads `window.AudioContext || window.webkitAudioContext` ONCE, at
// `require()` time, and permanently captures whatever `new audioContext()`
// returns as its own module-scope `context` singleton
// (`web-audio-daw@4.13.4`'s `build/wad.js`). `sidecar.ts`'s
// `loadWadConstructor()` solves this in production by patching
// `window.AudioContext`/`webkitAudioContext` (both the bare-global AND
// `window`-scoped aliases — `node-web-audio-api`'s polyfill installs
// `globalThis.window` as a genuinely separate object, not an alias, see
// that function's doc comment) to a constructor that explicitly returns the
// REAL `ZZFX.audioContext` instance (the "explicit-object-return `new`
// trick"), so Wad adopts the shared context instead of creating its own
// second, incompatible one. This probe does the exact same trick, just
// pointed at an `OfflineAudioContext` instead of a realtime one — matching
// the task's "Wad oscillator play rendered through an OfflineAudioContext"
// shape, and confirmed empirically to work: Wad's own internal
// `context.createOscillator()`/`createGain()`/`.start()` calls land on our
// offline context, and `offline.startRendering()` renders the real
// waveform.
//
// --- Why this probe is oscillator-only (`source: 'sine'`), not noise ---
// Wad's bundle pre-renders a shared noise buffer at import time via
// `noiseBuffer.getChannelData(0)` + a fill loop — the exact
// getChannelData()-then-write anti-pattern this package's docs describe as
// silently losing its write under Electron's node-web-audio-api integration
// (detached copy, not a live view). `sidecar.ts`'s `loadWadConstructor()`
// already carries a dedicated, separate fix for that (intercept
// `createBuffer`, re-commit via `copyToChannel` — see its doc comment and
// `tools/audio-play/CLAUDE.md`'s "noise-buffer" pitfall). Reproducing that
// fix here would either duplicate production wiring logic or import
// `sidecar.ts` itself (which owns stdin/stdout process wiring this probe
// must not start). An oscillator source sidesteps that codepath entirely —
// `setUpOscillator` creates and drives a live `OscillatorNode`, no
// AudioBuffer write involved — so this probe is a real, uncompromised
// audibility proof for Wad's oscillator path specifically.
//
// Prints exactly one verdict line on stdout:
//   RENDER_OK peak=<n> energy=<n> frames=<n>
//   RENDER_SILENT peak=<n> energy=<n>
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// host-bridge -> e2e -> vscode -> (sibling) audio-play.
const requireFromAudioPlay = createRequire(new URL('../../../audio-play/package.json', import.meta.url))

// Installs the real `globalThis.window` (via `node-web-audio-api/
// polyfill.js`) the exact same way `sidecar.ts` does, first — this module
// is otherwise a no-op for this probe (we never construct a realtime
// `AudioContext`), but importing the REAL module keeps the environment
// wiring identical to production instead of a second, hand-rolled polyfill
// import.
await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/audioContextGuard.js')).href)

const { OfflineAudioContext } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('node-web-audio-api')).href
)
const { playWadSynth } = await import(pathToFileURL(requireFromAudioPlay.resolve('./dist/player.js')).href)

const sampleRate = 44100
const frames = Math.floor(sampleRate * 0.3) // covers the fixture's short attack/hold/release comfortably
const offline = new OfflineAudioContext(1, frames, sampleRate)

// The explicit-object-return `new` trick (see file doc comment) — makes
// `new window.AudioContext()` (Wad's own require-time call) hand back OUR
// OfflineAudioContext instance instead of constructing a real one.
function FakeAudioContext() {
  return offline
}

// The 3 additional shims `loadWadConstructor()` applies are Wad's own
// import-time touches, not audio-graph related — `document.querySelector`,
// no-op `window.addEventListener`/`removeEventListener` (Wad registers an
// "unlock on click" listener that must never actually fire here), and
// `window.navigator` (Node >=21 ships a built-in read-only `navigator`
// global, hence `defineProperty` rather than plain assignment).
globalThis.document ??= { querySelector: () => null }
globalThis.window.addEventListener ??= () => {}
globalThis.window.removeEventListener ??= () => {}
Object.defineProperty(globalThis.window, 'navigator', {
  value: {},
  configurable: true,
  writable: true,
})
globalThis.AudioContext = FakeAudioContext
;(globalThis).webkitAudioContext = FakeAudioContext
globalThis.window.AudioContext = FakeAudioContext
;(globalThis.window).webkitAudioContext = FakeAudioContext

// CJS/UMD bundle (no `"type"` field) — a synchronous `require()` via
// `createRequire` is what actually triggers Wad's module-scope `context =
// new audioContext()` call, adopting our offline context above. Must run
// AFTER the monkey-patch, same ordering constraint `loadWadConstructor()`
// documents (require() caches the module — patching after the first
// require would be a no-op).
const nodeRequire = createRequire(new URL('../../../audio-play/package.json', import.meta.url))
const WadCtor = nodeRequire('web-audio-daw')

// A fixed, known non-zero fixture: a 440Hz sine oscillator, full volume,
// a short deterministic envelope (Wad's own default `hold` is ~3.14s —
// far longer than this probe's render window needs, so it's overridden
// short here). `destination` routes straight into `playWadSynth`'s own
// gain -> analyser -> destination graph (the same production wiring
// `sidecar.ts` relies on), never a bare `.connect()` after the fact.
playWadSynth(
  offline,
  WadCtor,
  {
    source: 'sine',
    pitch: 440,
    volume: 1,
    env: { attack: 0, decay: 0, sustain: 1, hold: 0.05, release: 0.01 },
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
// No process.exit() — see offlineRenderProbe.mjs's doc comment for why:
// Node doesn't guarantee pending stdout writes are flushed by
// process.exit(), and the parent settles on the child's 'close' event.
// Wad (unlike Tone, see offlineToneProbe.mjs) registers no persistent
// timers/tickers of its own, so falling off the end here exits naturally
// and immediately.
process.exitCode = 0
