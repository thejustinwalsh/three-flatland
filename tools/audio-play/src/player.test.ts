import { describe, expect, it, vi } from 'vitest'
import {
  getPlaybackStats,
  playBuffer,
  playSampleChannels,
  playToneSynth,
  playWadSynth,
  type ToneEngine,
  type WadConstructor,
  type WadInstance,
} from './player.js'

/**
 * A minimal fake `AudioContext` — no `node-web-audio-api`, no real
 * `zzfx` import (see `player.ts`'s doc comment for why importing `zzfx`
 * here would break under plain-Node `vitest`). `createBuffer`'s fake
 * `AudioBuffer` throws if `getChannelData` is ever called — that's the
 * actual regression this suite exists to catch: a reintroduction of the
 * `getChannelData().set()` pattern must fail a unit test, not just an
 * e2e spec.
 */
function fakeAudioContext(): {
  ctx: AudioContext & { currentTime: number }
  buffers: { copyToChannel: ReturnType<typeof vi.fn>; getChannelData: ReturnType<typeof vi.fn> }[]
  sources: {
    buffer: unknown
    playbackRate: { value: number }
    loop: boolean
    onended: (() => void) | null
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
  }[]
  gains: {
    gain: {
      value: number
      cancelScheduledValues: ReturnType<typeof vi.fn>
      setValueAtTime: ReturnType<typeof vi.fn>
    }
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }[]
  analysers: {
    fftSize: number
    connect: ReturnType<typeof vi.fn>
    getFloatTimeDomainData: ReturnType<typeof vi.fn>
  }[]
} {
  const buffers: ReturnType<typeof fakeAudioContext>['buffers'] = []
  const sources: ReturnType<typeof fakeAudioContext>['sources'] = []
  const gains: ReturnType<typeof fakeAudioContext>['gains'] = []
  const analysers: ReturnType<typeof fakeAudioContext>['analysers'] = []

  const ctx = {
    destination: {},
    // Mutable so tests can advance the clock — trackPlayback stamps
    // startedAt from it and getPlaybackStats derives elapsed against it.
    currentTime: 0,
    createBuffer: vi.fn(() => {
      const buffer = {
        copyToChannel: vi.fn(),
        getChannelData: vi.fn(() => {
          throw new Error(
            'getChannelData must never be called — it returns a detached copy under node-web-audio-api (the Z12 bug)'
          )
        }),
      }
      buffers.push(buffer)
      return buffer
    }),
    createBufferSource: vi.fn(() => {
      const source = {
        buffer: undefined as unknown,
        playbackRate: { value: 1 },
        loop: false,
        onended: null as (() => void) | null,
        connect: vi.fn((target: unknown) => target),
        start: vi.fn(),
      }
      sources.push(source)
      return source
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      gains.push(gain)
      return gain
    }),
    createAnalyser: vi.fn(() => {
      const analyser = {
        fftSize: 2048,
        connect: vi.fn(),
        getFloatTimeDomainData: vi.fn(),
      }
      analysers.push(analyser)
      return analyser
    }),
  }

  return {
    ctx: ctx as unknown as AudioContext & { currentTime: number },
    buffers,
    sources,
    gains,
    analysers,
  }
}

