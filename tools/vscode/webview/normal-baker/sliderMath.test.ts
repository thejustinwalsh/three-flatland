import { describe, expect, it } from 'vitest'
import { sliderValueFromDrag } from './sliderMath'

describe('sliderValueFromDrag', () => {
  it('recomputes from the drag anchor across a pointermove sequence — no per-step drift', () => {
    // 2px per unit, dragging from clientX=500 with an anchored start value of 10.
    const opts = { min: 0, max: 100, pxPerUnit: 2 }
    const dragStartValue = 10
    const dragStartX = 500

    // pointermove #1: +20px from the anchor → +10 units.
    const afterMove1 = sliderValueFromDrag(dragStartValue, dragStartX, 520, opts)
    expect(afterMove1).toBe(20)

    // pointermove #2: +60px from the anchor (not from move #1's position)
    // → +30 units. A buggy implementation that re-anchors to the previous
    // move instead of drag-start would double-count move #1's delta here.
    const afterMove2 = sliderValueFromDrag(dragStartValue, dragStartX, 560, opts)
    expect(afterMove2).toBe(40)

    // pointermove #3: backtracks past move #1's position — still resolves
    // correctly because every call recomputes from the fixed anchor.
    const afterMove3 = sliderValueFromDrag(dragStartValue, dragStartX, 510, opts)
    expect(afterMove3).toBe(15)
  })

  it('clamps the result to [min, max]', () => {
    const opts = { min: 0, max: 10, pxPerUnit: 1 }
    expect(sliderValueFromDrag(5, 0, 1000, opts)).toBe(10)
    expect(sliderValueFromDrag(5, 0, -1000, opts)).toBe(0)
  })

  it('is a no-op when the pointer has not moved from the anchor', () => {
    const opts = { min: 0, max: 10, pxPerUnit: 3 }
    expect(sliderValueFromDrag(4.5, 200, 200, opts)).toBe(4.5)
  })
})
