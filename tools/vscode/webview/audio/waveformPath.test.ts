import { describe, expect, it } from 'vitest'
import { bucketWaveform } from './waveformPath'

describe('bucketWaveform', () => {
  it('splits samples evenly into width buckets, keeping per-bucket min and max', () => {
    // 8 samples into 4 buckets — each bucket sees exactly one [lo, hi] pair.
    const samples = [0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7, -0.8]
    const { min, max, peak, gain } = bucketWaveform(samples, 4)
    expect(min).toHaveLength(4)
    expect(max).toHaveLength(4)
    expect(peak).toBeCloseTo(0.8)
    expect(gain).toBeCloseTo(1.25)
    // Normalized: raw pair [0.1, -0.2] × 1.25 → max 0.125, min -0.25, etc.
    expect(Array.from(max).map((v) => Number(v.toFixed(4)))).toEqual([0.125, 0.375, 0.625, 0.875])
    expect(Array.from(min).map((v) => Number(v.toFixed(4)))).toEqual([-0.25, -0.5, -0.75, -1])
  })

  it('normalizes so the loudest sample maps exactly to ±1', () => {
    const { min, max, peak, gain } = bucketWaveform([0.25, -0.5, 0.1], 3)
    expect(peak).toBeCloseTo(0.5)
    expect(gain).toBeCloseTo(2)
    expect(max[0]).toBeCloseTo(0.5)
    expect(min[1]).toBeCloseTo(-1)
    expect(max[2]).toBeCloseTo(0.2)
  })

  it('returns zeroed buckets with unit gain for an empty buffer', () => {
    const { min, max, peak, gain } = bucketWaveform(new Float32Array(0), 16)
    expect(min).toHaveLength(16)
    expect(max).toHaveLength(16)
    expect(Array.from(min)).toEqual(new Array(16).fill(0))
    expect(Array.from(max)).toEqual(new Array(16).fill(0))
    expect(peak).toBe(0)
    expect(gain).toBe(1)
  })

  it('returns zeroed buckets with unit gain for a silent (all-zero) buffer', () => {
    const { min, max, peak, gain } = bucketWaveform(new Float32Array(64), 8)
    expect(Array.from(max)).toEqual(new Array(8).fill(0))
    expect(Array.from(min)).toEqual(new Array(8).fill(0))
    expect(peak).toBe(0)
    expect(gain).toBe(1)
  })

  it('keeps the trace continuous for a buffer shorter than the width — empty buckets read the nearest sample', () => {
    // 2 samples into 6 buckets: buckets 0..2 map to sample 0, 3..5 to sample 1.
    const { min, max, peak } = bucketWaveform([0.5, -0.5], 6)
    expect(peak).toBeCloseTo(0.5)
    expect(Array.from(max)).toEqual([1, 1, 1, -1, -1, -1])
    expect(Array.from(min)).toEqual([1, 1, 1, -1, -1, -1])
    // No NaN/Infinity leakage from empty-bucket edge math.
    for (const v of [...min, ...max]) expect(Number.isFinite(v)).toBe(true)
  })

  it('handles width 0 and negative/fractional widths without throwing', () => {
    expect(bucketWaveform([1, 2, 3], 0).min).toHaveLength(0)
    expect(bucketWaveform([1, 2, 3], -4).max).toHaveLength(0)
    expect(bucketWaveform([1, 2, 3], 2.9).min).toHaveLength(2)
  })

  it('covers every sample exactly once when the buffer is longer than the width', () => {
    // A single spike must land in exactly one bucket's max no matter where
    // it sits — the bucket boundaries partition the buffer.
    for (const spikeAt of [0, 499, 999]) {
      const samples = new Float32Array(1000)
      samples[spikeAt] = 1
      const { max } = bucketWaveform(samples, 7)
      const hot = Array.from(max).filter((v) => v === 1)
      expect(hot).toHaveLength(1)
    }
  })
})
