/**
 * Owns the "get already-synthesized samples into the actual audio
 * output" step — the ONE piece of `ZZFX.playSamples`'s job this package
 * does NOT delegate to unmodified zzfx/zzfxm. Everything upstream of
 * this file (`ZZFX.buildSamples`, `ZZFXM.build`) stays 100% real,
 * unmodified zzfx/zzfxm — pure synthesis, no AudioContext touch at all.
 *
 * Deliberately imports nothing from `zzfx` — `sidecar.ts` passes in the
 * `AudioContext`, sample rate, and master volume it reads off `ZZFX.*`
 * explicitly. Two reasons: it keeps this file a plain Web Audio graph
 * builder with no implicit coupling to a global mutable object, and —
 * load-bearing for testing — `zzfx`'s `ZZFX.audioContext = new
 * AudioContext` runs at *module load time*, which throws
 * (`AudioContext is not defined`) outside `sidecar.ts`'s real
 * `node-web-audio-api/polyfill.js`-first import order. `player.test.ts`
 * unit-tests this file with a fake `AudioContext` under plain `vitest`
 * (plain-Node `environment: 'node'`, no such polyfill) — importing
 * `zzfx` here would break that.
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
 * source, gain, connect, start) rebuilt with that one substitution, plus
 * a persistent `AnalyserNode` tap in the master signal path (see
 * `getPlaybackStats`) so a caller can verify real audio is actually
 * flowing, not just that nothing threw. It drops `ZZFX.playSamples`'
 * `StereoPannerNode` — this package never passes a non-default pan
 * through the wire protocol, and one fewer node type is one fewer
 * surface for a `node-web-audio-api`/browser behavioral difference to
 * hide in.
 */
import type { PlaybackStats } from './protocol.js'

export type PlaySampleChannelsOptions = {
  rate?: number
  loop?: boolean
}

const analysers = new WeakMap<AudioContext, AnalyserNode>()

/** The most recently started source's timing, per context — what lets
 * `getPlaybackStats` report exact `playing`/`durationSeconds`/
 * `elapsedSeconds` (#43) instead of callers guessing with magic
 * timeouts. One record, last-started-wins: the wire protocol's own
 * semantics already replace rather than stack songs, and a one-shot
 * layered over a song is a sub-second blip against the song's window. */
type CurrentPlayback = {
  startedAt: number
  durationSeconds: number
  /** Set by the source's own `ended` event — fires on BOTH natural
   * completion and an explicit `.stop()` (the commandHandler's stopSong
   * path), so `playing` flips false immediately on a mid-playback stop
   * rather than waiting out the natural duration. */
  ended: boolean
}

const playbacks = new WeakMap<AudioContext, CurrentPlayback>()

function trackPlayback(
  ctx: AudioContext,
  source: AudioBufferSourceNode,
  durationSeconds: number
): void {
  const record: CurrentPlayback = { startedAt: ctx.currentTime, durationSeconds, ended: false }
  playbacks.set(ctx, record)
  source.onended = () => {
    record.ended = true
  }
}

/** The shared master-output tap for a given context, created lazily on
 * first use. Every `playSampleChannels` call against the same `ctx`
 * routes its gain node through this SAME analyser on its way to
 * `destination`, so `getPlaybackStats(ctx)` reflects whatever is
 * currently audible on that context regardless of which call produced
 * it. Keyed per-`ctx` (rather than one module-level singleton) so unit
 * tests can spin up independent fake contexts without cross-talk. */
function getAnalyser(ctx: AudioContext): AnalyserNode {
  let analyser = analysers.get(ctx)
  if (!analyser) {
    analyser = ctx.createAnalyser()
    // Default fftSize (2048) is plenty for a peak/silence check — this
    // isn't rendering a spectrum, just sampling "is anything nonzero."
    analyser.connect(ctx.destination)
    analysers.set(ctx, analyser)
  }
  return analyser
}

