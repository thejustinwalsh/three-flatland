import { describe, expect, it } from 'vitest'
import { nearestRankPercentile, timingSummary } from './benchmark-statistics'

describe('benchmark statistics', () => {
  it('uses the nearest-rank p95 instead of the next array position', () => {
    const observations = Array.from({ length: 20 }, (_, index) => index + 1)

    expect(nearestRankPercentile(observations, 0.95)).toBe(19)
    expect(timingSummary(observations)).toEqual({ median: 10, p95: 19 })
  })

  it('rejects empty samples and invalid fractions', () => {
    expect(() => nearestRankPercentile([], 0.95)).toThrow(RangeError)
    expect(() => nearestRankPercentile([1], 0)).toThrow(RangeError)
    expect(() => nearestRankPercentile([1], 1.01)).toThrow(RangeError)
  })
})
