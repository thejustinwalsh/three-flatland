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
import type {
  PlaybackStats,
  PlayToneSynthCommand,
  ToneSynthType,
  WadSynthSource,
} from './protocol.js'

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
  /** Flipped by `ended` resolving — fires on BOTH natural completion and
   * an explicit `.stop()` (the commandHandler's stopSong path, or a
   * synth's `triggerRelease`/`releaseAll`), so `playing` flips false
   * immediately on a mid-playback stop rather than waiting out the
   * natural duration. */
  ended: boolean
}

const playbacks = new WeakMap<AudioContext, CurrentPlayback>()

/**
 * Registers the most-recently-started source's timing against `ctx`.
 * `ended` is a completion signal rather than an `AudioBufferSourceNode`
 * directly — `playSampleChannels`/`playBuffer` wrap their node's
 * `onended` event in a `Promise`, `playToneSynth`/`playWadSynth` have no
 * node with an `onended` property at all (a Tone synth's own scheduled
 * release, or a `Wad` instance's own `play()`-returned promise) and
 * construct one to match. A rejected/erroring `ended` still counts as
 * "ended" — never leave the record permanently stuck `playing`.
 */
function trackPlayback(ctx: AudioContext, ended: Promise<unknown>, durationSeconds: number): void {
  const record: CurrentPlayback = { startedAt: ctx.currentTime, durationSeconds, ended: false }
  playbacks.set(ctx, record)
  ended.then(
    () => {
      record.ended = true
    },
    () => {
      record.ended = true
    }
  )
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
  const ended = new Promise<void>((resolve) => {
    source.onended = () => resolve()
  })
  // Duration from the synthesis inputs directly (sample count ÷ declared
  // rate, playback-rate-adjusted) rather than trusting a buffer.duration
  // getter — identical math, but it keeps the fake-AudioContext unit
  // tests honest about where the number comes from.
  trackPlayback(ctx, ended, sampleLength / sampleRate / rate)
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
  const ended = new Promise<void>((resolve) => {
    source.onended = () => resolve()
  })
  // `decodeAudioData`'s buffer knows its own exact duration.
  trackPlayback(ctx, ended, audioBuffer.duration)
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

/**
 * The minimal Tone.js surface `playToneSynth` needs, referenced
 * structurally rather than via a static `import 'tone'` — this file
 * deliberately imports neither `tone` nor `web-audio-daw` (see the file
 * doc comment's "imports nothing from zzfx" reasoning; the same logic
 * extends to both synth engines, and for `tone` specifically it's also
 * what makes the sidecar's lazy/try-catch-contained import possible —
 * see `sidecar.ts`). `sidecar.ts` lazily imports the real module and
 * builds this shape from it; `player.test.ts` passes a hand-built fake
 * matching the same shape, never a real `tone` import.
 */
export type ToneSynthInstance = {
  connect(destination: AudioNode): unknown
  triggerAttackRelease(...args: never[]): unknown
  triggerRelease(...args: never[]): unknown
}
export type ToneSynthClass = new (options?: Record<string, unknown>) => ToneSynthInstance
export type TonePolySynthInstance = ToneSynthInstance & {
  releaseAll(): unknown
}
export type ToneEngine = {
  /** One entry per `ToneSynthType` — a real, explicit, hand-built table,
   * never `Tone[synthType]` indexed dynamically off the wire string
   * (defense in depth: the union type already constrains `synthType`,
   * but indexing into an explicit table closes off any surface where a
   * wire value could resolve to something other than one of these nine
   * classes). `PolySynth`'s constructor shape (`voice, options`) differs
   * from the other eight (`options` only), hence the separate field. */
  classes: Record<Exclude<ToneSynthType, 'PolySynth'>, ToneSynthClass> & {
    // `voice` typed as `unknown` rather than `ToneSynthClass` — Tone's
    // REAL `PolySynth<Voice>` constructor requires its voice class to
    // also carry a static `getDefaults()` (`VoiceConstructor<Voice>`),
    // which `ToneSynthClass` doesn't model; reconciling that generic
    // precision structurally isn't worth it for a lookup table this
    // narrow. `sidecar.ts` bridges the real `Tone.PolySynth` in with one
    // explicit, commented cast at the one point they meet.
    PolySynth: new (voice?: unknown, options?: Record<string, unknown>) => TonePolySynthInstance
  }
  Time(value: string | number): { toSeconds(): number }
}

/** Only `Monophonic`-derived Tone classes are valid `PolySynth` voices —
 * matches Tone's own `PolySynth<Voice extends Monophonic<any>>`
 * constraint. `NoiseSynth`/`PluckSynth` extend `Instrument` directly
 * (verified against the installed `tone@15.1.22` `.d.ts`s), and
 * `PolySynth` as its own voice is nonsensical — all three are rejected
 * with a Nack rather than left to throw inside Tone's own constructor. */
const POLY_VOICE_TYPES = new Set<Exclude<ToneSynthType, 'PolySynth'>>([
  'Synth',
  'AMSynth',
  'FMSynth',
  'DuoSynth',
  'MembraneSynth',
  'MetalSynth',
])

function isPolyVoiceType(type: ToneSynthType): type is Exclude<ToneSynthType, 'PolySynth'> {
  return (POLY_VOICE_TYPES as ReadonlySet<ToneSynthType>).has(type)
}

/**
 * Reads the release time (seconds) off an already-constructed synth
 * instance — NOT off `cmd.config`, so it reflects whatever envelope
 * config actually landed (default or overridden). Three access shapes,
 * verified empirically against the real `tone@15.1.22` package rather
 * than assumed (see the #47 report): `Synth`/`AMSynth`/`FMSynth`/
 * `MembraneSynth`/`MetalSynth`/`NoiseSynth` expose `.envelope.release`
 * directly; `DuoSynth` does not — its envelope lives on `.voice0`
 * (`.voice1` mirrors it); `PluckSynth` has no `.envelope` at all, only a
 * top-level `.release`. `PolySynth` has none of these directly — `
 * ._dummyVoice` (private in the `.d.ts`, a real constructed voice
 * instance at runtime — Tone's own doc comment: "A voice used for
 * holding the get/set values") recurses through the same rules keyed by
 * `voiceType`.
 */
function toneReleaseSeconds(
  Tone: ToneEngine,
  synthType: ToneSynthType,
  synth: ToneSynthInstance,
  voiceType?: ToneSynthType
): number {
  const s = synth as unknown as Record<string, unknown>
  if (synthType === 'PolySynth') {
    const dummyVoice = s._dummyVoice as Record<string, unknown> | undefined
    if (!dummyVoice) return 0
    return toneReleaseSeconds(
      Tone,
      voiceType ?? 'Synth',
      dummyVoice as unknown as ToneSynthInstance
    )
  }
  if (synthType === 'DuoSynth') {
    const voice0 = s.voice0 as { envelope?: { release?: unknown } } | undefined
    const release = voice0?.envelope?.release
    return release === undefined ? 0 : Tone.Time(release as string | number).toSeconds()
  }
  if (synthType === 'PluckSynth') {
    const release = s.release
    return release === undefined ? 0 : Tone.Time(release as string | number).toSeconds()
  }
  const envelope = s.envelope as { release?: unknown } | undefined
  const release = envelope?.release
  return release === undefined ? 0 : Tone.Time(release as string | number).toSeconds()
}

/**
 * Constructs and plays one of the nine allowlisted Tone.js instrument
 * shapes (#47) — a fixed, statically-parseable subset, never arbitrary
 * user code execution. Routes through a fresh `GainNode` into the SAME
 * shared analyser tap `playSampleChannels`/`playBuffer` use
 * (`getAnalyser(ctx)`) via an explicit `.connect(gainNode)` —
 * NEVER `.toDestination()`, which would bypass the analyser and silently
 * break the audibility/duration stats this whole package's toggle UI
 * depends on.
 *
 * `Tone.setContext(...)` is the CALLER's responsibility (`sidecar.ts`,
 * once, lazily, the first time any Tone command arrives) — this function
 * assumes it has already happened and never touches context wiring
 * itself, so a caller that forgets it gets Tone's own default context
 * instead of a confusing failure here.
 */
export function playToneSynth(
  ctx: AudioContext,
  Tone: ToneEngine,
  cmd: Omit<PlayToneSynthCommand, 'cmd'>,
  masterVolume: number
): { stop(): void } {
  if (cmd.synthType !== 'NoiseSynth' && cmd.note === undefined) {
    throw new Error(`playToneSynth: '${cmd.synthType}' requires a note`)
  }

  const gainNode = ctx.createGain()
  gainNode.gain.value = masterVolume
  gainNode.connect(getAnalyser(ctx))

  let synth: ToneSynthInstance
  let releaseSeconds: number

  if (cmd.synthType === 'PolySynth') {
    const voiceType = cmd.voiceType ?? 'Synth'
    if (!isPolyVoiceType(voiceType)) {
      throw new Error(`playToneSynth: '${voiceType}' can't be a PolySynth voice`)
    }
    const poly = new Tone.classes.PolySynth(Tone.classes[voiceType], cmd.config)
    synth = poly
    releaseSeconds = toneReleaseSeconds(Tone, 'PolySynth', poly, voiceType)
  } else {
    synth = new Tone.classes[cmd.synthType](cmd.config)
    releaseSeconds = toneReleaseSeconds(Tone, cmd.synthType, synth)
  }

  synth.connect(gainNode)

  const durationSeconds = Tone.Time(cmd.duration).toSeconds() + releaseSeconds
  let resolveEnded: () => void = () => {}
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve
  })
  // A synthetic timer, not a native event — Tone has no completion event
  // of its own, so this mirrors the ACTUAL scheduled attack+release
  // window computed above. `stop()` below resolves `ended` immediately
  // too, matching `AudioBufferSourceNode.onended`'s "fires on both
  // natural completion and an explicit stop()" contract (see
  // `trackPlayback`'s doc comment) rather than waiting out this timer.
  const timer = setTimeout(() => resolveEnded(), durationSeconds * 1000)
  trackPlayback(ctx, ended, durationSeconds)

  if (cmd.synthType === 'NoiseSynth') {
    ;(
      synth as unknown as { triggerAttackRelease(duration: string | number): unknown }
    ).triggerAttackRelease(cmd.duration)
  } else if (cmd.synthType === 'PolySynth') {
    ;(
      synth as unknown as {
        triggerAttackRelease(
          notes: string | number | (string | number)[],
          duration: string | number
        ): unknown
      }
    ).triggerAttackRelease(cmd.note as string | number | (string | number)[], cmd.duration)
  } else {
    ;(
      synth as unknown as {
        triggerAttackRelease(note: string | number, duration: string | number): unknown
      }
    ).triggerAttackRelease(cmd.note as string | number, cmd.duration)
  }

  return {
    stop: () => {
      clearTimeout(timer)
      if (cmd.synthType === 'PolySynth') (synth as unknown as TonePolySynthInstance).releaseAll()
      else synth.triggerRelease()
      resolveEnded()
    },
  }
}

