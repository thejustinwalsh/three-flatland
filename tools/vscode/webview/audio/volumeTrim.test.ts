import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYBACK_TRIM_DB, PLAYBACK_TRIM_MAX_DB, PLAYBACK_TRIM_MIN_DB, trimToMultiplier } from './volumeTrim'

describe('trimToMultiplier', () => {
  it('maps the 0 dB default to EXACTLY multiplier 1 — the untouched baseline loudness', () => {
    expect(trimToMultiplier(0)).toBe(1)
    expect(trimToMultiplier(DEFAULT_PLAYBACK_TRIM_DB)).toBe(1)
  })

  it('maps dB to linear amplitude (10^(dB/20))', () => {
    expect(trimToMultiplier(6)).toBeCloseTo(1.9953, 4)
    expect(trimToMultiplier(-6)).toBeCloseTo(0.5012, 4)
    expect(trimToMultiplier(12)).toBeCloseTo(3.9811, 4)
    expect(trimToMultiplier(-12)).toBeCloseTo(0.2512, 4)
  })

  it('clamps out-of-range values to the ±12 dB bounds', () => {
    expect(trimToMultiplier(100)).toBe(trimToMultiplier(PLAYBACK_TRIM_MAX_DB))
    expect(trimToMultiplier(-100)).toBe(trimToMultiplier(PLAYBACK_TRIM_MIN_DB))
  })

  it('falls back to the baseline for non-numeric settings values instead of throwing or muting', () => {
    expect(trimToMultiplier(undefined)).toBe(1)
    expect(trimToMultiplier(null)).toBe(1)
    expect(trimToMultiplier('loud')).toBe(1)
    expect(trimToMultiplier(Number.NaN)).toBe(1)
    expect(trimToMultiplier(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is monotonic — more dB is never quieter', () => {
    let prev = 0
    for (let db = PLAYBACK_TRIM_MIN_DB; db <= PLAYBACK_TRIM_MAX_DB; db++) {
      const m = trimToMultiplier(db)
      expect(m).toBeGreaterThan(prev)
      prev = m
    }
  })
})
