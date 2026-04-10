import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Suspense, act } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { useThree } from '@react-three/fiber'

// Build a "fulfilled thenable" — the protocol React 19's `use()` checks for
// before suspending. When a thenable carries `status: 'fulfilled'` and a
// `value`, React returns the value synchronously instead of throwing to
// suspend. This lets us test the hook's resolution paths without juggling
// async re-renders for tests that aren't actually about the Suspense flow.
function fulfilled<T>(value: T): Promise<T> {
  const p = Promise.resolve(value) as Promise<T> & { status: string; value: T }
  p.status = 'fulfilled'
  p.value = value
  return p
}

// A "pending thenable" — a never-resolving promise. React's `use()` will
// throw it to trigger Suspense, surfacing the fallback in the test.
function pendingForever<T>(): Promise<T> {
  return new Promise<T>(() => {
    /* never resolves */
  })
}

// ── Mocks ───────────────────────────────────────────────────────────────────
//
// Mock @react-three/fiber so the test doesn't need a real R3F Canvas mount.
// `useThree(selector)` invokes the selector with a stub state that exposes a
// fake `gl` renderer object — useSkiaContext only reads `s.gl`.
vi.mock('@react-three/fiber', () => ({
  useThree: vi.fn(<T,>(selector: (state: { gl: object }) => T) =>
    selector({ gl: { __mock: 'renderer' } }),
  ),
}))

// Mock the SkiaContext module to control the singleton via test helpers.
// The hook only reads `SkiaContext.instance` and `instance.isDestroyed`.
vi.mock('../context', () => {
  let instance: { isDestroyed: boolean } | null = null
  return {
    SkiaContext: {
      get instance() {
        return instance
      },
      __setInstance(v: { isDestroyed: boolean } | null) {
        instance = v
      },
      __reset() {
        instance = null
      },
    },
  }
})

// Mock the Skia init module. The hook reads `Skia.pending` and may call
// `Skia.init(gl)`. We give the test full control over both via helpers that
// mimic the real dedupe behavior (init called twice returns the same promise).
vi.mock('../init', () => {
  let pending: Promise<unknown> | null = null
  let nextInitPromise: Promise<unknown> | null = null
  const init = vi.fn((_gl: unknown) => {
    if (pending) return pending
    if (nextInitPromise) {
      pending = nextInitPromise
      return nextInitPromise
    }
    throw new Error('Skia.init called without test setup — call __setNextInitPromise first')
  })
  return {
    Skia: {
      init,
      get pending() {
        return pending
      },
      __setPending(p: Promise<unknown> | null) {
        pending = p
      },
      __setNextInitPromise(p: Promise<unknown> | null) {
        nextInitPromise = p
      },
      __reset() {
        pending = null
        nextInitPromise = null
        init.mockClear()
      },
    },
  }
})

// Imports must come after the vi.mock calls (vitest hoists vi.mock to the top
// regardless, but keeping imports below makes the dependency order obvious).
import { SkiaContext } from '../context'
import { Skia } from '../init'
import { SkiaReactContext } from './context'
import { useSkiaContext } from './hooks'

// Test helpers reaching into the mocks
const SkiaContextMock = SkiaContext as unknown as {
  __setInstance(v: { isDestroyed: boolean } | null): void
  __reset(): void
}
const SkiaMock = Skia as unknown as typeof Skia & {
  __setPending(p: Promise<unknown> | null): void
  __setNextInitPromise(p: Promise<unknown> | null): void
  __reset(): void
}

// Component under test — reads the hook and renders the resolved id, so the
// test can assert by text content. `id` lives on the fake context objects.
function Probe() {
  const ctx = useSkiaContext() as unknown as { id: string }
  return <div data-testid="result">{ctx.id}</div>
}

function withSuspense(children: React.ReactNode) {
  return (
    <Suspense fallback={<div data-testid="loading">loading</div>}>
      {children}
    </Suspense>
  )
}