/**
 * `ZZFX.playSamples`'s graph (buffer, source, gain, connect, start),
 * with `copyToChannel` in place of `getChannelData().set()`, no
 * `StereoPannerNode` (see the file doc comment), and the output routed
 * through the shared analyser tap instead of straight to `destination`.
 * Returns the `AudioBufferSourceNode`, same as the original —
 * `commandHandler.ts`'s `currentSong` handle is this return value's
 * `.stop()`.
 *
 * `sampleRate` must match whatever rate the caller's synthesis assumed
 * (`ZZFX.sampleRate`, not necessarily `ctx.sampleRate`) — `AudioBuffer`
 * playback resamples to the context's actual rate automatically, but
 * only if the buffer's declared rate correctly describes the samples it
 * holds; declaring the wrong rate here would shift pitch and duration,
 * not just efficiency.
 */
export function playSampleChannels(
  ctx: AudioContext,
  sampleChannels: (number[] | Float32Array)[],
  sampleRate: number,
  masterVolume: number,
  { rate = 1, loop = false }: PlaySampleChannelsOptions = {}
): AudioBufferSourceNode {
  const channelCount = sampleChannels.length
  const sampleLength = sampleChannels[0]?.length ?? 0
  const buffer = ctx.createBuffer(channelCount, sampleLength, sampleRate)
  const source = ctx.createBufferSource()

  sampleChannels.forEach((channel, i) => {
    buffer.copyToChannel(Float32Array.from(channel), i)
  })
  source.buffer = buffer
  source.playbackRate.value = rate
  source.loop = loop

  const gainNode = ctx.createGain()
  gainNode.gain.value = masterVolume
  source.connect(gainNode)
  gainNode.connect(getAnalyser(ctx))
  // Duration from the synthesis inputs directly (sample count ÷ declared
  // rate, playback-rate-adjusted) rather than trusting a buffer.duration
  // getter — identical math, but it keeps the fake-AudioContext unit
  // tests honest about where the number comes from.
  trackPlayback(ctx, source, sampleLength / sampleRate / rate)
  source.start()

  return source
}

/**
 * Plays an already-decoded `AudioBuffer` — the sibling output path for
 * `audio.file` findings (three.js/Howler/Wad/bare-Audio/Tone.js file
 * refs), as opposed to `playSampleChannels`' synthesized zzfx/zzfxm
 * samples. `audioBuffer` (whatever `AudioContext.decodeAudioData`
 * returns) is NATIVELY filled by the decoder — this deliberately never
 * touches `copyToChannel`/`getChannelData` at all, sidestepping the
 * get-then-mutate trap entirely rather than working around it (see the
 * file doc comment): there is no sample data to write in the first
 * place, only an already-playable buffer to route to the output.
 *
 * Routes through the SAME shared analyser tap `playSampleChannels` uses
 * (`getAnalyser(ctx)`), so `getPlaybackStats`/the `stats` wire command
 * covers file playback too — one audibility regression guard for both
 * output paths, not two.
 */
export function playBuffer(
  ctx: AudioContext,
  audioBuffer: AudioBuffer,
  masterVolume: number
): AudioBufferSourceNode {
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer

  const gainNode = ctx.createGain()
  gainNode.gain.value = masterVolume
  source.connect(gainNode)
  gainNode.connect(getAnalyser(ctx))
  // `decodeAudioData`'s buffer knows its own exact duration.
  trackPlayback(ctx, source, audioBuffer.duration)
  source.start()

  return source
}

/**
 * Reads the analyser's current time-domain window and reduces it to a
 * peak/silent verdict, plus the current source's exact timing from the
 * `trackPlayback` record (#43). `peak`/`silent` are meaningful only
 * while something is actually playing — see `PlaybackStats`'s doc
 * comment.
 */
export function getPlaybackStats(ctx: AudioContext): PlaybackStats {
  const node = getAnalyser(ctx)
  const buffer = new Float32Array(node.fftSize)
  node.getFloatTimeDomainData(buffer)

  let peak = 0
  for (const sample of buffer) {
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
  }

  const current = playbacks.get(ctx)
  const durationSeconds = current?.durationSeconds ?? 0
  const elapsedSeconds = current
    ? Math.min(Math.max(ctx.currentTime - current.startedAt, 0), durationSeconds)
    : 0
  const playing = !!current && !current.ended && elapsedSeconds < durationSeconds

  // Floating-point noise floor, not a perceptual threshold — real audio
  // (even a quiet one-shot) clears this by orders of magnitude; the
  // pre-fix bug produced EXACT zeros (an untouched, never-written
  // buffer), not merely quiet ones.
  return { peak, silent: peak < 1e-6, playing, durationSeconds, elapsedSeconds }
}
