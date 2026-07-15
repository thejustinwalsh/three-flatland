import { describe, expect, it, vi } from 'vitest'
import type { PlaybackStats } from '@three-flatland/audio-play'
import { ActivePlayback, watchPlaybackEnd } from './activePlayback'

const stats = (playing: boolean): PlaybackStats => ({
  peak: playing ? 0.5 : 0,
  silent: !playing,
  playing,
  durationSeconds: 2,
  elapsedSeconds: playing ? 0.5 : 2,
})

describe('ActivePlayback', () => {
  it('set marks the source active and fires onDidChange', () => {
    const onDidChange = vi.fn()
    const active = new ActivePlayback(onDidChange)

    active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })

    expect(active.current).toEqual({ findingId: 'f1', sourceUri: 'file:///a.ts' })
    expect(onDidChange).toHaveBeenCalledTimes(1)
  })

  it('a new set replaces the previous active source', () => {
    const active = new ActivePlayback(vi.fn())
    active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })
    active.set({ findingId: 'f2', sourceUri: 'file:///a.ts' })

    expect(active.current).toEqual({ findingId: 'f2', sourceUri: 'file:///a.ts' })
  })

  it('an unconditional clear clears and fires onDidChange; clearing nothing fires nothing', () => {
    const onDidChange = vi.fn()
    const active = new ActivePlayback(onDidChange)

    expect(active.clear()).toBe(false)
    expect(onDidChange).not.toHaveBeenCalled()

    active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })
    expect(active.clear()).toBe(true)
    expect(active.current).toBeUndefined()
    expect(onDidChange).toHaveBeenCalledTimes(2) // set + clear
  })

  it("a stale token's clear is a no-op — a watcher outliving its playback can't clobber a newer one", () => {
    const active = new ActivePlayback(vi.fn())
    const first = active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })
    active.set({ findingId: 'f2', sourceUri: 'file:///a.ts' })

    expect(active.clear(first)).toBe(false)
    expect(active.current).toEqual({ findingId: 'f2', sourceUri: 'file:///a.ts' })
  })
})

describe('watchPlaybackEnd', () => {
  it('clears the active source (auto-revert) once stats flips playing false after having played', async () => {
    const active = new ActivePlayback(vi.fn())
    const token = active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })

    let playing = true
    const watcher = watchPlaybackEnd(active, token, async () => stats(playing), { pollMs: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(active.current).toBeDefined() // still playing — no premature revert

    playing = false
    await watcher
    expect(active.current).toBeUndefined()
  })

  it('a watcher superseded by a newer play exits without clearing the new active source', async () => {
    const active = new ActivePlayback(vi.fn())
    const first = active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })
    const watcher = watchPlaybackEnd(active, first, async () => stats(true), { pollMs: 1 })

    active.set({ findingId: 'f2', sourceUri: 'file:///a.ts' })
    await watcher

    expect(active.current).toEqual({ findingId: 'f2', sourceUri: 'file:///a.ts' })
  })

  it('a play that never starts within the startup window clears — no dead ⏹ Stop lens', async () => {
    const active = new ActivePlayback(vi.fn())
    const token = active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })

    await watchPlaybackEnd(active, token, async () => stats(false), { pollMs: 1, startupMs: 5 })
    expect(active.current).toBeUndefined()
  })

  it('a getStats failure counts as not-playing — the watcher still terminates and clears', async () => {
    const active = new ActivePlayback(vi.fn())
    const token = active.set({ findingId: 'f1', sourceUri: 'file:///a.ts' })

    await watchPlaybackEnd(
      active,
      token,
      async () => {
        throw new Error('sidecar gone')
      },
      { pollMs: 1, startupMs: 5 }
    )
    expect(active.current).toBeUndefined()
  })
})
