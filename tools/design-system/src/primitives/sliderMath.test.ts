import { describe, expect, it } from 'vitest'
import { clamp, computeDragValue, ratioForValue, snapToStep, type SliderRange } from './sliderMath'

describe('clamp', () => {
  it('clamps to bounds and passes through in-range values', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(5, 0, 10)).toBe(5)
  })
})

describe('snapToStep', () => {
  const range: SliderRange = { min: 0, max: 100, step: 10 }

  it('snaps to the nearest step', () => {
    expect(snapToStep(24, range)).toBe(20)
    expect(snapToStep(26, range)).toBe(30)
  })

  it('clamps after snapping so an overshoot can not escape the range', () => {
    expect(snapToStep(97, range)).toBe(100)
    expect(snapToStep(-3, range)).toBe(0)
  })

  it('falls back to a plain clamp for a zero/negative step', () => {
    expect(snapToStep(42.7, { min: 0, max: 100, step: 0 })).toBe(42.7)
  })
})

describe('ratioForValue', () => {
  const range: SliderRange = { min: -10, max: 10, step: 1 }

  it('is 0 at min, 1 at max, 0.5 at the midpoint', () => {
    expect(ratioForValue(-10, range)).toBe(0)
    expect(ratioForValue(10, range)).toBe(1)
    expect(ratioForValue(0, range)).toBe(0.5)
  })

  it('clamps outside the range', () => {
    expect(ratioForValue(-99, range)).toBe(0)
    expect(ratioForValue(99, range)).toBe(1)
  })

  it('returns 0 for a degenerate zero-width range instead of NaN', () => {
    expect(ratioForValue(5, { min: 5, max: 5, step: 1 })).toBe(0)
  })
})

describe('computeDragValue — single move', () => {
  it('scales displacement linearly across the track width into the value range', () => {
    const range: SliderRange = { min: 0, max: 1000, step: 1 }
    // Half the track width moved → half the range added.
    expect(computeDragValue({ value: 0, clientX: 0 }, range, 500, 1000)).toBe(500)
  })

  it('clamps at the max/min bound when the drag overshoots', () => {
    const range: SliderRange = { min: 0, max: 100, step: 1 }
    expect(computeDragValue({ value: 0, clientX: 0 }, range, 10000, 1000)).toBe(100)
    expect(computeDragValue({ value: 0, clientX: 0 }, range, -10000, 1000)).toBe(0)
  })

  it('returns the (clamped) start value when the track has no measured width yet', () => {
    const range: SliderRange = { min: 0, max: 100, step: 1 }
    expect(computeDragValue({ value: 50, clientX: 0 }, range, 500, 0)).toBe(50)
  })
})

describe('computeDragValue — multi-move accumulation', () => {
  // Coarse step (50) against a fine pixel-to-value ratio (1000px track ==
  // 1000-unit range, so 1px == 1 unit before snapping) makes intermediate
  // moves land on values that round DOWN to the same snapped step as the
  // drag start — the only way to tell "recomputed from the original
  // pointerdown" apart from "chained off the previous move" is to look at
  // a move that only crosses the next step boundary once the FULL
  // displacement since pointerdown is considered.
  const range: SliderRange = { min: 0, max: 1000, step: 50 }
  const trackWidthPx = 1000
  const start = { value: 0, clientX: 0 }

  it('move 1 (17px) rounds down to the drag-start step', () => {
    expect(computeDragValue(start, range, 17, trackWidthPx)).toBe(0)
  })

  it('move 2 (40px, same drag session) crosses into the next step — reflecting TOTAL displacement since pointerdown, not just the delta since move 1', () => {
    const afterMove1 = computeDragValue(start, range, 17, trackWidthPx)
    const afterMove2 = computeDragValue(start, range, 40, trackWidthPx)
    expect(afterMove1).toBe(0)
    expect(afterMove2).toBe(50)
    expect(afterMove2).toBeGreaterThan(afterMove1)
  })

  it('regression guard: chaining `start` off the previous move (instead of keeping the original pointerdown snapshot) gives a WRONG, different answer for this exact sequence', () => {
    // This is the bug computeDragValue's contract exists to prevent: a
    // caller that re-bases `start` on the last rounded result before the
    // drag ends. Simulate that mistake explicitly and show it diverges
    // from the correct fixed-start computation.
    const afterMove1Rounded = computeDragValue(start, range, 17, trackWidthPx)
    const buggyChainedStart = { value: afterMove1Rounded, clientX: 17 }
    const buggyResult = computeDragValue(buggyChainedStart, range, 40, trackWidthPx)
    const correctResult = computeDragValue(start, range, 40, trackWidthPx)

    expect(buggyResult).toBe(0) // the bug's (wrong) answer for this drag
    expect(correctResult).toBe(50) // the actual answer — must differ
    expect(correctResult).not.toBe(buggyResult)
  })

  it('a third move further along keeps recomputing from the same fixed start', () => {
    expect(computeDragValue(start, range, 620, trackWidthPx)).toBe(600)
  })
})