describe('playSampleChannels', () => {
  it('writes every channel via copyToChannel, never getChannelData', () => {
    const { ctx, buffers } = fakeAudioContext()

    playSampleChannels(
      ctx,
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      44100,
      0.3
    )

    const buffer = buffers[0]!
    expect(buffer.copyToChannel).toHaveBeenCalledTimes(2)
    expect(buffer.copyToChannel).toHaveBeenNthCalledWith(1, Float32Array.from([1, 2, 3]), 0)
    expect(buffer.copyToChannel).toHaveBeenNthCalledWith(2, Float32Array.from([4, 5, 6]), 1)
    expect(buffer.getChannelData).not.toHaveBeenCalled()
  })

  it("accepts Float32Array channels (ZZFX.buildSamples' actual return type) the same way", () => {
    const { ctx, buffers } = fakeAudioContext()

    playSampleChannels(ctx, [Float32Array.from([7, 8, 9])], 44100, 0.3)

    expect(buffers[0]!.copyToChannel).toHaveBeenCalledWith(Float32Array.from([7, 8, 9]), 0)
  })

  it('sets gain to the masterVolume passed in — no implicit ZZFX.volume coupling', () => {
    const { ctx, gains } = fakeAudioContext()

    playSampleChannels(ctx, [[1]], 44100, 0.75)

    expect(gains[0]!.gain.value).toBe(0.75)
  })

  it('creates no StereoPannerNode — the source connects straight to gain', () => {
    const { ctx, sources, gains } = fakeAudioContext()
    // fakeAudioContext has no createStereoPanner at all — calling it
    // would throw a TypeError, which the assertion below would surface.
    expect(() => playSampleChannels(ctx, [[1]], 44100, 0.3)).not.toThrow()

    expect(sources[0]!.connect).toHaveBeenCalledTimes(1)
    expect(sources[0]!.connect).toHaveBeenCalledWith(gains[0])
  })

  it('applies rate/loop options and starts playback, returning the source node', () => {
    const { ctx, sources } = fakeAudioContext()

    const result = playSampleChannels(ctx, [[1]], 44100, 0.3, { rate: 2, loop: true })

    expect(result).toBe(sources[0])
    expect(sources[0]!.playbackRate.value).toBe(2)
    expect(sources[0]!.loop).toBe(true)
    expect(sources[0]!.start).toHaveBeenCalledTimes(1)
  })

  it('routes every call against the same ctx through one shared analyser', () => {
    const { ctx, gains, analysers } = fakeAudioContext()

    playSampleChannels(ctx, [[1]], 44100, 0.3)
    playSampleChannels(ctx, [[2]], 44100, 0.3)

    expect(analysers).toHaveLength(1)
    expect(gains[0]!.connect).toHaveBeenCalledWith(analysers[0])
    expect(gains[1]!.connect).toHaveBeenCalledWith(analysers[0])
  })
})

describe('playBuffer', () => {
  /** A stand-in for the `AudioBuffer` `decodeAudioData` hands back —
   * natively filled by the decoder, never touched via `copyToChannel`
   * or `getChannelData` (that's `playSampleChannels`' job for
   * synthesized zzfx/zzfxm samples, not this function's). No
   * `copyToChannel`/`getChannelData` methods at all — calling either
   * would throw a TypeError, which the "sets source.buffer directly"
   * assertion below would surface. */
  function fakeDecodedBuffer(): AudioBuffer {
    return {
      length: 4410,
      numberOfChannels: 2,
      sampleRate: 44100,
      duration: 4410 / 44100,
    } as unknown as AudioBuffer
  }

  it('sets source.buffer directly to the decoded buffer — no copyToChannel, no getChannelData', () => {
    const { ctx, sources, buffers } = fakeAudioContext()
    const decoded = fakeDecodedBuffer()

    const result = playBuffer(ctx, decoded, 0.3)

    expect(result).toBe(sources[0])
    expect(sources[0]!.buffer).toBe(decoded)
    // playBuffer never calls ctx.createBuffer at all — it plays the
    // buffer decodeAudioData already produced, not a synthesized one.
    expect(buffers).toHaveLength(0)
  })

  it('sets gain to the masterVolume passed in and starts playback', () => {
    const { ctx, sources, gains } = fakeAudioContext()

    playBuffer(ctx, fakeDecodedBuffer(), 0.6)

    expect(gains[0]!.gain.value).toBe(0.6)
    expect(sources[0]!.connect).toHaveBeenCalledWith(gains[0])
    expect(sources[0]!.start).toHaveBeenCalledTimes(1)
  })

  it('routes through the SAME shared analyser tap playSampleChannels uses — files and synth share one audibility guard', () => {
    const { ctx, gains, analysers } = fakeAudioContext()

    playSampleChannels(ctx, [[1]], 44100, 0.3)
    playBuffer(ctx, fakeDecodedBuffer(), 0.3)

    expect(analysers).toHaveLength(1)
    expect(gains[1]!.connect).toHaveBeenCalledWith(analysers[0])
  })
})

