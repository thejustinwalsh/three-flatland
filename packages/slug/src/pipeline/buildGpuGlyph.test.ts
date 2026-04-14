import { describe, it, expect } from 'vitest'
import {
  buildGpuGlyphData,
  buildGpuGlyphFromCurves,
  buildAdvanceOnlyGlyph,
} from './buildGpuGlyph'
import type { QuadCurve } from '../types'

/**
 * buildGpuGlyph is the shared contour → GPU pipeline used by fontParser,
 * SlugShape.fromSvg (Phase 5 Task 21), and strokeOffsetter output
 * (Phase 5 Task 16). All three must produce glyph data identical in
 * shape, so these tests nail down the contract.
 */

// Unit square contour — matches the shape Phase 5's offsetter will
// produce for simple glyph outlines.
const unitSquare: QuadCurve[] = [
  { p0x: 0, p0y: 0, p1x: 0.5, p1y: 0, p2x: 1, p2y: 0 },
  { p0x: 1, p0y: 0, p1x: 1, p1y: 0.5, p2x: 1, p2y: 1 },
  { p0x: 1, p0y: 1, p1x: 0.5, p1y: 1, p2x: 0, p2y: 1 },
  { p0x: 0, p0y: 1, p1x: 0, p1y: 0.5, p2x: 0, p2y: 0 },
]

describe('buildGpuGlyphFromCurves', () => {
  it('computes tight bounds that include control points', () => {
    const g = buildGpuGlyphFromCurves(unitSquare, [0])
    expect(g.bounds).toEqual({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 })
  })

  it('includes p1 in bounds when curve bulges outward', () => {
    // Arc-like curve with control point above the chord
    const arc: QuadCurve[] = [{ p0x: 0, p0y: 0, p1x: 0.5, p1y: 2, p2x: 1, p2y: 0 }]
    const g = buildGpuGlyphFromCurves(arc, [0])
    expect(g.bounds.yMax).toBe(2) // loose bound, matches what the band math expects
  })

  it('preserves contourStarts array reference', () => {
    const starts = [0]
    const g = buildGpuGlyphFromCurves(unitSquare, starts)
    expect(g.contourStarts).toBe(starts)
  })

  it('builds bands from the curve set', () => {
    const g = buildGpuGlyphFromCurves(unitSquare, [0])
    expect(g.bands.hBands.length).toBeGreaterThan(0)
    expect(g.bands.vBands.length).toBeGreaterThan(0)
  })
})

describe('buildGpuGlyphData', () => {
  it('wraps curves + glyph metadata into a SlugGlyphData record', () => {
    const g = buildGpuGlyphData(42, unitSquare, [0], 0.5, 0.05)
    expect(g.glyphId).toBe(42)
    expect(g.advanceWidth).toBe(0.5)
    expect(g.lsb).toBe(0.05)
    expect(g.curves).toBe(unitSquare)
    expect(g.bounds).toEqual({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 })
    // texture-packer-filled fields default to (0, 0) so they're stable
    // for identity comparisons until packTextures runs.
    expect(g.bandLocation).toEqual({ x: 0, y: 0 })
    expect(g.curveLocation).toEqual({ x: 0, y: 0 })
  })
})

describe('buildAdvanceOnlyGlyph', () => {
  it('emits a zero-bounds record with the given advance width', () => {
    const g = buildAdvanceOnlyGlyph(3, 0.3, 0.02)
    expect(g.glyphId).toBe(3)
    expect(g.advanceWidth).toBe(0.3)
    expect(g.lsb).toBe(0.02)
    expect(g.curves).toEqual([])
    expect(g.contourStarts).toEqual([])
    expect(g.bands.hBands).toEqual([])
    expect(g.bands.vBands).toEqual([])
    expect(g.bounds).toEqual({ xMin: 0, yMin: 0, xMax: 0, yMax: 0 })
  })

  it('is distinguishable from an outline glyph with zero area', () => {
    // The shaper + measure paths use `bounds.xMax > bounds.xMin` as the
    // "has ink" predicate. Advance-only records answer false (correct —
    // space renders nothing), but outline records answer true even for
    // narrow glyphs.
    const advance = buildAdvanceOnlyGlyph(3, 0.3, 0.02)
    const hasInk = (g: { bounds: { xMin: number; xMax: number } }) =>
      g.bounds.xMax > g.bounds.xMin
    expect(hasInk(advance)).toBe(false)

    const outline = buildGpuGlyphData(4, unitSquare, [0], 1, 0)
    expect(hasInk(outline)).toBe(true)
  })
})
