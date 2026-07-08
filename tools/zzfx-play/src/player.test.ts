import { describe, expect, it, vi } from 'vitest'
import { getPlaybackStats, playBuffer, playSampleChannels } from './player.js'

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
  ctx: AudioContext
  buffers: { copyToChannel: ReturnType<typeof vi.fn>; getChannelData: ReturnType<typeof vi.fn> }[]
  sources: {
    buffer: unknown
    playbackRate: { value: number }
    loop: boolean
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
  }[]
  gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn> }[]
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
        connect: vi.fn((target: unknown) => target),
        start: vi.fn(),
      }
      sources.push(source)
      return source
    }),
    createGain: vi.fn(() => {
      const gain = { gain: { value: 0 }, connect: vi.fn() }
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

  return { ctx: ctx as unknown as AudioContext, buffers, sources, gains, analysers }
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
    return { length: 4410, numberOfChannels: 2, sampleRate: 44100 } as unknown as AudioBuffer
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

  it('reports silent:true, peak:0 when the analyser window is untouched', () => {
    const { ctx } = fakeAudioContext()

    const stats = getPlaybackStats(ctx)

    expect(stats).toEqual({ peak: 0, silent: true })
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
})
