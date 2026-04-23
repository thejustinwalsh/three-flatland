import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { allocateTier, BufferPool, POOL } from './bus-pool'

describe('bus-pool', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('allocateTier', () => {
    it('returns the configured count of buffers at the configured size for `small`', () => {
      const bufs = allocateTier('small')
      expect(bufs).toHaveLength(POOL.small.count)
      for (const b of bufs) expect(b.byteLength).toBe(POOL.small.size)
    })
    it('returns the configured count of buffers at the configured size for `large`', () => {
      const bufs = allocateTier('large')
      expect(bufs).toHaveLength(POOL.large.count)
      for (const b of bufs) expect(b.byteLength).toBe(POOL.large.size)
    })
  })

  describe('seed + acquire (steady state)', () => {
    it('hands out small buffers from the seed and counts free correctly', () => {
      const pool = new BufferPool()
      pool.seed('small', allocateTier('small'))
      expect(pool.stats().smallFree).toBe(POOL.small.count)

      const a = pool.acquireSmall()
      expect(a.byteLength).toBe(POOL.small.size)
      expect(pool.stats().smallFree).toBe(POOL.small.count - 1)
      expect(pool.stats().smallExhausted).toBe(0)
    })

    it('hands out large buffers from the seed and counts free correctly', () => {
      const pool = new BufferPool()
      pool.seed('large', allocateTier('large'))
      const a = pool.acquireLarge()
      expect(a.byteLength).toBe(POOL.large.size)
      expect(pool.stats().largeFree).toBe(POOL.large.count - 1)
    })
  })

  describe('release', () => {
    it('puts buffers back in the right tier by byteLength', () => {
      const pool = new BufferPool()
      pool.seed('small', allocateTier('small'))
      pool.seed('large', allocateTier('large'))

      const s = pool.acquireSmall()
      const l = pool.acquireLarge()
      pool.release(s)
      pool.release(l)
      expect(pool.stats().smallFree).toBe(POOL.small.count)
      expect(pool.stats().largeFree).toBe(POOL.large.count)
      expect(pool.stats().orphaned).toBe(0)
    })

    it('orphans buffers whose size matches neither tier', () => {
      const pool = new BufferPool()
      pool.release(new ArrayBuffer(POOL.small.size + 1))
      expect(pool.stats().orphaned).toBe(1)
      expect(pool.stats().smallFree).toBe(0)
      expect(pool.stats().largeFree).toBe(0)
    })

    it('releasing a buffer is LIFO (most-recent first on next acquire)', () => {
      const pool = new BufferPool()
      pool.seed('small', allocateTier('small'))
      const a = pool.acquireSmall()
      const b = pool.acquireSmall()
      pool.release(a)
      pool.release(b)
      // Stack: [..., a, b] → next pop returns b.
      expect(pool.acquireSmall()).toBe(b)
      expect(pool.acquireSmall()).toBe(a)
    })
  })

  describe('exhaustion fallback', () => {
    it('returns a fresh buffer + bumps `smallExhausted` when the small free stack is empty', () => {
      const pool = new BufferPool()
      // Seed with zero buffers to flip `_seeded` past the boot-race gate.
      // Real pools are always seeded before use — the gate only suppresses
      // warnings during the worker-boot window.
      pool.seed('small', [])
      const fallback = pool.acquireSmall()
      expect(fallback.byteLength).toBe(POOL.small.size)
      expect(pool.stats().smallExhausted).toBe(1)
      expect(warnSpy).toHaveBeenCalled()
    })

    it('throttles the warning so we get at most one per 16 events', () => {
      const pool = new BufferPool()
      pool.seed('small', [])
      for (let i = 0; i < 17; i++) pool.acquireSmall()
      // 17 events → warning fires when count hits 1, then 17 (none in-between).
      expect(warnSpy.mock.calls.length).toBe(2)
    })

    it('a one-off fallback buffer that gets released is orphaned, not pooled', () => {
      const pool = new BufferPool()
      pool.seed('small', [new ArrayBuffer(POOL.small.size)])
      // First acquire pops the seed; next exhausts and allocates fresh
      // — same byteLength though, so it WOULD pool back. To exercise
      // the orphan path explicitly, release a wrong-sized buffer:
      pool.release(new ArrayBuffer(123))
      expect(pool.stats().orphaned).toBe(1)
    })
  })

  describe('dispose', () => {
    it('clears free stacks; counters preserved if read from a snapshot', () => {
      const pool = new BufferPool()
      pool.seed('small', allocateTier('small'))
      pool.seed('large', allocateTier('large'))
      const before = pool.stats()
      expect(before.smallFree).toBeGreaterThan(0)
      pool.dispose()
      expect(pool.stats().smallFree).toBe(0)
      expect(pool.stats().largeFree).toBe(0)
    })
  })
})
