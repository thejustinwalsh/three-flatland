/**
 * Owns the "get already-synthesized samples into the actual audio
 * output" step — the ONE piece of `ZZFX.playSamples`'s job this package
 * does NOT delegate to unmodified zzfx/zzfxm. Everything upstream of
 * this file (`ZZFX.buildSamples`, `ZZFXM.build`) stays 100% real,
 * unmodified zzfx/zzfxm — pure synthesis, no AudioContext touch at all.
 *
 * WHY this file exists (root cause, proven by an A/B listening test):
 * `ZZFX.playSamples` (node_modules/zzfx/ZzFX.js) writes samples via
 * `buffer.getChannelData(i).set(channel)`. In a real browser,
 * `getChannelData()` returns a LIVE view into the buffer's underlying
 * storage — mutating it is exactly how the spec expects you to fill an
 * AudioBuffer. `node-web-audio-api`'s implementation
 * (node_modules/node-web-audio-api/js/AudioBuffer.js) returns whatever
 * its native binding's `getChannelData()` hands back — a DETACHED COPY,
 * not a live view. Writing into that copy never reaches the native
 * buffer that actually gets played: every sound "plays" (acks clean, no
 * error, `source.start()` runs) but is dead silent. The same file's
 * `copyToChannel()` calls straight through to a native write-into-buffer
 * call (`this[kNapiObj].copyToChannel(source, channelNumber,
 * bufferOffset)`) — an explicit "write these values into channel N"
 * operation, not a get-then-mutate one, so it works correctly.
 *
 * `playSampleChannels` below is `ZZFX.playSamples`'s graph (buffer,
 * source, gain, stereo pan, connect, start) rebuilt with that one
 * substitution, plus a persistent `AnalyserNode` tap in the master
 * signal path (see `getPlaybackStats`) so a caller can verify real audio
 * is actually flowing, not just that nothing threw.
 */
import { ZZFX } from 'zzfx'
import type { PlaybackStats } from './protocol.js'

export type PlaySampleChannelsOptions = {
  volumeScale?: number
  rate?: number
  pan?: number
  loop?: boolean
}

let analyser: AnalyserNode | undefined

/** The shared master-output tap, created lazily on first use (the real
 * `AudioContext` only exists once `sidecar.ts`'s polyfill import has
 * run). Every `playSampleChannels` call's gain node routes through this
 * SAME analyser on its way to `destination`, so `getPlaybackStats()`
 * reflects whatever is currently audible regardless of which call
 * produced it. */
function getAnalyser(): AnalyserNode {
  if (!analyser) {
    analyser = ZZFX.audioContext.createAnalyser()
    // Default fftSize (2048) is plenty for a peak/silence check — this
    // isn't rendering a spectrum, just sampling "is anything nonzero."
    analyser.connect(ZZFX.audioContext.destination)
  }
  return analyser
}

/**
 * `ZZFX.playSamples`'s exact graph, with `copyToChannel` in place of
 * `getChannelData().set()` and the output routed through the shared
 * analyser tap instead of straight to `destination`. Returns the
 * `AudioBufferSourceNode`, same as the original — `commandHandler.ts`'s
 * `currentSong` handle is this return value's `.stop()`.
 */
export function playSampleChannels(
  sampleChannels: (number[] | Float32Array)[],
  { volumeScale = 1, rate = 1, pan = 0, loop = false }: PlaySampleChannelsOptions = {}
): AudioBufferSourceNode {
  const channelCount = sampleChannels.length
  const sampleLength = sampleChannels[0]?.length ?? 0
  const buffer = ZZFX.audioContext.createBuffer(channelCount, sampleLength, ZZFX.sampleRate)
  const source = ZZFX.audioContext.createBufferSource()

  sampleChannels.forEach((channel, i) => {
    buffer.copyToChannel(Float32Array.from(channel), i)
  })
  source.buffer = buffer
  source.playbackRate.value = rate
  source.loop = loop

  const gainNode = ZZFX.audioContext.createGain()
  gainNode.gain.value = ZZFX.volume * volumeScale
  gainNode.connect(getAnalyser())

  const pannerNode = new StereoPannerNode(ZZFX.audioContext, { pan })
  source.connect(pannerNode).connect(gainNode)
  source.start()

  return source
}

/**
 * Reads the analyser's current time-domain window and reduces it to a
 * peak/silent verdict. Meaningful only while something is actually
 * playing — see `PlaybackStats`'s doc comment.
 */
export function getPlaybackStats(): PlaybackStats {
  const node = getAnalyser()
  const buffer = new Float32Array(node.fftSize)
  node.getFloatTimeDomainData(buffer)

  let peak = 0
  for (const sample of buffer) {
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
  }
  // Floating-point noise floor, not a perceptual threshold — real audio
  // (even a quiet one-shot) clears this by orders of magnitude; the
  // pre-fix bug produced EXACT zeros (an untouched, never-written
  // buffer), not merely quiet ones.
  return { peak, silent: peak < 1e-6 }
}
