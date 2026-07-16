#!/usr/bin/env node
// Audio-device ORACLE for the e2e warmup's environmental-deafness verdict
// (see fixtures.ts's warmUpAudioPipeline). Answers exactly one question:
// can ANY code make this device produce sound right now? It deliberately
// imports ZERO application code — no zzfx, player, commandHandler,
// protocol, or client — only the same pinned `node-web-audio-api` copy
// the real sidecar uses (resolved from tools/audio-play), so a regression
// anywhere in the application stack CANNOT make this probe deaf. Spawned
// from INSIDE the extension host (same spawn context / audio session as
// the real sidecar — a terminal-context probe stays audible during
// episodes that deafen the host's children, and would misclassify).
//
// Prints exactly one verdict line on stdout:
//   ORACLE_AUDIBLE peak=<n>   — the device renders sound; a silent app
//                               stack is a CODE regression.
//   ORACLE_DEAF peak=0        — the device renders nothing for anyone;
//                               environmental.
// No verdict within the caller's bound = wedged (environmental flavor);
// nonzero exit without a verdict = the probe itself broke (infra).
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// host-bridge → e2e → vscode → (sibling) audio-play.
const requireFromAudioPlay = createRequire(
  new URL('../../../audio-play/package.json', import.meta.url)
)
const { AudioContext } = await import(
  pathToFileURL(requireFromAudioPlay.resolve('node-web-audio-api')).href
)

const ctx = new AudioContext()
const analyser = ctx.createAnalyser()
analyser.fftSize = 2048
analyser.connect(ctx.destination)
const gain = ctx.createGain()
gain.gain.value = 0.05
gain.connect(analyser)

const length = Math.floor(ctx.sampleRate * 0.5)
const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
const samples = new Float32Array(length)
for (let i = 0; i < length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / ctx.sampleRate)
buffer.copyToChannel(samples, 0)
const source = ctx.createBufferSource()
source.buffer = buffer
source.connect(gain)
source.start()

// Several reads across the sound's window — a single read can land on a
// zero-crossing or before the output stream engages.
let peak = 0
for (let read = 0; read < 6 && peak <= 1e-6; read++) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  const window_ = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(window_)
  for (const v of window_) {
    const abs = Math.abs(v)
    if (abs > peak) peak = abs
  }
}

console.log(peak > 1e-6 ? `ORACLE_AUDIBLE peak=${peak.toFixed(4)}` : 'ORACLE_DEAF peak=0')
await ctx.close().catch(() => {})
process.exit(0)
