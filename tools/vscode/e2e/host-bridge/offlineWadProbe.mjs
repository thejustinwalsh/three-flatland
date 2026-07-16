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
// It calls the REAL production `loadWadConstructor` (`tools/audio-play/
// src/wadLoader.ts`) and `playWadSynth` (`tools/audio-play/src/player.ts`)
// against a REAL, unmodified `web-audio-daw` constructor — no
// reimplementation of the constructor-adoption dance or the noise-buffer
// repair here, just this probe's own `OfflineAudioContext` passed in where
// production passes `ZZFX.audioContext`. This is what closes the gap the
// adversarial review found: this probe used to hand-roll its OWN adoption
// dance WITHOUT the noise-buffer repair, so a regression in that repair
// (`wadLoader.ts`) stayed green — see `offlineWadNoiseProbe.mjs`, the
// sibling probe that specifically exercises `source: 'noise'` and would
// have caught it.
//
// This probe itself stays oscillator-only (`source: 'sine'`) — a real,
// uncompromised audibility proof for Wad's oscillator path, which never
// touches the noise-buffer repair at all (`setUpOscillator` drives a live
// `OscillatorNode`, no `AudioBuffer` write involved).
//
// Prints exactly one verdict line on stdout (`offlineRenderOracle.mjs`):
//   RENDER_OK peak=<n> energy=<n> frames=<n> zeroCrossings=<n>
//   RENDER_SILENT peak=<n> energy=<n>
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { analyzeRenderedBuffer, printVerdict } from './offlineRenderOracle.mjs'

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
const { loadWadConstructor } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('./dist/wadLoader.js')).href
)

const sampleRate = 44100
const frames = Math.floor(sampleRate * 0.3) // covers the fixture's short attack/hold/release comfortably
const offline = new OfflineAudioContext(1, frames, sampleRate)

// The EXACT production adoption dance (`wadLoader.ts`'s
// `loadWadConstructor`) — just pointed at this OfflineAudioContext instead
// of `ZZFX.audioContext`. No hand-rolled FakeAudioContext/shim duplication
// here.
const WadCtor = loadWadConstructor(offline)

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
printVerdict(analyzeRenderedBuffer(rendered))
// No process.exit() — see offlineRenderProbe.mjs's doc comment for why:
// Node doesn't guarantee pending stdout writes are flushed by
// process.exit(), and the parent settles on the child's 'close' event.
// Wad (unlike Tone, see offlineToneProbe.mjs) registers no persistent
// timers/tickers of its own, so falling off the end here exits naturally
// and immediately.
process.exitCode = 0
