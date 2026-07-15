import { describe, expect, it } from 'vitest'
import { screenScaleFor, viewBoxFor, visibleSizeFor, type Viewport } from './Viewport'

function vp(overrides: Partial<Viewport> = {}): Viewport {
  return { imageW: 100, imageH: 100, fitMargin: 1, zoom: 1, panX: 0, panY: 0, ...overrides }
}

describe('visibleSizeFor', () => {
  it('at zoom 1 with fitMargin 1, the visible size equals the image size', () => {
    expect(visibleSizeFor(vp())).toEqual({ w: 100, h: 100 })
  })

  it('scales inversely with zoom — 2x zoom halves the visible size', () => {
    expect(visibleSizeFor(vp({ zoom: 2 }))).toEqual({ w: 50, h: 50 })
  })

  it('fitMargin scales the visible size up (letterbox margin)', () => {
    const { w, h } = visibleSizeFor(vp({ fitMargin: 1.15 }))
    expect(w).toBeCloseTo(115)
    expect(h).toBeCloseTo(115)
  })

  it('handles non-square images independently per axis', () => {
    expect(visibleSizeFor(vp({ imageW: 200, imageH: 50 }))).toEqual({ w: 200, h: 50 })
  })
})

describe('viewBoxFor', () => {
  it('is unchanged by the visibleSizeFor extraction — centers on the image at zoom 1, no pan', () => {
    expect(viewBoxFor(vp())).toBe('0 0 100 100')
  })

  it('shrinks and re-centers under zoom', () => {
    // visible = 50x50, centered on (50,50) → top-left at (25,25)
    expect(viewBoxFor(vp({ zoom: 2 }))).toBe('25 25 50 50')
  })

  it('shifts by pan without changing size', () => {
    expect(viewBoxFor(vp({ panX: 10, panY: -5 }))).toBe('10 -5 100 100')
  })
})

describe('screenScaleFor', () => {
  it('returns 1 screen-px per image-px when the screen exactly matches the visible size', () => {
    expect(screenScaleFor(vp(), 100, 100)).toBe(1)
  })

  it('scales up when the screen is larger than the visible image area', () => {
    expect(screenScaleFor(vp(), 400, 400)).toBe(4)
  })

  it('picks the limiting (smaller-ratio) axis, mirroring preserveAspectRatio="xMidYMid meet"', () => {
    // visible 100x100, screen 400x200 — height is the tighter fit (200/100=2 < 400/100=4)
    expect(screenScaleFor(vp(), 400, 200)).toBe(2)
  })

  it('scales inversely with zoom for a fixed screen size', () => {
    expect(screenScaleFor(vp({ zoom: 2 }), 100, 100)).toBe(2)
    expect(screenScaleFor(vp({ zoom: 0.5 }), 100, 100)).toBe(0.5)
  })

  it('returns 0 (never divides by zero / negative) when the screen has no laid-out size yet', () => {
    expect(screenScaleFor(vp(), 0, 0)).toBe(0)
    expect(screenScaleFor(vp(), -1, 100)).toBe(0)
  })
})
