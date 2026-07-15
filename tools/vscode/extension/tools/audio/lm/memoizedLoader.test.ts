import { describe, expect, it, vi } from 'vitest'
import { createMemoizedLoader } from './memoizedLoader'

/** Resolves on the next microtask/macrotask tick — lets a test interleave
 * two in-flight `get()` calls before either's underlying `load()` settles. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('createMemoizedLoader', () => {
  it('loads once and caches the result across repeated get() calls', async () => {
    const load = vi.fn(async () => ({ a: '1' }))
    const loader = createMemoizedLoader(load)

    await loader.get()
    await loader.get()
    await loader.get()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('two concurrent cold get() calls share one in-flight load — the regression this exists for', async () => {
    // A deferred load so both get() calls are issued while it's still
    // pending — exactly the "two concurrent cold generate() calls"
    // shape the real bug hit (two Generate clicks in different panels
    // before either finished its first cache lookup).
    let resolveLoad!: (v: Record<string, string>) => void
    const load = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveLoad = resolve
        })
    )
    const loader = createMemoizedLoader(load)

    const first = loader.get()
    const second = loader.get()
    expect(load).toHaveBeenCalledTimes(1) // not 2 — the second call reused the first's in-flight promise

    resolveLoad({ shared: 'value' })
    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toBe(secondResult) // same object reference, not two independent reads
    expect(firstResult).toEqual({ shared: 'value' })
  })

  it('a set() after the shared load resolves is what later get() calls see — not a stale reload', async () => {
    // Reproduces the exact failure mode the fix closes, from the other
    // side: without memoization, two independent load() calls would
    // each read the file, and a LATER of those two reads resolving
    // would clobber a mutation made using the earlier one's result.
    // With memoization there's only ever one read to begin with — this
    // asserts the actual observable guarantee that matters: set()
    // updates what subsequent get() calls return, and doing so never
    // triggers a second (redundant, and in the old code, racy) load.
    let resolveLoad!: (v: Record<string, string>) => void
    const load = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveLoad = resolve
        })
    )
    const loader = createMemoizedLoader(load)

    const first = loader.get()
    const second = loader.get() // shares the same in-flight promise as `first`

    resolveLoad({ original: 'on-disk' })
    expect(await first).toEqual({ original: 'on-disk' })
    expect(await second).toEqual({ original: 'on-disk' })

    loader.set({ original: 'on-disk', added: 'by-a-writer' })
    const third = await loader.get()

    expect(third).toEqual({ original: 'on-disk', added: 'by-a-writer' })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('peek() reflects the cached value once loaded, undefined while cold', async () => {
    const loader = createMemoizedLoader(async () => ({ x: '1' }))
    expect(loader.peek()).toBeUndefined()
    await loader.get()
    expect(loader.peek()).toEqual({ x: '1' })
  })

  it('a load after set() is skipped — set() counts as warm, not just get()', async () => {
    const load = vi.fn(async () => ({ from: 'disk' }))
    const loader = createMemoizedLoader(load)
    loader.set({ from: 'writer' })
    const result = await loader.get()
    expect(result).toEqual({ from: 'writer' })
    expect(load).not.toHaveBeenCalled()
  })

  it('a fresh get() after the in-flight promise settles triggers no redundant load', async () => {
    const load = vi.fn(async () => ({ a: '1' }))
    const loader = createMemoizedLoader(load)
    await loader.get()
    await tick()
    await loader.get()
    expect(load).toHaveBeenCalledTimes(1)
  })
})
