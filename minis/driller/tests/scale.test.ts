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
  // Height-fit tolerance: 75% of the gameplay rect rows must fit the
  // viewport at the chosen scale. The rest crops above/below (bg
  // ambient layer fills that area). Numbers below assume
  // HEIGHT_FIT_RATIO = 0.75 in src/lib/scale.ts.
  it('picks 2× on 1080p — minor vertical overflow accepted', () => {
    // 2× width = 576 ≤ 1920. 2× height-fit threshold = 40*16*2*0.75 = 960 ≤ 1080.
    // 4× height-fit = 40*16*4*0.75 = 1920 > 1080.
    expect(pickScale(1920, 1080)).toBe(2)
  })

  it('picks 2× when viewport comfortably fits both dimensions', () => {
    expect(pickScale(1920, 1500)).toBe(2)
  })

  it('picks 4× for a 4K-tall viewport', () => {
    // 4× height-fit = 1920 ≤ 2700. 8× height-fit = 3840 > 2700.
    expect(pickScale(3840, 2700)).toBe(4)
  })

  it('picks 8× when both dimensions are very tall', () => {
    // 8× width = 2304 ≤ 3840. 8× height-fit = 40*16*8*0.75 = 3840 ≤ 5500.
    expect(pickScale(3840, 5500)).toBe(8)
  })

  it('falls back to 1× when no step fits both dimensions', () => {
    expect(pickScale(200, 200)).toBe(1)
  })

  it('picks 1× on a typical mobile portrait viewport', () => {
    // iPhone-ish 414×896: 1× width = 288 ≤ 414; height-fit = 480 ≤ 896.
    // 2× width = 576 > 414 — width caps at 1×.
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