describe('getPlaybackStats', () => {
  it("reports peak/silent from the analyser's current time-domain window", () => {
    const { ctx, analysers } = fakeAudioContext()
    playSampleChannels(ctx, [[1]], 44100, 0.3) // creates the shared analyser
    analysers[0]!.getFloatTimeDomainData.mockImplementation((arr: Float32Array) => {
      arr[0] = 0.5
      arr[1] = -0.75
    })

    const stats = getPlaybackStats(ctx)

    expect(stats.peak).toBeCloseTo(0.75)
    expect(stats.silent).toBe(false)
  })

  it('reports silent:true, peak:0, and no playback timing when nothing has ever played', () => {
    const { ctx } = fakeAudioContext()

    const stats = getPlaybackStats(ctx)

    expect(stats).toEqual({
      peak: 0,
      silent: true,
      playing: false,
      durationSeconds: 0,
      elapsedSeconds: 0,
    })
  })

  it('a different ctx gets its own analyser — no cross-context leakage', () => {
    const a = fakeAudioContext()
    const b = fakeAudioContext()
    playSampleChannels(a.ctx, [[1]], 44100, 0.3)
    playSampleChannels(b.ctx, [[1]], 44100, 0.3)

    expect(a.analysers).toHaveLength(1)
    expect(b.analysers).toHaveLength(1)
    expect(a.analysers[0]).not.toBe(b.analysers[0])
  })

  // #43 — the exact-duration reporting that kills the magic 5000ms e2e
  // timeouts: the sidecar KNOWS how long the current source lasts.
  describe('playback timing (#43)', () => {
    it('reports playing + exact duration/elapsed from the synthesis inputs while a source runs', () => {
      const { ctx } = fakeAudioContext()
      ctx.currentTime = 10
      playSampleChannels(ctx, [new Array(88200).fill(0.1)], 44100, 0.3) // exactly 2s

      ctx.currentTime = 10.5
      const stats = getPlaybackStats(ctx)

      expect(stats.playing).toBe(true)
      expect(stats.durationSeconds).toBeCloseTo(2)
      expect(stats.elapsedSeconds).toBeCloseTo(0.5)
    })

    it('adjusts duration for a non-default playback rate', () => {
      const { ctx } = fakeAudioContext()
      playSampleChannels(ctx, [new Array(88200).fill(0.1)], 44100, 0.3, { rate: 2 })

      expect(getPlaybackStats(ctx).durationSeconds).toBeCloseTo(1)
    })

    it("playBuffer reports the decoded buffer's own duration", () => {
      const { ctx } = fakeAudioContext()
      playBuffer(ctx, fakeDecodedBufferOfDuration(0.1), 0.3)

      const stats = getPlaybackStats(ctx)
      expect(stats.playing).toBe(true)
      expect(stats.durationSeconds).toBeCloseTo(0.1)
    })

    it('flips playing:false the moment the source ends — natural completion or an explicit stop()', async () => {
      const { ctx, sources } = fakeAudioContext()
      playSampleChannels(ctx, [new Array(88200).fill(0.1)], 44100, 0.3)
      expect(getPlaybackStats(ctx).playing).toBe(true)

      // commandHandler's stopSong calls source.stop(), which fires the
      // ended event mid-playback — no waiting out the natural duration.
      // `onended` now resolves a Promise (trackPlayback's generalized
      // signature, #47) rather than flipping `ended` directly, so the
      // flip lands on the next microtask — one `await` flushes it.
      sources[0]!.onended?.()
      await Promise.resolve()

      const stats = getPlaybackStats(ctx)
      expect(stats.playing).toBe(false)
      expect(stats.durationSeconds).toBeCloseTo(2) // still describes the source
    })

    it('clamps elapsed to the duration and reports playing:false past the natural end', () => {
      const { ctx } = fakeAudioContext()
      ctx.currentTime = 0
      playSampleChannels(ctx, [new Array(44100).fill(0.1)], 44100, 0.3) // 1s

      ctx.currentTime = 5
      const stats = getPlaybackStats(ctx)

      expect(stats.playing).toBe(false)
      expect(stats.elapsedSeconds).toBeCloseTo(1)
      expect(stats.durationSeconds).toBeCloseTo(1)
    })

    it('a new source replaces the previous timing record — last started wins', () => {
      const { ctx } = fakeAudioContext()
      ctx.currentTime = 0
      playSampleChannels(ctx, [new Array(44100).fill(0.1)], 44100, 0.3) // 1s
      ctx.currentTime = 0.25
      playSampleChannels(ctx, [new Array(132300).fill(0.1)], 44100, 0.3) // 3s

      ctx.currentTime = 0.75
      const stats = getPlaybackStats(ctx)

      expect(stats.durationSeconds).toBeCloseTo(3)
      expect(stats.elapsedSeconds).toBeCloseTo(0.5)
      expect(stats.playing).toBe(true)
    })
  })

  function fakeDecodedBufferOfDuration(durationSeconds: number): AudioBuffer {
    return {
      length: Math.round(durationSeconds * 44100),
      numberOfChannels: 1,
      sampleRate: 44100,
      duration: durationSeconds,
    } as unknown as AudioBuffer
  }
})

