import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContextLifecycle,
  type ContextLifecycleOptions,
  type LifecycleContext,
  type QuietSignals,
} from './contextLifecycle.js'

type FakeContext = LifecycleContext & {
  resume: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakeContext(
  state: LifecycleContext['state'],
  overrides: Partial<Pick<FakeContext, 'resume' | 'close'>> = {}
): FakeContext {
  const ctx: FakeContext = {
    state,
    resume: overrides.resume ?? vi.fn(async () => undefined),
    close:
      overrides.close ??
      vi.fn(async () => {
        ctx.state = 'closed'
      }),
  }
  return ctx
}

const NEVER = () => new Promise<never>(() => {})

function harness(initial: FakeContext, overrides: Partial<ContextLifecycleOptions<FakeContext>>) {
  let current = initial
  const created: FakeContext[] = []
  const logs: string[] = []
  const quiet: QuietSignals = { liveSources: 0, playing: false, silent: true }
  const onReacquired = vi.fn()
  const lifecycle = createContextLifecycle<FakeContext>({
    getCurrent: () => current,
    setCurrent: (ctx) => {
      current = ctx
    },
    createContext: () => {
      const ctx = fakeContext('running')
      created.push(ctx)
      return ctx
    },
    onReacquired,
    isQuiet: () => ({ ...quiet }),
    // Tests run the enqueued close inline — chain-serialization ordering
    // itself is the sidecar's concern, exercised by the race tests below
    // through lastActivityAt bumps.
    enqueue: (fn) => {
      void fn()
    },
    log: (msg) => logs.push(msg),
    idleMs: 1000,
    opBoundMs: 300,
    quietSamples: 3,
    quietSampleGapMs: 50,
    ...overrides,
  })
  return {
    lifecycle,
    created,
    logs,
    quiet,
    onReacquired,
    get current() {
      return current
    },
  }
}

describe('createContextLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('acquire ladder', () => {
    it('a running context is used as-is — no resume, no swap', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      expect(ctx.resume).not.toHaveBeenCalled()
      expect(ctx.close).not.toHaveBeenCalled()
      expect(h.onReacquired).not.toHaveBeenCalled()
      expect(h.current).toBe(ctx)
    })

    it('a suspended context gets ONE resume attempt — success means no swap', async () => {
      const ctx = fakeContext('suspended', {
        resume: vi.fn(async () => {
          ctx.state = 'running'
        }),
      })
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      expect(ctx.resume).toHaveBeenCalledTimes(1)
      expect(h.onReacquired).not.toHaveBeenCalled()
      expect(h.current).toBe(ctx)
    })

    it('an interrupted context also gets the resume attempt (spec: OS contention state)', async () => {
      const ctx = fakeContext('interrupted', {
        resume: vi.fn(async () => {
          ctx.state = 'running'
        }),
      })
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      expect(ctx.resume).toHaveBeenCalledTimes(1)
      expect(h.current).toBe(ctx)
    })

    it('a FAILED resume falls through to reacquire — old closed, fresh assigned, hook called once', async () => {
      const ctx = fakeContext('suspended', {
        resume: vi.fn(async () => {
          throw new Error('device gone')
        }),
      })
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      expect(ctx.close).toHaveBeenCalledTimes(1)
      expect(h.created).toHaveLength(1)
      expect(h.current).toBe(h.created[0])
      expect(h.onReacquired).toHaveBeenCalledTimes(1)
      expect(h.onReacquired).toHaveBeenCalledWith(h.created[0])
      expect(h.logs.join('\n')).toMatch(/resume\(\) failed: device gone/)
      expect(h.logs.join('\n')).toMatch(/reacquired context before play \(was 'suspended'\)/)
    })

    it('a CLOSED context (idle-released or dead) skips resume and reacquires directly — release and death converge on one path', async () => {
      const ctx = fakeContext('closed')
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      expect(ctx.resume).not.toHaveBeenCalled()
      expect(ctx.close).not.toHaveBeenCalled() // already closed — no second close
      expect(h.current).toBe(h.created[0])
      expect(h.onReacquired).toHaveBeenCalledTimes(1)
    })

    it('a HANGING resume is bounded — reacquire proceeds after opBoundMs, the chain never wedges', async () => {
      const ctx = fakeContext('suspended', { resume: vi.fn(NEVER) })
      const h = harness(ctx, {})
      const pending = h.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(300)
      await pending
      expect(h.current).toBe(h.created[0])
      expect(h.logs.join('\n')).toMatch(/resume\(\) timed out after 300ms/)
    })

    it('a HANGING close during reacquire is bounded too', async () => {
      const ctx = fakeContext('suspended', {
        resume: vi.fn(async () => {
          throw new Error('nope')
        }),
        close: vi.fn(NEVER),
      })
      const h = harness(ctx, {})
      const pending = h.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(300)
      await pending
      expect(h.current).toBe(h.created[0])
    })

    it('a THROWING onReacquired hook cannot break ensureRunning — the fresh context stays assigned and the swap completes logged', async () => {
      // The hook re-binds engines (Tone setContext, Wad cache bust). If
      // it throws AFTER setCurrent, ensureRunning must still honor its
      // never-throws contract and finish the swap: the fresh context IS
      // already live, and a half-done reacquire (assigned but unlogged,
      // remaining rebinds skipped) is worse than a logged hook failure.
      const ctx = fakeContext('closed')
      const throwingHook = vi.fn(() => {
        throw new Error('tone rebind exploded')
      })
      const h = harness(ctx, { onReacquired: throwingHook })
      await expect(h.lifecycle.ensureRunning('play')).resolves.toBeUndefined()
      expect(throwingHook).toHaveBeenCalledTimes(1)
      expect(h.current).toBe(h.created[0]) // swap completed despite the hook
      expect(h.logs.join('\n')).toMatch(/reacquire hook failed.*tone rebind exploded/)
      expect(h.logs.join('\n')).toMatch(/reacquired context before play \(was 'closed'\)/)
    })

    it('a throwing createContext logs, leaves the old context assigned, and resolves (never throws into the chain)', async () => {
      const ctx = fakeContext('closed')
      const h = harness(ctx, {
        createContext: () => {
          throw new Error('no device at all')
        },
      })
      await expect(h.lifecycle.ensureRunning('play')).resolves.toBeUndefined()
      expect(h.current).toBe(ctx)
      expect(h.onReacquired).not.toHaveBeenCalled()
      expect(h.logs.join('\n')).toMatch(/reacquire FAILED before play: no device at all/)
    })
  })

  describe('idle-release', () => {
    it('closes a quiet context after idleMs — and only once', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(1000 + 3 * 50 + 10)
      expect(ctx.close).toHaveBeenCalledTimes(1)
      expect(h.logs.join('\n')).toMatch(/idle-release: closed context after 1000ms idle/)
      // No further timers pending against the closed context.
      await vi.advanceTimersByTimeAsync(5000)
      expect(ctx.close).toHaveBeenCalledTimes(1)
    })

    it('activity resets the idle timer — no close while plays keep arriving', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      for (let i = 0; i < 5; i++) {
        await h.lifecycle.ensureRunning('play')
        await vi.advanceTimersByTimeAsync(700) // always under the 1000ms window
      }
      expect(ctx.close).not.toHaveBeenCalled()
    })

    it('a tracked current source still inside its window (playing=true) blocks the close and re-arms', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      h.quiet.playing = true
      await h.lifecycle.ensureRunning('playSong')
      await vi.advanceTimersByTimeAsync(1500)
      expect(ctx.close).not.toHaveBeenCalled()
      // The song ends — the re-armed timer's next expiry closes.
      h.quiet.playing = false
      await vi.advanceTimersByTimeAsync(1000 + 3 * 50 + 10)
      expect(ctx.close).toHaveBeenCalledTimes(1)
    })

    it('still-ringing overlapped sources (liveSources>0) block the close even when the single-slot record says not-playing', async () => {
      // THE redline case: long song + later short one-shot overwrote the
      // record; record says false while the song still rings.
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      h.quiet.playing = false
      h.quiet.liveSources = 1
      h.quiet.silent = false
      await h.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(2500)
      expect(ctx.close).not.toHaveBeenCalled()
    })

    it('one non-silent analyser sample mid-confirmation-window aborts the close (Tone/Wad tails)', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      let reads = 0
      const base = { liveSources: 0, playing: false }
      const isQuietSpy = vi.fn(() => {
        reads += 1
        return { ...base, silent: reads !== 2 } // second sample catches a tail
      })
      // Swap the reader after arming — harness exposes quiet by value, so
      // rebuild the lifecycle for this one with the spy.
      const h2 = harness(fakeContext('running'), { isQuiet: isQuietSpy })
      await h2.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(1000 + 3 * 50 + 10)
      expect(h2.current.close).not.toHaveBeenCalled()
      expect(isQuietSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('a play landing during the confirmation window aborts the close (activity wins the race)', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(1000 + 60) // timer fired, mid-sampling
      await h.lifecycle.ensureRunning('play') // burst resumes
      await vi.advanceTimersByTimeAsync(200)
      expect(ctx.close).not.toHaveBeenCalled()
    })

    it('dispose() cancels the idle timer', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, {})
      await h.lifecycle.ensureRunning('play')
      h.lifecycle.dispose()
      await vi.advanceTimersByTimeAsync(5000)
      expect(ctx.close).not.toHaveBeenCalled()
    })

    it('idleMs <= 0 disables idle-release entirely', async () => {
      const ctx = fakeContext('running')
      const h = harness(ctx, { idleMs: 0 })
      await h.lifecycle.ensureRunning('play')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(ctx.close).not.toHaveBeenCalled()
    })
  })
})
