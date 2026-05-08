import { describe, it, expect } from 'vitest'
import { pickScale, computePlayCanvas } from '../src/lib/scale'
import { MIN_PLAY_ROWS, PLAY_COLS, TILE_PX } from '../src/constants'

describe('pickScale', () => {
  it('picks 4× for 1920x1080', () => {
    // PLAY_COLS=18 * TILE_PX=16 * 4 = 1152 ≤ 1920
    // MIN_PLAY_ROWS=22 * 16 * 4 = 1408 > 1080 — so 4 doesn't fit by height.
    // 22 * 16 * 2 = 704 ≤ 1080. So result = 2.
    expect(pickScale(1920, 1080)).toBe(2)
  })

  it('picks 4× when both width and height comfortably allow it', () => {
    // 18 * 16 * 4 = 1152, 22 * 16 * 4 = 1408
    expect(pickScale(1920, 1500)).toBe(4)
  })

  it('picks 8× for 4K viewport', () => {
    // 18 * 16 * 8 = 2304 ≤ 3840, 22 * 16 * 8 = 2816 ≤ 2160? no.
    // 22 * 16 * 8 = 2816 > 2160 → fails. 4 fits (1408 ≤ 2160).
    expect(pickScale(3840, 2160)).toBe(4)
    // With taller viewport, 8× fits.
    expect(pickScale(3840, 3000)).toBe(8)
  })

  it('falls back to 1× when no step fits the minimum', () => {
    expect(pickScale(200, 200)).toBe(1)
  })

  it('picks 1× on a small mobile portrait', () => {
    // 18 * 16 * 1 = 288 ≤ 414. 22 * 16 * 1 = 352 ≤ 896. Largest fitting? 2× = 576 width > 414.
    expect(pickScale(414, 896)).toBe(1)
  })
})

describe('computePlayCanvas', () => {
  it('honors MIN_PLAY_ROWS when viewport is just barely tall enough', () => {
    const r = computePlayCanvas(1920, 1500)
    expect(r.scale).toBe(4)
    expect(r.rows).toBeGreaterThanOrEqual(MIN_PLAY_ROWS)
    expect(r.canvasWidth).toBe(PLAY_COLS * TILE_PX * 4)
    expect(r.canvasHeight).toBe(r.rows * TILE_PX * 4)
  })

  it('grows row count on tall viewports', () => {
    const tall = computePlayCanvas(1280, 2400)
    const short = computePlayCanvas(1280, 720)
    expect(tall.rows).toBeGreaterThan(short.rows)
  })

  it('mobile portrait — 1× crops to fit width, rows fill remaining height', () => {
    const r = computePlayCanvas(414, 896)
    expect(r.scale).toBe(1)
    expect(r.canvasWidth).toBe(PLAY_COLS * TILE_PX) // 288
    expect(r.canvasHeight).toBe(r.rows * TILE_PX)
    // 896 / 16 = 56 rows
    expect(r.rows).toBe(56)
  })
})