/**
 * A fake Tone.js instrument class — `new Ctor(options)` returns a plain
 * object (the explicit-object-return `new` trick, same one `sidecar.ts`
 * uses on `web-audio-daw`'s real `AudioContext`), never touching a real
 * `tone` import (see `player.ts`'s `ToneEngine` doc comment for why this
 * file must not import `tone`). `extraShape` reproduces one of the
 * per-class release-access shapes `toneReleaseSeconds` branches on
 * (`.envelope.release` / `.voice0.envelope.release` / top-level
 * `.release`), verified against the real installed `tone@15.1.22`
 * package in the #47 report.
 */
type FakeToneInstance = {
  options: Record<string, unknown> | undefined
  connect: ReturnType<typeof vi.fn>
  triggerAttackRelease: ReturnType<typeof vi.fn>
  triggerRelease: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
} & Record<string, unknown>

function fakeToneSynthClass(extraShape: Record<string, unknown> = {}): {
  Ctor: new (options?: Record<string, unknown>) => FakeToneInstance
  instances: FakeToneInstance[]
} {
  const instances: FakeToneInstance[] = []
  function Ctor(this: unknown, options?: Record<string, unknown>): FakeToneInstance {
    const instance: FakeToneInstance = {
      options,
      connect: vi.fn(),
      triggerAttackRelease: vi.fn(),
      triggerRelease: vi.fn(),
      dispose: vi.fn(),
      ...extraShape,
    }
    instances.push(instance)
    return instance
  }
  return {
    Ctor: Ctor as unknown as new (options?: Record<string, unknown>) => FakeToneInstance,
    instances,
  }
}

