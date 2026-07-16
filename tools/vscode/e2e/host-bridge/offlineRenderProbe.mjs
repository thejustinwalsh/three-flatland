#!/usr/bin/env node
// DETERMINISTIC audibility gate — replaces the real-device oracle + live
// analyser polling + warmup entirely. Runs the PRODUCTION output path
// (`playSampleChannels`, tools/audio-play/src/player.ts) against an
// OfflineAudioContext and asserts the known non-zero samples survive to the
// rendered buffer. No audio device, no PulseAudio, no analyser poll, no
// warmup, no timer, no sleep: `offline.startRendering()` resolving IS the
// completion signal, and the returned samples ARE the answer.
//
// This still catches the exact Electron-specific bug this guard exists for:
// a regression from `copyToChannel` back to `getChannelData().set()` in
// playSampleChannels writes into a detached copy under Electron's node
// integration and renders pure zeros. Verified under the real
// `Code Helper (Plugin)`: copyToChannel -> peak≈1, getChannelData -> peak=0.
//
// It imports and executes the REAL production function — it does not
// duplicate the write logic — so a real regression is caught, not mimicked.
//
// Prints exactly one verdict line on stdout (`offlineRenderOracle.mjs`):
//   RENDER_OK peak=<n> energy=<n> frames=<n> zeroCrossings=<n>
//   RENDER_SILENT peak=<n> energy=<n>
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { analyzeRenderedBuffer, printVerdict } from './offlineRenderOracle.mjs'

// host-bridge -> e2e -> vscode -> (sibling) audio-play.
const requireFromAudioPlay = createRequire(new URL('../../../audio-play/package.json', import.meta.url))
const { OfflineAudioContext } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('node-web-audio-api')).href
)
const { playSampleChannels } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('./dist/player.js')).href
)

const sampleRate = 44100
const frames = Math.floor(sampleRate * 0.2) // 0.2s is plenty; render is instant
// Fixed, known non-zero samples: a 440Hz sine at amplitude 0.5.
const samples = new Float32Array(frames)
for (let i = 0; i < frames; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5

const offline = new OfflineAudioContext(1, frames, sampleRate)
// The SAME function real playback uses — buffer via copyToChannel,
// source -> gain -> analyser -> destination.
playSampleChannels(offline, [samples], sampleRate, 1)
const rendered = await offline.startRendering() // <- the deterministic signal

// `analyzeRenderedBuffer` reads via `copyFromChannel` (read side also
// avoids `getChannelData`, same rationale as the write side).
printVerdict(analyzeRenderedBuffer(rendered))
// No process.exit() here: Node does not guarantee pending stdout writes are
// flushed by process.exit(), and the parent (audio-render-gate.spec.ts)
// settles on the child's 'close' event — which only fires after stdio is
// drained — rather than 'exit', which can precede it. Falling off the end
// of the module with no pending work exits naturally with code 0, the same
// successful status process.exit(0) used to force.
process.exitCode = 0