/** The minimal `Wad` surface `playWadSynth` needs — see `ToneEngine`'s
 * doc comment for why this is structural rather than a static
 * `import 'web-audio-daw'`. `sidecar.ts` lazily imports the real default
 * export (after applying the module-scope `AudioContext` monkey-patch —
 * see that file), `player.test.ts` passes a hand-built fake. */
export type WadInstance = { play(): Promise<unknown>; stop(): void }
export type WadConstructor = new (config: Record<string, unknown>) => WadInstance

/**
 * Constructs and plays a Wad oscillator/noise synth (#47) from a
 * declarative config — parse-don't-eval, same posture as the zzfxm song
 * parser. Wad's constructor accepts a `destination` option directly
 * (verified against the installed `web-audio-daw@4.13.4` bundle source:
 * `this.destination = arg.destination || context.destination`), so this
 * routes to the shared analyser tap by passing `gainNode` straight
 * through the config rather than hunting for an internal output-node
 * property to `.connect()` after the fact.
 *
 * `durationSeconds` is always `Infinity`: `wadSynthResolver.ts` only
 * ever parses top-level scalar literals out of the source text, so a
 * wire `config` never carries a nested `env` object, which means Wad
 * always falls back to its own default envelope — bounded, not
 * literally endless, but `Infinity` is still the correct sentinel here
 * (see `trackPlayback`'s math: it never clamps `elapsedSeconds` against
 * it, so `playing` is governed purely by the `ended` flag, which
 * `wad.play()`'s own promise flips at whatever moment playback actually
 * stops, natural or explicit).
 */
export function playWadSynth(
  ctx: AudioContext,
  Wad: WadConstructor,
  config: { source: WadSynthSource } & Record<string, number | string | boolean>,
  masterVolume: number
): { stop(): void } {
  const gainNode = ctx.createGain()
  gainNode.gain.value = masterVolume
  gainNode.connect(getAnalyser(ctx))

  const wad = new Wad({ ...config, destination: gainNode })
  const ended = wad.play()
  trackPlayback(ctx, ended, Infinity)

  return {
    stop: () => wad.stop(),
  }
}