function fakeToneEngine(): {
  Tone: ToneEngine
  synth: ReturnType<typeof fakeToneSynthClass>
  noise: ReturnType<typeof fakeToneSynthClass>
  duo: ReturnType<typeof fakeToneSynthClass>
  pluck: ReturnType<typeof fakeToneSynthClass>
  polyInstances: FakeToneInstance[]
} {
  const synth = fakeToneSynthClass({ envelope: { release: 1 } })
  const amSynth = fakeToneSynthClass({ envelope: { release: 0.5 } })
  const fmSynth = fakeToneSynthClass({ envelope: { release: 0.5 } })
  const duo = fakeToneSynthClass({ voice0: { envelope: { release: 0.3 } } })
  const membrane = fakeToneSynthClass({ envelope: { release: 1.4 } })
  const metal = fakeToneSynthClass({ envelope: { release: 0.2 } })
  const pluck = fakeToneSynthClass({ release: 0.8 })
  const noise = fakeToneSynthClass({ envelope: { release: 1 } })

  const polyInstances: FakeToneInstance[] = []
  function PolyCtor(
    this: unknown,
    voice?: new (options?: Record<string, unknown>) => FakeToneInstance,
    options?: Record<string, unknown>
  ): FakeToneInstance {
    const instance: FakeToneInstance = {
      options,
      connect: vi.fn(),
      triggerAttackRelease: vi.fn(),
      triggerRelease: vi.fn(),
      dispose: vi.fn(),
      releaseAll: vi.fn(),
      _dummyVoice: voice ? new voice() : undefined,
    }
    polyInstances.push(instance)
    return instance
  }

  const Tone: ToneEngine = {
    classes: {
      Synth: synth.Ctor,
      AMSynth: amSynth.Ctor,
      FMSynth: fmSynth.Ctor,
      DuoSynth: duo.Ctor,
      MembraneSynth: membrane.Ctor,
      MetalSynth: metal.Ctor,
      PluckSynth: pluck.Ctor,
      NoiseSynth: noise.Ctor,
      PolySynth: PolyCtor as unknown as ToneEngine['classes']['PolySynth'],
    },
    Time: (value) => ({
      toSeconds: () => (typeof value === 'number' ? value : Number.parseFloat(value)),
    }),
  }

  return { Tone, synth, noise, duo, pluck, polyInstances }
}