describe('useSkiaContext', () => {
  beforeEach(() => {
    SkiaContextMock.__reset()
    SkiaMock.__reset()
    vi.mocked(useThree).mockClear()
    cleanup()
  })

  it('case 1: returns the nearest React context value when provided', () => {
    const fake = { id: 'nearest', isDestroyed: false } as unknown as SkiaContext
    render(
      <SkiaReactContext.Provider value={fake}>
        {withSuspense(<Probe />)}
      </SkiaReactContext.Provider>,
    )

    expect(screen.getByTestId('result').textContent).toBe('nearest')
    expect(Skia.init).not.toHaveBeenCalled()
  })

  it('case 2: returns the global singleton when one exists and is alive', () => {
    SkiaContextMock.__setInstance({ isDestroyed: false } as unknown as SkiaContext & {
      isDestroyed: boolean
    })
    // Use a property bag with id for the assertion (mock allows any shape)
    SkiaContextMock.__setInstance({
      id: 'singleton',
      isDestroyed: false,
    } as unknown as SkiaContext & { isDestroyed: boolean })

    render(withSuspense(<Probe />))

    expect(screen.getByTestId('result').textContent).toBe('singleton')
    expect(Skia.init).not.toHaveBeenCalled()
  })

  it('case 2: skips a destroyed singleton and falls through to init', () => {
    SkiaContextMock.__setInstance({
      id: 'destroyed',
      isDestroyed: true,
    } as unknown as SkiaContext & { isDestroyed: boolean })

    SkiaMock.__setNextInitPromise(fulfilled({ id: 'fresh' }))

    render(withSuspense(<Probe />))

    expect(screen.getByTestId('result').textContent).toBe('fresh')
    expect(Skia.init).toHaveBeenCalledTimes(1)
  })

  it('case 3: returns the resolved value when pending is already fulfilled', () => {
    SkiaMock.__setPending(fulfilled({ id: 'pending-resolved' }))

    render(withSuspense(<Probe />))

    expect(screen.getByTestId('result').textContent).toBe('pending-resolved')
    // Hook read the pending thenable directly — it never called init
    expect(Skia.init).not.toHaveBeenCalled()
  })

  it('case 3: suspends while pending is unresolved (Suspense fallback shown)', async () => {
    SkiaMock.__setPending(pendingForever())

    await act(async () => {
      render(withSuspense(<Probe />))
    })

    expect(screen.getByTestId('loading')).toBeTruthy()
    expect(screen.queryByTestId('result')).toBeNull()
    expect(Skia.init).not.toHaveBeenCalled()
  })

  it('case 4: kicks off Skia.init with the R3F gl when there is no prior state', () => {
    SkiaMock.__setNextInitPromise(fulfilled({ id: 'init-result' }))

    render(withSuspense(<Probe />))

    expect(screen.getByTestId('result').textContent).toBe('init-result')
    expect(Skia.init).toHaveBeenCalledTimes(1)
    // Verify the fake gl from the useThree mock was passed in
    expect(vi.mocked(Skia.init).mock.calls[0]?.[0]).toEqual({ __mock: 'renderer' })
  })

  it('case 4: suspends while the init promise is unresolved', async () => {
    SkiaMock.__setNextInitPromise(pendingForever())

    await act(async () => {
      render(withSuspense(<Probe />))
    })

    expect(screen.getByTestId('loading')).toBeTruthy()
    expect(screen.queryByTestId('result')).toBeNull()
    expect(Skia.init).toHaveBeenCalledTimes(1)
  })

  it('rules-of-hooks: useThree is called unconditionally even when the singleton resolves first', () => {
    // This is a regression guard for the hoisting fix in hooks.ts. Before the
    // fix, `useThree` was only called in case 4 — moving it out of the
    // conditional branch was a deliberate change to satisfy
    // react-hooks/rules-of-hooks. If a future refactor reintroduces a
    // conditional `useThree`, this test should fail.
    SkiaContextMock.__setInstance({
      id: 'singleton',
      isDestroyed: false,
    } as unknown as SkiaContext & { isDestroyed: boolean })

    render(withSuspense(<Probe />))

    expect(useThree).toHaveBeenCalled()
    expect(screen.getByTestId('result').textContent).toBe('singleton')
  })

  it('rules-of-hooks: useThree is called unconditionally when the React context resolves first', () => {
    // Same regression guard for case 1 — `useContext` runs before `useThree`,
    // but `useThree` must still execute even though the context value short-
    // circuits the function.
    const fake = { id: 'nearest', isDestroyed: false } as unknown as SkiaContext

    render(
      <SkiaReactContext.Provider value={fake}>
        {withSuspense(<Probe />)}
      </SkiaReactContext.Provider>,
    )

    expect(useThree).toHaveBeenCalled()
  })
})
