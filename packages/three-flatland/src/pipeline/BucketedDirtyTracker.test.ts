import { describe, it, expect, beforeEach } from 'vitest'
import { InstancedBufferAttribute } from 'three'
import { BucketedDirtyTracker } from './BucketedDirtyTracker'

function makeAttr(size: number, stride: number): InstancedBufferAttribute {
  return new InstancedBufferAttribute(new Float32Array(size * stride), stride)
}

describe('BucketedDirtyTracker', () => {
  describe('construction', () => {
    it('rejects non-power-of-2 bucket size', () => {
      const attr = makeAttr(64, 4)
      expect(() => new BucketedDirtyTracker(attr, 64, 100, 4, 30)).toThrow(/power of 2/)
    })

    it('rejects zero or negative bucket size', () => {
      const attr = makeAttr(64, 4)
      expect(() => new BucketedDirtyTracker(attr, 64, 0, 4, 30)).toThrow()
      expect(() => new BucketedDirtyTracker(attr, 64, -16, 4, 30)).toThrow()
    })

    it('accepts power-of-2 bucket sizes', () => {
      const attr = makeAttr(1024, 4)
      expect(() => new BucketedDirtyTracker(attr, 1024, 256, 4, 30)).not.toThrow()
      expect(() => new BucketedDirtyTracker(attr, 1024, 8, 4, 30)).not.toThrow()
    })
  })

  describe('markDirty + flush — empty', () => {
    it('flush is a no-op when nothing was marked', () => {
      const attr = makeAttr(1024, 4)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 30)
      const beforeVersion = attr.version
      tracker.flush()
      expect(attr.version).toBe(beforeVersion)
    })
  })

  describe('markDirty + flush — single bucket', () => {
    let attr: InstancedBufferAttribute
    let tracker: BucketedDirtyTracker

    beforeEach(() => {
      attr = makeAttr(1024, 4)
      tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 30)
    })

    it('emits a single range covering one slot', () => {
      const before = attr.version
      tracker.markDirty(5)
      tracker.flush()
      expect(attr.version).toBeGreaterThan(before)
      expect(attr.updateRanges).toEqual([{ start: 5 * 4, count: 1 * 4 }])
    })

    it('emits a single range spanning low..high within one bucket', () => {
      tracker.markDirty(10)
      tracker.markDirty(100)
      tracker.markDirty(50)
      tracker.flush()
      expect(attr.updateRanges).toEqual([{ start: 10 * 4, count: (100 - 10 + 1) * 4 }])
    })
  })

  describe('markDirty + flush — multiple buckets', () => {
    let attr: InstancedBufferAttribute
    let tracker: BucketedDirtyTracker

    beforeEach(() => {
      attr = makeAttr(1024, 4)
      // bucketSize 256, fullThreshold 30 — won't trip
      tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 30)
    })

    it('emits one range per dirty bucket', () => {
      tracker.markDirty(10) // bucket 0
      tracker.markDirty(300) // bucket 1
      tracker.markDirty(800) // bucket 3
      tracker.flush()
      expect(attr.updateRanges).toHaveLength(3)
      expect(attr.updateRanges[0]).toEqual({ start: 10 * 4, count: 1 * 4 })
      expect(attr.updateRanges[1]).toEqual({ start: 300 * 4, count: 1 * 4 })
      expect(attr.updateRanges[2]).toEqual({ start: 800 * 4, count: 1 * 4 })
    })

    it('preserves per-bucket low..high spans', () => {
      tracker.markDirty(10)
      tracker.markDirty(50) // same bucket 0
      tracker.markDirty(300)
      tracker.markDirty(400) // same bucket 1
      tracker.flush()
      expect(attr.updateRanges).toEqual([
        { start: 10 * 4, count: (50 - 10 + 1) * 4 },
        { start: 300 * 4, count: (400 - 300 + 1) * 4 },
      ])
    })
  })

  describe('full-upload threshold', () => {
    it('falls back to full upload when bucket count meets threshold', () => {
      const attr = makeAttr(1024, 4)
      // threshold 3 — three dirty buckets trips full upload
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 3)
      const before = attr.version
      tracker.markDirty(10)
      tracker.markDirty(300)
      tracker.markDirty(600)
      tracker.flush()
      expect(attr.version).toBeGreaterThan(before)
      expect(attr.updateRanges).toEqual([])
    })

    it('stays ranged when bucket count is below threshold', () => {
      const attr = makeAttr(1024, 4)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 3)
      tracker.markDirty(10)
      tracker.markDirty(300)
      tracker.flush()
      expect(attr.updateRanges).toHaveLength(2)
    })

    it('resets state after a full-upload flush', () => {
      const attr = makeAttr(1024, 4)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 2)
      tracker.markDirty(10)
      tracker.markDirty(300)
      tracker.flush()
      expect(tracker.isDirty).toBe(false)
      // Second flush should be a no-op — no version bump.
      const after = attr.version
      tracker.flush()
      expect(attr.version).toBe(after)
    })
  })

  describe('state reset between flushes', () => {
    it('clears bucket state so subsequent flushes start clean', () => {
      const attr = makeAttr(1024, 4)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 30)
      tracker.markDirty(10)
      tracker.markDirty(300)
      tracker.flush()
      attr.clearUpdateRanges()
      attr.needsUpdate = false

      tracker.markDirty(500)
      tracker.flush()
      expect(attr.updateRanges).toEqual([{ start: 500 * 4, count: 1 * 4 }])
    })

    it('isDirty reflects pending state', () => {
      const attr = makeAttr(1024, 4)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 30)
      expect(tracker.isDirty).toBe(false)
      tracker.markDirty(10)
      expect(tracker.isDirty).toBe(true)
      tracker.flush()
      expect(tracker.isDirty).toBe(false)
    })

    it('dirtyBucketCount tracks transitions clean→dirty exactly once per bucket', () => {
      const attr = makeAttr(1024, 4)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 4, 30)
      tracker.markDirty(10)
      expect(tracker.dirtyBucketCount).toBe(1)
      tracker.markDirty(50) // same bucket — no increment
      expect(tracker.dirtyBucketCount).toBe(1)
      tracker.markDirty(300) // different bucket
      expect(tracker.dirtyBucketCount).toBe(2)
    })
  })

  describe('non-power-of-2 maxSize', () => {
    it('handles maxSize not aligned to bucketSize', () => {
      const attr = makeAttr(1000, 4) // 1000 / 256 = ~3.9 → 4 buckets
      const tracker = new BucketedDirtyTracker(attr, 1000, 256, 4, 30)
      tracker.markDirty(999) // last slot, bucket 3
      tracker.flush()
      expect(attr.updateRanges).toEqual([{ start: 999 * 4, count: 1 * 4 }])
    })
  })

  describe('different stride values', () => {
    it('respects stride for matrix-sized attributes', () => {
      const attr = new InstancedBufferAttribute(new Float32Array(1024 * 16), 16)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 16, 30)
      tracker.markDirty(10)
      tracker.flush()
      expect(attr.updateRanges).toEqual([{ start: 10 * 16, count: 1 * 16 }])
    })

    it('respects stride for vec2 attributes', () => {
      const attr = new InstancedBufferAttribute(new Float32Array(1024 * 2), 2)
      const tracker = new BucketedDirtyTracker(attr, 1024, 256, 2, 30)
      tracker.markDirty(5)
      tracker.markDirty(7)
      tracker.flush()
      expect(attr.updateRanges).toEqual([{ start: 5 * 2, count: (7 - 5 + 1) * 2 }])
    })
  })
})