describe('playToneSynth', () => {
  it('constructs the allowlisted class, connects to a gain routed through the shared analyser — never .toDestination()', () => {
    const { ctx, gains, analysers } = fakeAudioContext()
    const { Tone, synth } = fakeToneEngine()

    playToneSynth(ctx, Tone, { synthType: 'Synth', note: 'C4', duration: '8n' }, 0.5)

    expect(synth.instances).toHaveLength(1)
    expect(synth.instances[0]!.connect).toHaveBeenCalledWith(gains[0])
    expect(gains[0]!.gain.value).toBe(0.5)
    expect(gains[0]!.connect).toHaveBeenCalledWith(analysers[0])
  })

  it('calls triggerAttackRelease(note, duration) for a standard monophonic class', () => {
    const { ctx } = fakeAudioContext()
    const { Tone, synth } = fakeToneEngine()

    playToneSynth(ctx, Tone, { synthType: 'Synth', note: 'C4', duration: '8n' }, 1)

    const instance = synth.instances[0]!
    expect(instance.triggerAttackRelease).toHaveBeenCalledWith('C4', '8n')
  })

  it('calls triggerAttackRelease(duration) for NoiseSynth — no note argument', () => {
    const { ctx } = fakeAudioContext()
    const { Tone, noise } = fakeToneEngine()

    playToneSynth(ctx, Tone, { synthType: 'NoiseSynth', duration: 0.05 }, 1)

    expect(noise.instances[0]!.triggerAttackRelease).toHaveBeenCalledWith(0.05)
  })

  it("requires a note for every class except NoiseSynth — throws (becomes a Nack via commandHandler's try/catch)", () => {
    const { ctx } = fakeAudioContext()
    const { Tone } = fakeToneEngine()

    expect(() => playToneSynth(ctx, Tone, { synthType: 'Synth', duration: '8n' }, 1)).toThrow(
      /requires a note/
    )
  })

  it('computes durationSeconds from duration + the CONSTRUCTED instance envelope.release (Synth)', () => {
    const { ctx } = fakeAudioContext()
    const { Tone } = fakeToneEngine()

    playToneSynth(ctx, Tone, { synthType: 'Synth', note: 'C4', duration: 0.25 }, 1)

    expect(getPlaybackStats(ctx).durationSeconds).toBeCloseTo(0.25 + 1) // duration + envelope.release
  })

  it("reads DuoSynth's release off .voice0.envelope.release, not a top-level .envelope", () => {
    const { ctx } = fakeAudioContext()
    const { Tone } = fakeToneEngine()

    playToneSynth(ctx, Tone, { synthType: 'DuoSynth', note: 'C4', duration: 0.5 }, 1)

    expect(getPlaybackStats(ctx).durationSeconds).toBeCloseTo(0.5 + 0.3)
  })

  it("reads PluckSynth's release off its own top-level .release — it has no .envelope at all", () => {
    const { ctx } = fakeAudioContext()
    const { Tone } = fakeToneEngine()

    playToneSynth(ctx, Tone, { synthType: 'PluckSynth', note: 'C4', duration: 0.5 }, 1)

    expect(getPlaybackStats(ctx).durationSeconds).toBeCloseTo(0.5 + 0.8)
  })

  it('stop() calls triggerRelease() for a standard monophonic class and flips playing:false', async () => {
    const { ctx } = fakeAudioContext()
    const { Tone, synth } = fakeToneEngine()

    const handle = playToneSynth(ctx, Tone, { synthType: 'Synth', note: 'C4', duration: 5 }, 1)
    expect(getPlaybackStats(ctx).playing).toBe(true)

    handle.stop()
    expect(synth.instances[0]!.triggerRelease).toHaveBeenCalledTimes(1)

    await Promise.resolve()
    expect(getPlaybackStats(ctx).playing).toBe(false)
  })

  it("stop() disposes the synth instance — every Play click must free its native nodes, not leak them for the sidecar process's lifetime", () => {
    const { ctx } = fakeAudioContext()
    const { Tone, synth } = fakeToneEngine()

    const handle = playToneSynth(ctx, Tone, { synthType: 'Synth', note: 'C4', duration: 5 }, 1)
    handle.stop()

    expect(synth.instances[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  describe('PolySynth', () => {
    it('constructs with the voice class from voiceType (default Synth) and passes config through', () => {
      const { ctx } = fakeAudioContext()
      const { Tone, polyInstances } = fakeToneEngine()

      playToneSynth(ctx, Tone, { synthType: 'PolySynth', note: ['C4', 'E4'], duration: '4n' }, 1)

      expect(polyInstances).toHaveLength(1)
      expect(polyInstances[0]!.triggerAttackRelease).toHaveBeenCalledWith(['C4', 'E4'], '4n')
    })

    it('rejects a non-Monophonic voiceType (NoiseSynth) rather than letting Tone throw internally', () => {
      const { ctx } = fakeAudioContext()
      const { Tone } = fakeToneEngine()

      expect(() =>
        playToneSynth(
          ctx,
          Tone,
          { synthType: 'PolySynth', voiceType: 'NoiseSynth', note: ['C4'], duration: '4n' },
          1
        )
      ).toThrow(/can't be a PolySynth voice/)
    })

    it('rejects PluckSynth and PolySynth itself as voice types too', () => {
      const { ctx } = fakeAudioContext()
      const { Tone } = fakeToneEngine()

      expect(() =>
        playToneSynth(
          ctx,
          Tone,
          { synthType: 'PolySynth', voiceType: 'PluckSynth', note: ['C4'], duration: 1 },
          1
        )
      ).toThrow(/can't be a PolySynth voice/)
      expect(() =>
        playToneSynth(
          ctx,
          Tone,
          { synthType: 'PolySynth', voiceType: 'PolySynth', note: ['C4'], duration: 1 },
          1
        )
      ).toThrow(/can't be a PolySynth voice/)
    })

    it('reads its release off the constructed _dummyVoice, recursing through the voice type', () => {
      const { ctx } = fakeAudioContext()
      const { Tone } = fakeToneEngine() // default voice Synth, envelope.release = 1

      playToneSynth(ctx, Tone, { synthType: 'PolySynth', note: ['C4'], duration: 0.4 }, 1)

      expect(getPlaybackStats(ctx).durationSeconds).toBeCloseTo(0.4 + 1)
    })

    it('stop() calls releaseAll(), not triggerRelease()', async () => {
      const { ctx } = fakeAudioContext()
      const { Tone, polyInstances } = fakeToneEngine()

      const handle = playToneSynth(
        ctx,
        Tone,
        { synthType: 'PolySynth', note: ['C4'], duration: 5 },
        1
      )
      handle.stop()

      expect(polyInstances[0]!.releaseAll).toHaveBeenCalledTimes(1)
      expect(polyInstances[0]!.triggerRelease).not.toHaveBeenCalled()
      await Promise.resolve()
      expect(getPlaybackStats(ctx).playing).toBe(false)
    })

    it('stop() disposes the PolySynth instance too', () => {
      const { ctx } = fakeAudioContext()
      const { Tone, polyInstances } = fakeToneEngine()

      const handle = playToneSynth(
        ctx,
        Tone,
        { synthType: 'PolySynth', note: ['C4'], duration: 5 },
        1
      )
      handle.stop()

      expect(polyInstances[0]!.dispose).toHaveBeenCalledTimes(1)
    })
  })
})

/** A controllable fake Wad instance — `play()` returns a promise the
 * test resolves manually (mirroring the real `Wad.play()`'s "resolves on
 * `onended`, fired by either natural completion or `.stop()`"
 * contract), never touching a real `web-audio-daw` import.
 *
 * `allWads` mirrors the real `Wad` class's own static array (verified
 * against the installed `web-audio-daw@4.13.4` bundle: its constructor
 * unconditionally runs `Wad.allWads.push(this)`, and the package never
 * removes an entry itself) — the fake constructor pushes to it the same
 * way, so `player.test.ts` can prove `playWadSynth`'s `stop()` actually
 * splices the instance back out, not just that it calls `wad.stop()`. */
function fakeWadInstance(): {
  Wad: WadConstructor
  instance: WadInstance & { config: Record<string, unknown> }
  resolvePlay: () => void
} {
  let resolvePlay: () => void = () => {}
  const playPromise = new Promise<void>((resolve) => {
    resolvePlay = resolve
  })
  const instance = {
    config: {} as Record<string, unknown>,
    play: vi.fn(() => playPromise),
    stop: vi.fn(),
  }
  function Wad(this: unknown, config: Record<string, unknown>): WadInstance {
    instance.config = config
    Wad.allWads.push(instance)
    return instance
  }
  Wad.allWads = [] as WadInstance[]
  return { Wad: Wad as unknown as WadConstructor, instance, resolvePlay }
}

describe('playWadSynth', () => {
  it("passes the shared gain node through as Wad's `destination` config field", () => {
    const { ctx, gains, analysers } = fakeAudioContext()
    const { Wad, instance } = fakeWadInstance()

    playWadSynth(ctx, Wad, { source: 'square' }, 0.6)

    expect(instance.config).toEqual({ source: 'square', destination: gains[0] })
    expect(gains[0]!.gain.value).toBe(0.6)
    expect(gains[0]!.connect).toHaveBeenCalledWith(analysers[0])
    expect(instance.play).toHaveBeenCalledTimes(1)
  })

  it('stop() calls wad.stop()', () => {
    const { ctx } = fakeAudioContext()
    const { Wad, instance } = fakeWadInstance()

    const handle = playWadSynth(ctx, Wad, { source: 'noise' }, 1)
    handle.stop()

    expect(instance.stop).toHaveBeenCalledTimes(1)
  })

  it('stop() removes the instance from Wad.allWads — Wad has no dispose()/destroy(), so this static array (which the constructor unconditionally pushes into and the package never prunes) is the only thing actually keeping a stopped instance alive; dropping our own reference alone would not free it', () => {
    const { ctx } = fakeAudioContext()
    const { Wad, instance } = fakeWadInstance()

    const handle = playWadSynth(ctx, Wad, { source: 'noise' }, 1)
    expect(Wad.allWads).toContain(instance)

    handle.stop()
    expect(Wad.allWads).not.toContain(instance)
  })

  it('stop() leaves other still-playing instances in Wad.allWads untouched — splices only its own entry', () => {
    const { ctx } = fakeAudioContext()
    const { Wad, instance: first } = fakeWadInstance()

    const handle = playWadSynth(ctx, Wad, { source: 'square' }, 1)
    // A second Wad instance constructed against the SAME Wad class/allWads
    // array, the way two concurrent playWadSynth calls would share it.
    const second = { config: {}, play: vi.fn(() => new Promise(() => {})), stop: vi.fn() }
    Wad.allWads.push(second)

    handle.stop()
    expect(Wad.allWads).not.toContain(first)
    expect(Wad.allWads).toContain(second)
  })

  // The trickiest part of the #47 generalization: durationSeconds is
  // always Infinity for a Wad synth (see playWadSynth's doc comment) —
  // this proves getPlaybackStats' math handles that sentinel correctly,
  // not just that it doesn't crash.
  describe('durationSeconds: Infinity (#47)', () => {
    it('reports playing:true indefinitely — elapsed never reaches Infinity', () => {
      const { ctx } = fakeAudioContext()
      const { Wad } = fakeWadInstance()

      playWadSynth(ctx, Wad, { source: 'sine' }, 1)
      ctx.currentTime = 0
      expect(getPlaybackStats(ctx).playing).toBe(true)

      // Advance the clock far past any real synth's plausible duration —
      // still playing, because nothing clamps against Infinity.
      ctx.currentTime = 10_000
      const stats = getPlaybackStats(ctx)
      expect(stats.playing).toBe(true)
      expect(stats.durationSeconds).toBe(Infinity)
      expect(stats.elapsedSeconds).toBe(10_000)
    })

    it('flips playing:false when the real play() promise resolves (natural end) — chained through an extra microtask hop', async () => {
      const { ctx } = fakeAudioContext()
      const { Wad, resolvePlay } = fakeWadInstance()

      playWadSynth(ctx, Wad, { source: 'sine' }, 1)
      expect(getPlaybackStats(ctx).playing).toBe(true)

      resolvePlay()
      // Two microtask hops: wad.play()'s promise resolving -> our own
      // `ended`'s .then (resolveEnded) -> trackPlayback's `ended.then`
      // that flips `record.ended`.
      await Promise.resolve()
      await Promise.resolve()

      expect(getPlaybackStats(ctx).playing).toBe(false)
    })

    it("stop() flips `ended` immediately — doesn't wait on Wad's own onended/stop-ramp timing (#47 hardening)", async () => {
      const { ctx } = fakeAudioContext()
      const { Wad, instance } = fakeWadInstance()

      const handle = playWadSynth(ctx, Wad, { source: 'sine' }, 1)
      handle.stop()
      expect(instance.stop).toHaveBeenCalledTimes(1)
      // `ended` is OUR OWN manually-resolvable promise — stop() resolves
      // it directly, one microtask hop through trackPlayback's `.then`,
      // never waiting on the fake's play() promise (which is NEVER
      // resolved in this test) the way the real Wad.stop()'s onended
      // eventually would be.
      await Promise.resolve()
      expect(getPlaybackStats(ctx).playing).toBe(false)
    })
  })
})
