import { describe, it, expect } from 'vitest'
import { createRng } from '../src/lib/rng'

describe('createRng', () => {
  it('returns a deterministic stream for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces values in [0, 1)', () => {
    const r = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('intRange(min, max) yields integers in [min, max]', () => {
    const r = createRng(7)
    for (let i = 0; i < 500; i++) {
      const v = r.intRange(3, 8)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(8)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('chance(p) returns true with probability ~p', () => {
    const r = createRng(123)
    let hits = 0
    for (let i = 0; i < 10_000; i++) if (r.chance(0.3)) hits++
    expect(hits).toBeGreaterThan(2500)
    expect(hits).toBeLessThan(3500)
  })

  it('fork produces a different stream', () => {
    const parent = createRng(42)
    const a = parent.fork(1)
    const b = parent.fork(2)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })
})
