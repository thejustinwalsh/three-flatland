import { describe, it, expect, beforeEach } from 'vitest'
import { categoryToBucket, _resetCategoryBucketCache } from './categoryHash'

describe('categoryToBucket', () => {
  beforeEach(() => {
    _resetCategoryBucketCache()
  })

  it('returns 0 for undefined', () => {
    expect(categoryToBucket(undefined)).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(categoryToBucket(null)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(categoryToBucket('')).toBe(0)
  })

  it('returns a bucket in 0..3 for any non-empty string', () => {
    const samples = ['slime', 'water', 'fire', 'dust', 'aura', 'ember', 'sparkle', 'glow']
    for (const s of samples) {
      const b = categoryToBucket(s)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(3)
    }
  })

  it('is deterministic — same string always hashes to the same bucket', () => {
    expect(categoryToBucket('slime')).toBe(categoryToBucket('slime'))
    expect(categoryToBucket('water')).toBe(categoryToBucket('water'))
    expect(categoryToBucket('complex-name-123')).toBe(categoryToBucket('complex-name-123'))
  })

  it('returns an integer (no fractional bits leaking through)', () => {
    for (const s of ['a', 'hello', 'xyzzy']) {
      const b = categoryToBucket(s)
      expect(Number.isInteger(b)).toBe(true)
    }
  })

  it('reuses cached buckets across calls', () => {
    // First call computes djb2; later calls should return the same
    // bucket without recomputation. We can't observe the djb2 skip
    // directly, but we can confirm output stability.
    const first = categoryToBucket('stress-test-string')
    const second = categoryToBucket('stress-test-string')
    expect(first).toBe(second)
  })
})
