import { describe, expect, it, vi } from 'vitest'
import type { PlaySidecarClient } from '@three-flatland/zzfx-play'
import { playToneSynthWithColdStartRetry } from './toneColdStartRetry'

function fakeClient(
  playToneSynthAwaitable: PlaySidecarClient['playToneSynthAwaitable']
): PlaySidecarClient {
  // Only playToneSynthAwaitable is exercised by the function under test —
  // narrowing the fake to exactly that one method means an accidental
  // reintroduction of e.g. a getStats() call would throw (no such
  // property) rather than silently pass.
  return { playToneSynthAwaitable } as unknown as PlaySidecarClient
}

const CMD = { synthType: 'Synth', note: 'C4', duration: '8n' } as const

describe('playToneSynthWithColdStartRetry', () => {
  it('resolves true immediately when the first attempt Acks — no retry needed', async () => {
    const playToneSynthAwaitable = vi.fn().mockResolvedValue({ ok: true })

    const result = await playToneSynthWithColdStartRetry(
      fakeClient(playToneSynthAwaitable),
      CMD,
      undefined
    )

    expect(result).toBe(true)
    expect(playToneSynthAwaitable).toHaveBeenCalledTimes(1)
  })

  it("never falsely reports success from an UNRELATED sound's shared playback state — only THIS call's own correlated Ack counts", async () => {
    // The bug this correlation fix targets: a one-shot's leftover
    // stats.playing:true used to leak into this call's success check.
    // The fix drops that shared signal entirely — playToneSynthAwaitable
    // is the ONLY thing this retry consults, so a Nack on the first
    // attempt can never be masked by an unrelated sound still being
    // audible; it must genuinely retry and only succeed once ITS OWN
    // second attempt Acks.
    const playToneSynthAwaitable = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: 'Tone.js is still loading — try again in a moment',
        code: 'TONE_LOADING',
      })
      .mockResolvedValueOnce({ ok: true })

    const result = await playToneSynthWithColdStartRetry(
      fakeClient(playToneSynthAwaitable),
      CMD,
      undefined
    )

    expect(result).toBe(true)
    expect(playToneSynthAwaitable).toHaveBeenCalledTimes(2)
  })

  it('a rejected playToneSynthAwaitable call (e.g. the sidecar already exited) counts as a failed attempt, not a thrown error', async () => {
    const playToneSynthAwaitable = vi
      .fn()
      .mockRejectedValueOnce(new Error('zzfx-play: sidecar is not running'))
      .mockResolvedValueOnce({ ok: true })

    const result = await playToneSynthWithColdStartRetry(
      fakeClient(playToneSynthAwaitable),
      CMD,
      undefined
    )

    expect(result).toBe(true)
    expect(playToneSynthAwaitable).toHaveBeenCalledTimes(2)
  })

  it('resolves false once the whole retry budget is exhausted — one outcome, not one error per attempt', async () => {
    vi.useFakeTimers()
    try {
      const playToneSynthAwaitable = vi.fn().mockResolvedValue({
        ok: false,
        error: 'Tone.js is still loading — try again in a moment',
        code: 'TONE_LOADING',
      })

      const resultPromise = playToneSynthWithColdStartRetry(
        fakeClient(playToneSynthAwaitable),
        CMD,
        undefined
      )
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(result).toBe(false)
      // 1 initial attempt + 4 scheduled retries (250/500/1000/2000ms).
      expect(playToneSynthAwaitable).toHaveBeenCalledTimes(5)
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes volume through to every attempt, including retries', async () => {
    const playToneSynthAwaitable = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'still loading', code: 'TONE_LOADING' })
      .mockResolvedValueOnce({ ok: true })

    await playToneSynthWithColdStartRetry(fakeClient(playToneSynthAwaitable), CMD, 0.5)

    expect(playToneSynthAwaitable).toHaveBeenNthCalledWith(1, CMD, 0.5)
    expect(playToneSynthAwaitable).toHaveBeenNthCalledWith(2, CMD, 0.5)
  })
})
