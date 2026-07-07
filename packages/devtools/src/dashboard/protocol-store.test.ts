import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProtocolStore } from './protocol-store'
import type { LogEntry, ProtocolStoreOptions } from './protocol-store'

// `DB_NAME` is a hardcoded constant shared by every `ProtocolStore`
// instance, and each instance restarts its own id counter at 1 — so
// without isolation, a prior test's store (including any still-pending
// self-heal retry timer) can clobber a later test's rows by id
// collision in the same physical IDB database. A fresh `IDBFactory`
// per test gives every store its own in-memory database.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

// Mirrors the private `TAIL_CACHE` constant in protocol-store.ts — the
// per-provider pinned-tail window pruning must never touch. Pushing
// more than this many entries for one provider guarantees the
// earliest ones fall outside the pinned tail and become prune-eligible.
const TAIL_CACHE = 400

// Mirrors the private `PRUNE_BATCH_SIZE` constant — the cap on rows a
// single prune pass deletes before yielding. Pushing enough eligible
// entries to exceed this forces a scenario spanning multiple passes.
const PRUNE_BATCH_SIZE = 500

function makeEntry(overrides: Partial<Omit<LogEntry, 'id' | 'providerId'>> = {}): Omit<LogEntry, 'id' | 'providerId'> {
  return {
    at: Date.now(),
    direction: 'in',
    type: 'test',
    bytes: 1024,
    ...overrides,
  }
}

// writeFlushMs kept tiny so the write-batch timer doesn't add real
// wall-clock delay; each test controls byteBudget/throttle knobs
// directly.
function makeStore(options: ProtocolStoreOptions = {}): ProtocolStore {
  return new ProtocolStore({ writeFlushMs: 1, ...options })
}

/** Ground truth: what's actually in IDB right now, independent of the
 *  store's in-memory `retainedRange` bookkeeping. */
async function idbIds(store: ProtocolStore, providerId: string): Promise<number[]> {
  return store.queryFiltered(providerId, () => true)
}

