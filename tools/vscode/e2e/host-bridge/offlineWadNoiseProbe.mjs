#!/usr/bin/env node
// DETERMINISTIC audibility gate for Wad's `source: 'noise'` path — the
// sibling of `offlineWadProbe.mjs` (oscillator sources only, see that
// file's header comment for why). `web-audio-daw`'s own bundle pre-renders
// a shared noise buffer at IMPORT TIME via
// `noiseBuffer.getChannelData(0)` + a fill loop — the exact
// `getChannelData()`-then-write anti-pattern that silently loses its write
// under `node-web-audio-api`/Electron (a detached copy, not a live view;
// see `tools/audio-play/AGENTS.md`'s "noise-buffer" pitfall and
// `player.ts`'s file doc comment for the root cause). `wadLoader.ts`'s
// `loadWadConstructor` carries a dedicated repair for exactly this
// (intercept the one `createBuffer` call Wad's import-time IIFE makes,
// re-commit real noise samples via `copyToChannel`) — this probe is the
// regression guard for THAT repair specifically: it renders a real
// `source: 'noise'` Wad play through an `OfflineAudioContext` and asserts
// the known non-zero samples survive. Break the repair (e.g. revert to a
// bare `require('web-audio-daw')` with no `createBuffer` intercept) and
// this probe renders exact silence.
//
// It calls the REAL production `loadWadConstructor` (`tools/audio-play/
// src/wadLoader.ts`) and `playWadSynth` (`tools/audio-play/src/player.ts`)
// against a REAL, unmodified `web-audio-daw` constructor — no
// reimplementation of the repair here, just this probe's own
// `OfflineAudioContext` passed in where production passes
// `ZZFX.audioContext`.
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
// polyfill.js`) the exact same way `sidecar.ts` does, first.
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

// The EXACT production adoption dance + noise-buffer repair
// (`wadLoader.ts`'s `loadWadConstructor`) — just pointed at this
// OfflineAudioContext instead of `ZZFX.audioContext`. The repair runs
// unconditionally as part of THIS call (it patches Wad's shared
// module-scope noise buffer, captured once at `require()` time), so a
// plain `source: 'noise'` play below exercises it directly.
const WadCtor = loadWadConstructor(offline)

// A fixed, known non-zero fixture: `source: 'noise'` at full volume, a
// short deterministic envelope matching `offlineWadProbe.mjs`'s oscillator
// fixture's timing so both probes render the same frame count.
playWadSynth(
  offline,
  WadCtor,
  {
    source: 'noise',
    volume: 1,
    env: { attack: 0, decay: 0, sustain: 1, hold: 0.05, release: 0.01 },
  },
  1 // masterVolume — same param `sidecar.ts` computes as `ZZFX.volume * volume`
)

const rendered = await offline.startRendering() // <- the deterministic signal
printVerdict(analyzeRenderedBuffer(rendered))
// No process.exit() — see offlineRenderProbe.mjs's doc comment for why.
// Wad registers no persistent timers/tickers of its own, so falling off
// the end here exits naturally and immediately.
process.exitCode = 0
