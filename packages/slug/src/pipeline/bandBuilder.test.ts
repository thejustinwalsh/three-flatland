import { describe, it, expect } from 'vitest'
import { buildBands } from './bandBuilder'
import type { QuadCurve, GlyphBounds } from '../types'

function makeCurve(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
): QuadCurve {
  return { p0x, p0y, p1x, p1y, p2x, p2y }
}

describe('bandBuilder', () => {
  const bounds: GlyphBounds = { xMin: 0, yMin: 0, xMax: 1, yMax: 1 }

  it('creates requested number of bands', () => {
    const curves = [makeCurve(0, 0, 0.5, 0.5, 1, 1)]
    const bands = buildBands(curves, bounds, 4)
    expect(bands.hBands.length).toBe(4)
    expect(bands.vBands.length).toBe(4)
  })

  it('assigns curves to overlapping bands', () => {
    // Curve spanning the full vertical range
    const curves = [makeCurve(0.5, 0, 0.5, 0.5, 0.5, 1)]
    const bands = buildBands(curves, bounds, 4)

    // Curve should be in all 4 horizontal bands (spans full Y range)
    for (const band of bands.hBands) {
      expect(band.curveIndices).toContain(0)
    }
  })

  it('sorts curves by descending max coordinate', () => {
    // Three curves with different max-X values
    const curves = [
      makeCurve(0.1, 0, 0.15, 0.5, 0.2, 1), // max x = 0.2
      makeCurve(0.8, 0, 0.85, 0.5, 0.9, 1), // max x = 0.9
      makeCurve(0.4, 0, 0.45, 0.5, 0.5, 1), // max x = 0.5
    ]
    const bands = buildBands(curves, bounds, 1) // single band captures all

    // h-bands sort by descending max-X
    const hIndices = bands.hBands[0]!.curveIndices
    expect(hIndices.length).toBe(3)

    // First curve in sorted order should have highest max-X (index 1: max 0.9)
    const maxXs = hIndices.map(i => {
      const c = curves[i]!
      return Math.max(c.p0x, c.p1x, c.p2x)
    })
    for (let i = 0; i < maxXs.length - 1; i++) {
      expect(maxXs[i]).toBeGreaterThanOrEqual(maxXs[i + 1]!)
    }
  })

  it('skips purely horizontal curves from h-bands', () => {
    const curves = [
      makeCurve(0, 0.5, 0.5, 0.5, 1, 0.5), // purely horizontal (all y = 0.5)
      makeCurve(0, 0, 0.5, 0.5, 1, 1),       // diagonal
    ]
    const bands = buildBands(curves, bounds, 2)

    // The horizontal curve (index 0) should NOT be in any h-band
    for (const band of bands.hBands) {
      expect(band.curveIndices).not.toContain(0)
    }
    // But the diagonal curve should be present
    const hasIndex1 = bands.hBands.some(b => b.curveIndices.includes(1))
    expect(hasIndex1).toBe(true)
  })

  it('skips purely vertical curves from v-bands', () => {
    const curves = [
      makeCurve(0.5, 0, 0.5, 0.5, 0.5, 1), // purely vertical (all x = 0.5)
      makeCurve(0, 0, 0.5, 0.5, 1, 1),       // diagonal
    ]
    const bands = buildBands(curves, bounds, 2)

    for (const band of bands.vBands) {
      expect(band.curveIndices).not.toContain(0)
    }
  })

  it('handles empty curve list', () => {
    const bands = buildBands([], bounds, 4)
    expect(bands.hBands.length).toBe(4)
    for (const band of bands.hBands) {
      expect(band.curveIndices.length).toBe(0)
    }
  })

  it('handles zero-size bounds gracefully', () => {
    const zeroBounds: GlyphBounds = { xMin: 0.5, yMin: 0.5, xMax: 0.5, yMax: 0.5 }
    const curves = [makeCurve(0.5, 0.5, 0.5, 0.5, 0.5, 0.5)]
    const bands = buildBands(curves, zeroBounds, 4)
    expect(bands.hBands.length).toBe(4)
  })
})
