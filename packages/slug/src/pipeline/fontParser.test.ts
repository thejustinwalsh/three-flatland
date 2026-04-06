import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseFont } from './fontParser'

const FONT_PATH = resolve(__dirname, '../../../../examples/vanilla/slug-text/public/Inter-Regular.ttf')

function loadTestFont() {
  const buf = readFileSync(FONT_PATH)
  return parseFont(buf.buffer as ArrayBuffer)
}

describe('fontParser', () => {
  it('parses Inter-Regular.ttf successfully', () => {
    const result = loadTestFont()
    expect(result.glyphs.size).toBeGreaterThan(100)
    expect(result.unitsPerEm).toBe(2048)
  })

  it('extracts correct font metrics', () => {
    const result = loadTestFont()
    expect(result.ascender).toBeGreaterThan(0)
    expect(result.ascender).toBeLessThan(1.5)
    expect(result.descender).toBeLessThan(0)
    expect(result.capHeight).toBeGreaterThan(0)
  })

  it('produces valid quadratic curves for glyph H', () => {
    const { glyphs } = loadTestFont()
    const h = glyphs.get(161) // H glyph
    expect(h).toBeDefined()
    expect(h!.curves.length).toBeGreaterThan(0)

    // All control points should be finite
    for (const c of h!.curves) {
      expect(isFinite(c.p0x)).toBe(true)
      expect(isFinite(c.p0y)).toBe(true)
      expect(isFinite(c.p1x)).toBe(true)
      expect(isFinite(c.p1y)).toBe(true)
      expect(isFinite(c.p2x)).toBe(true)
      expect(isFinite(c.p2y)).toBe(true)
    }
  })

  it('normalizes coordinates to em-space (0-1 range)', () => {
    const { glyphs } = loadTestFont()
    const h = glyphs.get(161)!

    // Bounds should be within reasonable em-space range
    expect(h.bounds.xMin).toBeGreaterThanOrEqual(-0.5)
    expect(h.bounds.xMax).toBeLessThanOrEqual(1.5)
    expect(h.bounds.yMin).toBeGreaterThanOrEqual(-0.5)
    expect(h.bounds.yMax).toBeLessThanOrEqual(1.5)
  })

  it('converts cubic curves to quadratics with correct control points', () => {
    const { glyphs } = loadTestFont()
    // Glyph 'e' has cubic curves in the original CFF data
    const e = glyphs.get(614)
    expect(e).toBeDefined()
    expect(e!.curves.length).toBeGreaterThan(10) // should have many curves

    // Each quadratic curve's control point should be between start and end
    // (roughly — the control point bows outward but shouldn't be wildly off)
    for (const c of e!.curves) {
      const minX = Math.min(c.p0x, c.p2x) - 0.5
      const maxX = Math.max(c.p0x, c.p2x) + 0.5
      const minY = Math.min(c.p0y, c.p2y) - 0.5
      const maxY = Math.max(c.p0y, c.p2y) + 0.5
      expect(c.p1x).toBeGreaterThan(minX)
      expect(c.p1x).toBeLessThan(maxX)
      expect(c.p1y).toBeGreaterThan(minY)
      expect(c.p1y).toBeLessThan(maxY)
    }
  })

  it('generates bands for each glyph', () => {
    const { glyphs } = loadTestFont()
    const h = glyphs.get(161)!

    expect(h.bands.hBands.length).toBe(8)
    expect(h.bands.vBands.length).toBe(8)

    // At least some bands should have curves
    const totalHCurves = h.bands.hBands.reduce((sum, b) => sum + b.curveIndices.length, 0)
    expect(totalHCurves).toBeGreaterThan(0)
  })

  it('sets advance width for each glyph', () => {
    const { glyphs } = loadTestFont()
    const h = glyphs.get(161)!
    expect(h.advanceWidth).toBeGreaterThan(0)
    expect(h.advanceWidth).toBeLessThan(2) // reasonable em-space range
  })

  it('handles all glyphs without errors', () => {
    const { glyphs } = loadTestFont()
    let badGlyphs = 0
    for (const g of glyphs.values()) {
      for (const c of g.curves) {
        if (!isFinite(c.p0x) || !isFinite(c.p1x) || !isFinite(c.p2x)) {
          badGlyphs++
          break
        }
      }
    }
    expect(badGlyphs).toBe(0)
  })
})
