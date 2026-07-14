import { describe, it, expect } from 'vitest'
import { buildGpuGlyphData, buildGpuGlyphFromCurves, buildAdvanceOnlyGlyph } from './buildGpuGlyph'
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

// Evaluate a quadratic Bezier axis value at parameter t.
function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
}

// Loose "control hull" bound — the old p1-inclusive box, kept here only
// as the upper reference the tight bound must never exceed.
function looseBounds(curves: QuadCurve[]) {
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity
  for (const c of curves) {
    xMin = Math.min(xMin, c.p0x, c.p1x, c.p2x)
    yMin = Math.min(yMin, c.p0y, c.p1y, c.p2y)
    xMax = Math.max(xMax, c.p0x, c.p1x, c.p2x)
    yMax = Math.max(yMax, c.p0y, c.p1y, c.p2y)
  }
  return { xMin, yMin, xMax, yMax }
}

describe('buildGpuGlyphFromCurves', () => {
  it('computes tight bounds that include control points', () => {
    const g = buildGpuGlyphFromCurves(unitSquare, [0])
    expect(g.bounds).toEqual({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 })
  })

  it('bounds the extremum, not the control point, when a curve bulges outward', () => {
    // Arc-like curve: p1y=2 sits above the chord, but B(t) peaks at the
    // derivative-zero point t*=(p0-p1)/(p0-2p1+p2)=0.5 → B(0.5)=1. The
    // curve never reaches p1, so the tight yMax is 1, not the loose 2.
    const arc: QuadCurve[] = [{ p0x: 0, p0y: 0, p1x: 0.5, p1y: 2, p2x: 1, p2y: 0 }]
    const g = buildGpuGlyphFromCurves(arc, [0])
    expect(g.bounds.yMax).toBeCloseTo(1, 10)
    expect(g.bounds.yMax).toBeLessThan(looseBounds(arc).yMax) // strictly shrinks the empty margin
  })

  it('tight bound CONTAINS the whole curve and is ≤ the p1 (loose) bound', () => {
    // A basketful of curves whose control points bulge every which way,
    // including asymmetric ones where t* ≠ 0.5, plus a monotone curve
    // whose extremum falls outside (0,1).
    const curves: QuadCurve[] = [
      { p0x: 0, p0y: 0, p1x: 0.5, p1y: 2, p2x: 1, p2y: 0 }, // symmetric bulge up
      { p0x: 0, p0y: 0, p1x: 3, p1y: -1, p2x: 1, p2y: 1 }, // asymmetric x + y bulge
      { p0x: -1, p0y: 0.2, p1x: -0.3, p1y: -0.4, p2x: 0.4, p2y: 0.9 }, // mixed
      { p0x: 0, p0y: 0, p1x: 0.9, p1y: 0.4, p2x: 1, p2y: 1 }, // monotone (t* ∉ (0,1))
    ]
    const g = buildGpuGlyphFromCurves(curves, [0])
    const b = g.bounds
    const loose = looseBounds(curves)

    // (a) Containment: sample every curve densely; no point may escape.
    for (const c of curves) {
      for (let i = 0; i <= 200; i++) {
        const t = i / 200
        const px = quadAt(c.p0x, c.p1x, c.p2x, t)
        const py = quadAt(c.p0y, c.p1y, c.p2y, t)
        expect(px).toBeGreaterThanOrEqual(b.xMin - 1e-9)
        expect(px).toBeLessThanOrEqual(b.xMax + 1e-9)
        expect(py).toBeGreaterThanOrEqual(b.yMin - 1e-9)
        expect(py).toBeLessThanOrEqual(b.yMax + 1e-9)
      }
    }

    // (b) Never looser than the old p1-inclusive bound (valid + tighter).
    expect(b.xMin).toBeGreaterThanOrEqual(loose.xMin - 1e-12)
    expect(b.yMin).toBeGreaterThanOrEqual(loose.yMin - 1e-12)
    expect(b.xMax).toBeLessThanOrEqual(loose.xMax + 1e-12)
    expect(b.yMax).toBeLessThanOrEqual(loose.yMax + 1e-12)

    // (c) And here it is STRICTLY tighter on at least one edge (real win).
    expect(b.yMax).toBeLessThan(loose.yMax)
  })

  it('leaves straight-line (chord-midpoint p1) curves exactly at their endpoints', () => {
    // Rect edges have p1 at the p0/p2 midpoint → denom 0 → no interior
    // extremum → bound is the endpoints, identical to the old behavior.
    const g = buildGpuGlyphFromCurves(unitSquare, [0])
    expect(g.bounds).toEqual({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 })
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
    const hasInk = (g: { bounds: { xMin: number; xMax: number } }) => g.bounds.xMax > g.bounds.xMin
    expect(hasInk(advance)).toBe(false)

    const outline = buildGpuGlyphData(4, unitSquare, [0], 1, 0)
    expect(hasInk(outline)).toBe(true)
  })
})
