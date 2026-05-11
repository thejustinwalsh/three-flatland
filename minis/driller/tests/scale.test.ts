import { describe, it, expect } from 'vitest'
import { pickScale, computePlayCanvas } from '../src/lib/scale'
import { PLAY_COLS, PLAY_ROWS, TILE_PX } from '../src/constants'

/**
 * Fixed mobile-portrait layout (post composition refactor): the
 * gameplay rect is always PLAY_COLS × PLAY_ROWS cells (18 × 40 by
 * default, 9:20 ratio). pickScale picks the largest integer scale
 * step that fits both dimensions of the host viewport; computePlayCanvas
 * returns the gameplay-rect pixel dimensions at that scale.
 */

describe('pickScale (fixed PLAY_ROWS layout)', () => {
  it('picks 1× when 2× would exceed height on a 1080p viewport', () => {
    // PLAY_ROWS=40, TILE_PX=16. 2× height = 40*16*2 = 1280 > 1080.
    // 1× height = 640 ≤ 1080. 1× width = 288 ≤ 1920. Largest = 1.
    expect(pickScale(1920, 1080)).toBe(1)
  })

  it('picks 2× when viewport comfortably fits both dimensions', () => {
    // 1× width = 288, 2× = 576, 4× = 1152, 8× = 2304.
    // 1× height = 640, 2× = 1280, 4× = 2560, 8× = 5120.
    // At 1920 × 1500: 2× height (1280) fits, 4× (2560) doesn't.
    expect(pickScale(1920, 1500)).toBe(2)
  })

  it('picks 4× for a 4K-tall viewport', () => {
    // 4× height = 2560 ≤ 2700. 4× width = 1152 ≤ 3840.
    // 8× height = 5120 > 2700, so 4 is the cap.
    expect(pickScale(3840, 2700)).toBe(4)
  })

  it('picks 8× when both dimensions are very tall', () => {
    // 8× height = 5120, 8× width = 2304.
    expect(pickScale(3840, 5500)).toBe(8)
  })

  it('falls back to 1× when no step fits both dimensions', () => {
    // Very small mobile portrait — 1× is the floor.
    expect(pickScale(200, 200)).toBe(1)
  })

  it('picks 1× on a typical mobile portrait viewport', () => {
    // iPhone-ish 414×896: 1× width = 288 ≤ 414; 1× height = 640 ≤ 896.
    // 2× width = 576 > 414. So 1.
    expect(pickScale(414, 896)).toBe(1)
  })
})

describe('computePlayCanvas (fixed-rows layout)', () => {
  it('returns PLAY_ROWS regardless of viewport size — fixed mobile-portrait shape', () => {
    const small = computePlayCanvas(414, 896)
    const wide = computePlayCanvas(1920, 1500)
    const huge = computePlayCanvas(3840, 5500)
    expect(small.rows).toBe(PLAY_ROWS)
    expect(wide.rows).toBe(PLAY_ROWS)
    expect(huge.rows).toBe(PLAY_ROWS)
  })

  it('canvas dimensions match PLAY_COLS × PLAY_ROWS at the chosen scale', () => {
    const r = computePlayCanvas(1920, 1500)
    expect(r.canvasWidth).toBe(PLAY_COLS * TILE_PX * r.scale)
    expect(r.canvasHeight).toBe(PLAY_ROWS * TILE_PX * r.scale)
  })

  it('mobile portrait fits at 1×', () => {
    const r = computePlayCanvas(414, 896)
    expect(r.scale).toBe(1)
    expect(r.canvasWidth).toBe(PLAY_COLS * TILE_PX) // 288
    expect(r.canvasHeight).toBe(PLAY_ROWS * TILE_PX) // 640
  })
})