describe('ProtocolStore byte-budget pruning', () => {
  it('prunes the oldest entries first once the byte budget is exceeded', async () => {
    const store = makeStore({ byteBudget: 3000, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    for (let i = 1; i <= TAIL_CACHE + 20; i++) {
      store.push('p1', makeEntry({ frame: i }))
    }

    await vi.waitFor(async () => {
      const ids = await idbIds(store, 'p1')
      expect(ids[0]).toBe(21)
    }, { timeout: 2000, interval: 20 })

    const ids = await idbIds(store, 'p1')
    expect(ids).not.toContain(1)
    expect(ids).not.toContain(20)
    expect(ids[0]).toBe(21)
    expect(ids[ids.length - 1]).toBe(TAIL_CACHE + 20)
    // Contiguous — a partial/interleaved delete would leave gaps.
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1]! + 1)
    }
  })

  it("never prunes entries inside a provider's pinned tail window", async () => {
    const store = makeStore({ byteBudget: 1, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    // Fewer messages than TAIL_CACHE — every entry is still "tail", so
    // nothing is prune-eligible even though we're wildly over budget
    // from the very first push.
    for (let i = 1; i <= 10; i++) {
      store.push('p1', makeEntry({ frame: i }))
    }

    // Give pruning (including its self-heal retries) every chance to
    // run, then confirm nothing was removed.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(await idbIds(store, 'p1')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(store.retainedRange('p1')!.oldestId).toBe(1)
  })

  it('tightens retainedRange as pruning advances the retained window', async () => {
    const store = makeStore({ byteBudget: 3000, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    expect(store.retainedRange('p1')).toBeNull()

    for (let i = 1; i <= TAIL_CACHE + 20; i++) {
      store.push('p1', makeEntry({ frame: i }))
    }

    await vi.waitFor(() => {
      expect(store.retainedRange('p1')!.oldestId).toBe(21)
    }, { timeout: 2000, interval: 20 })

    const range = store.retainedRange('p1')!
    expect(range.newestId).toBe(TAIL_CACHE + 20)
    expect(range.oldestFrame).toBe(21)
    expect(range.newestFrame).toBe(TAIL_CACHE + 20)
  })

  it("does not disturb an untouched provider's retained range", async () => {
    const store = makeStore({ byteBudget: 3000, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    // p2 stays small and well under its own tail window throughout.
    for (let i = 1; i <= 5; i++) store.push('p2', makeEntry({ frame: i }))
    // p1 grows past budget and gets pruned. Ids are global-monotonic,
    // so p1 picks up where p2 left off (6..425) — its tail floor lands
    // at 26 (425 - TAIL_CACHE + 1), not 21.
    for (let i = 1; i <= TAIL_CACHE + 20; i++) store.push('p1', makeEntry({ frame: i }))

    await vi.waitFor(() => {
      expect(store.retainedRange('p1')!.oldestId).toBe(26)
    }, { timeout: 2000, interval: 20 })

    expect(await idbIds(store, 'p2')).toEqual([1, 2, 3, 4, 5])
    expect(store.retainedRange('p2')).toEqual({
      oldestId: 1,
      newestId: 5,
      oldestFrame: 1,
      newestFrame: 5,
    })
  })

  it('falls back to a fixed byte budget when navigator.storage.estimate() is unavailable', async () => {
    const originalStorage = (globalThis.navigator as { storage?: unknown }).storage
    Object.defineProperty(globalThis.navigator, 'storage', {
      value: undefined,
      configurable: true,
    })
    try {
      const store = makeStore({ fallbackBudgetBytes: 12345 })
      await vi.waitFor(() => {
        expect(store.byteBudget).toBe(12345)
      }, { timeout: 1000, interval: 10 })
    } finally {
      Object.defineProperty(globalThis.navigator, 'storage', {
        value: originalStorage,
        configurable: true,
      })
    }
  })

  it('uses a fixed byteBudget override synchronously, without touching navigator.storage', () => {
    const store = makeStore({ byteBudget: 555 })
    expect(store.byteBudget).toBe(555)
  })

  it('throttles prune passes: writes below the throttle window do not trigger a pass', async () => {
    const threshold = TAIL_CACHE + 20
    const store = makeStore({
      byteBudget: 100,
      pruneEveryNWrites: threshold,
      pruneIntervalMs: Number.POSITIVE_INFINITY,
    })
    for (let i = 1; i < threshold; i++) store.push('p1', makeEntry({ frame: i }))

    // Over budget from the first push, but below the write-count
    // throttle and the interval is disabled — pruning must not have
    // run yet.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect((await idbIds(store, 'p1'))[0]).toBe(1)
    expect(store.retainedRange('p1')!.oldestId).toBe(1)

    // Crossing the write-count threshold engages the throttled pass.
    store.push('p1', makeEntry({ frame: threshold }))
    await vi.waitFor(() => {
      expect(store.retainedRange('p1')!.oldestId).toBeGreaterThan(1)
    }, { timeout: 2000, interval: 20 })
  })

  it('throttles prune passes: an elapsed interval alone can trigger a pass', async () => {
    let now = 0
    const total = TAIL_CACHE + 9
    const store = makeStore({
      byteBudget: 100,
      pruneEveryNWrites: Number.POSITIVE_INFINITY,
      pruneIntervalMs: 50,
      now: () => now,
    })
    for (let i = 1; i < total; i++) store.push('p1', makeEntry({ frame: i }))

    // Interval hasn't elapsed yet (clock pinned at 0) — no pass
    // despite being over budget.
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect((await idbIds(store, 'p1'))[0]).toBe(1)

    // Advance the injected clock past the interval, then push again to
    // re-evaluate the throttle gate.
    now = 100
    store.push('p1', makeEntry({ frame: total }))
    await vi.waitFor(() => {
      expect(store.retainedRange('p1')!.oldestId).toBeGreaterThan(1)
    }, { timeout: 2000, interval: 20 })
  })

  it("pins each provider to its own newest TAIL_CACHE rows when providers interleave writes", async () => {
    const perProvider = TAIL_CACHE + 100
    const store = makeStore({ byteBudget: 3000, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    // p1 lands on every odd global id, p2 on every even one.
    for (let i = 1; i <= perProvider; i++) {
      store.push('p1', makeEntry({ frame: i }))
      store.push('p2', makeEntry({ frame: i }))
    }

    await vi.waitFor(async () => {
      expect(await idbIds(store, 'p1')).toHaveLength(TAIL_CACHE)
      expect(await idbIds(store, 'p2')).toHaveLength(TAIL_CACHE)
    }, { timeout: 3000, interval: 20 })

    // Each provider's retained set must be exactly its OWN newest
    // TAIL_CACHE entries. A global-id-span cutoff (`maxId - TAIL_CACHE
    // + 1`) would instead retain whichever ids happen to fall in the
    // last TAIL_CACHE *values* — with two interleaved writers that
    // numeric span holds only ~TAIL_CACHE/2 of any single provider's
    // own rows, wrongly pruning the rest of its recent history.
    const p1All = Array.from({ length: perProvider }, (_, k) => 2 * k + 1)
    const p2All = Array.from({ length: perProvider }, (_, k) => 2 * k + 2)
    expect(await idbIds(store, 'p1')).toEqual(p1All.slice(-TAIL_CACHE))
    expect(await idbIds(store, 'p2')).toEqual(p2All.slice(-TAIL_CACHE))
  })

  it('reconciles in-memory counters when a write-batch transaction fails to commit', async () => {
    const store = makeStore({ byteBudget: 1_000_000 })
    const originalPut = IDBObjectStore.prototype.put
    let shouldFail = true
    // Simulates a put() that fails synchronously (quota exceeded, a
    // non-clonable payload, etc.) — a real failure mode `_writeBatch`
    // must recover from, not just a theoretical one.
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: unknown[]) {
      if (shouldFail) {
        shouldFail = false
        throw new DOMException('simulated failure', 'UnknownError')
      }
      return originalPut.apply(this, args as Parameters<typeof originalPut>)
    } as typeof originalPut
    try {
      store.push('p1', makeEntry({ frame: 1 }))
      await vi.waitFor(() => {
        expect(store.statsFor('p1').ids).toEqual([])
      }, { timeout: 1000, interval: 10 })
      // The failed row must not linger anywhere in the accounting —
      // not as a phantom id, not as inflated byte usage, not as a
      // retainable range with nothing behind it.
      expect(store.statsFor('p1').total).toBe(0)
      expect(store.retainedRange('p1')).toBeNull()

      // A subsequent, unaffected write proceeds normally afterward —
      // the failure doesn't wedge the store.
      store.push('p1', makeEntry({ frame: 2 }))
      await vi.waitFor(async () => {
        expect(await idbIds(store, 'p1')).toEqual([2])
      }, { timeout: 1000, interval: 10 })
      expect(store.statsFor('p1').total).toBe(1)
    } finally {
      IDBObjectStore.prototype.put = originalPut
    }
  })

  it('arms a one-shot timer so an over-budget burst prunes on interval elapse with no further push', async () => {
    // Write-count threshold set far above what we push, so only the
    // interval-based path (armed by `_maybePrune` itself, not by a
    // later `push()`) can trigger the pass.
    const store = makeStore({
      byteBudget: 100,
      pruneEveryNWrites: TAIL_CACHE + 1000,
      pruneIntervalMs: 30,
    })
    for (let i = 1; i <= TAIL_CACHE + 20; i++) store.push('p1', makeEntry({ frame: i }))

    // No further push after this point.
    await vi.waitFor(async () => {
      const ids = await idbIds(store, 'p1')
      expect(ids[0]).toBeGreaterThan(1)
    }, { timeout: 2000, interval: 10 })
  })

  it("keeps statsFor().total aligned with the retained row count, not a lifetime push count, after pruning", async () => {
    const store = makeStore({ byteBudget: 3000, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    for (let i = 1; i <= TAIL_CACHE + 20; i++) {
      store.push('p1', makeEntry({ frame: i }))
    }

    await vi.waitFor(async () => {
      expect(await idbIds(store, 'p1')).toHaveLength(TAIL_CACHE)
    }, { timeout: 2000, interval: 20 })

    // 420 rows were ever pushed, but only TAIL_CACHE (400) survive.
    // `total` backs `ids[total - 1 - i]` visual-index math in
    // protocol-log.tsx, so it must track what's retained, not what was
    // ever pushed — otherwise that indexing walks past the end of the
    // (shorter) retained `ids` array.
    const stats = store.statsFor('p1')
    expect(stats.total).toBe(TAIL_CACHE)
    expect(stats.total).toBe(stats.ids.length)
  })

  it('keeps oldestFrame correct (not stale) after a partial prune pass stops before reaching the first survivor', async () => {
    // 520 eligible entries (TAIL_CACHE=400 protected, 520 prune-
    // eligible below it) — comfortably more than PRUNE_BATCH_SIZE(500)
    // so the first pass stops at the batch cap without ever reaching
    // survivor id 501, but small enough that fake-indexeddb's cursor
    // walk (whose cost scales with total rows in the store, verified
    // separately) stays fast.
    const total = TAIL_CACHE + 520
    const store = makeStore({ byteBudget: 1, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    for (let i = 1; i <= total; i++) store.push('p1', makeEntry({ frame: i }))

    // First pass converges to exactly PRUNE_BATCH_SIZE deletions
    // without observing the boundary. A regression here leaves
    // `oldestFrame` at the stale frame of id 1 (deleted in this very
    // pass) instead of recovering the real boundary's frame.
    await vi.waitFor(async () => {
      const ids = await idbIds(store, 'p1')
      expect(ids[0]).toBe(PRUNE_BATCH_SIZE + 1)
    }, { timeout: 4000, interval: 10 })
    expect(store.retainedRange('p1')!.oldestFrame).toBe(PRUNE_BATCH_SIZE + 1)
  })

  it('dispose() cancels a pending write-flush timer so a buffered batch never lands in IDB', async () => {
    const store = makeStore({ writeFlushMs: 20 })
    store.push('p1', makeEntry({ frame: 1 }))
    store.dispose()

    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(await idbIds(store, 'p1')).toEqual([])
  })

  it('dispose() halts an in-flight multi-pass prune instead of letting it keep converging', async () => {
    const total = TAIL_CACHE + 520
    const store = makeStore({ byteBudget: 1, pruneEveryNWrites: 1, pruneIntervalMs: 0 })
    for (let i = 1; i <= total; i++) store.push('p1', makeEntry({ frame: i }))

    await vi.waitFor(() => {
      expect(store.statsFor('p1').ids[0]).toBe(PRUNE_BATCH_SIZE + 1)
    }, { timeout: 4000, interval: 10 })

    store.dispose()
    // `dispose()` closes the IDB connection, so further verification
    // reads in-memory state (which a surviving pass would still update
    // synchronously as part of its post-processing) rather than
    // querying IDB directly — a disposed instance's `queryFiltered`
    // would throw on the closed connection, which is expected, not a
    // gap in this check.
    const idsAtDispose = store.statsFor('p1').ids.slice()
    expect(idsAtDispose).toHaveLength(total - PRUNE_BATCH_SIZE)

    // Without dispose, the self-heal retry chain would keep firing
    // every `writeFlushMs + 20`ms and delete the remaining eligible
    // rows shortly after (verified separately to converge in under a
    // second at this store size). After dispose, none of that should
    // happen even after waiting well past that.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(store.statsFor('p1').ids).toEqual(idsAtDispose)
  })
})
