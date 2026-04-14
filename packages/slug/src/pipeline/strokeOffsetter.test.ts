import { describe, it, expect } from 'vitest'
import {
  bakeStrokeForGlyph,
  insertCap,
  insertJoin,
  offsetQuadraticBezier,
  reverseContour,
  strokeOffsetter,
  subdivideForOffset,
  unitTangentAt,
  type CapContext,
  type JoinContext,
} from './strokeOffsetter'
import { buildGpuGlyphData, buildAdvanceOnlyGlyph } from './buildGpuGlyph'
import type { QuadCurve } from '../types'

describe('subdivideForOffset — straight segments', () => {
  it('returns a straight (degenerate) quad unchanged — single element', () => {
    // p1 on the chord midpoint = perfectly flat
    const line: QuadCurve = {
      p0x: 0, p0y: 0,
      p1x: 5, p1y: 0,
      p2x: 10, p2y: 0,
    }
    const out = subdivideForOffset(line, 0.05)
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(line)
  })

  it('preserves endpoints across a split', () => {
    // Curve with extreme turn — force subdivision
    const curve: QuadCurve = {
      p0x: 0, p0y: 0,
      p1x: 1, p1y: 2,
      p2x: 2, p2y: 0,
    }
    const out = subdivideForOffset(curve, 0.05, { epsilon: 0.001 })
    expect(out.length).toBeGreaterThan(1)
    // First segment starts at original p0
    expect(out[0]!.p0x).toBeCloseTo(curve.p0x, 10)
    expect(out[0]!.p0y).toBeCloseTo(curve.p0y, 10)
    // Last segment ends at original p2
    const last = out[out.length - 1]!
    expect(last.p2x).toBeCloseTo(curve.p2x, 10)
    expect(last.p2y).toBeCloseTo(curve.p2y, 10)
    // Adjacent segments meet at the same point (endpoint sharing)
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i]!.p2x).toBeCloseTo(out[i + 1]!.p0x, 10)
      expect(out[i]!.p2y).toBeCloseTo(out[i + 1]!.p0y, 10)
    }
  })
})

describe('subdivideForOffset — subdivision behavior', () => {
  it('subdivides a quarter-arc-ish curve into a few segments at tight tolerance', () => {
    // Approximation of a quarter arc
    const arc: QuadCurve = {
      p0x: 1, p0y: 0,
      p1x: 1, p1y: 1,
      p2x: 0, p2y: 1,
    }
    const looseOut = subdivideForOffset(arc, 0.05, { epsilon: 0.005 })
    const tightOut = subdivideForOffset(arc, 0.05, { epsilon: 0.0001 })
    // Tighter epsilon → more splits
    expect(tightOut.length).toBeGreaterThan(looseOut.length)
  })

  it('honors maxDepth — never exceeds 2^maxDepth leaves', () => {
    const wildCurve: QuadCurve = {
      p0x: 0, p0y: 0,
      p1x: 5, p1y: 20,
      p2x: 10, p2y: 0,
    }
    const out = subdivideForOffset(wildCurve, 0.1, {
      epsilon: 1e-9,
      maxDepth: 3,
    })
    // 2^3 = 8 max leaves from full subdivision
    expect(out.length).toBeLessThanOrEqual(8)
  })

  it('larger halfWidth relative to curvature → more subdivision', () => {
    // Same curve, bigger offset → offset curve deviates more from a
    // single quadratic approx → more splits needed to stay within ε.
    const curve: QuadCurve = {
      p0x: 0, p0y: 0,
      p1x: 5, p1y: 5,
      p2x: 10, p2y: 0,
    }
    const thin = subdivideForOffset(curve, 0.01)
    const thick = subdivideForOffset(curve, 0.5)
    expect(thick.length).toBeGreaterThanOrEqual(thin.length)
  })
})

describe('subdivideForOffset — numerical stability', () => {
  it('handles degenerate point (p0 = p2) without splitting', () => {
    const dot: QuadCurve = {
      p0x: 0, p0y: 0,
      p1x: 0.01, p1y: 0.01,
      p2x: 0, p2y: 0,
    }
    const out = subdivideForOffset(dot, 0.05)
    // Degenerate curves aren't recoverable via offsetting; return
    // as-is and let downstream layers decide (skip / error).
    expect(out).toHaveLength(1)
  })

  it('zero halfWidth is clamped so epsilon stays positive', () => {
    const curve: QuadCurve = {
      p0x: 0, p0y: 0,
      p1x: 1, p1y: 1,
      p2x: 2, p2y: 0,
    }
    const out = subdivideForOffset(curve, 0)
    // Not expected to throw / infinite-loop; returns at least one
    // output segment.
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect(out.length).toBeLessThanOrEqual(256) // 2^8 max depth
  })
})

describe('unitTangentAt', () => {
  it('returns unit-length tangent at t=0 pointing p0→p1', () => {
    const c: QuadCurve = { p0x: 0, p0y: 0, p1x: 3, p1y: 4, p2x: 6, p2y: 0 }
    const t = unitTangentAt(c, 0)
    expect(Math.hypot(t[0], t[1])).toBeCloseTo(1, 10)
    // Tangent at t=0 is parallel to (p1 - p0) = (3, 4) → (0.6, 0.8)
    expect(t[0]).toBeCloseTo(0.6, 5)
    expect(t[1]).toBeCloseTo(0.8, 5)
  })

  it('returns unit-length tangent at t=1 pointing p1→p2', () => {
    const c: QuadCurve = { p0x: 0, p0y: 0, p1x: 3, p1y: 4, p2x: 6, p2y: 0 }
    const t = unitTangentAt(c, 1)
    expect(Math.hypot(t[0], t[1])).toBeCloseTo(1, 10)
    // Tangent at t=1 parallel to (p2 - p1) = (3, -4) → (0.6, -0.8)
    expect(t[0]).toBeCloseTo(0.6, 5)
    expect(t[1]).toBeCloseTo(-0.8, 5)
  })

  it('falls back to chord direction when control points collapse', () => {
    // All three points coincident — truly degenerate. Tangent is ill-
    // defined; we return an arbitrary unit vector without throwing.
    const c: QuadCurve = { p0x: 0, p0y: 0, p1x: 0, p1y: 0, p2x: 0, p2y: 0 }
    const t = unitTangentAt(c, 0.5)
    expect(Math.hypot(t[0], t[1])).toBeCloseTo(1, 10)
  })

  it('uses the chord direction when B′ vanishes but chord is non-zero', () => {
    // Symmetric quad where p1 is exactly the midpoint → straight line
    // (but B′ at t=0.5 has full magnitude; not degenerate there).
    // At t=0, B'(0) = 2(p1-p0), which is non-zero here — use a case
    // with cuspy geometry.
    const c: QuadCurve = { p0x: 0, p0y: 0, p1x: 0, p1y: 0, p2x: 5, p2y: 0 }
    const t = unitTangentAt(c, 0)
    // B'(0) = 2(p1-p0) = 0, falls back to chord direction (1, 0)
    expect(t[0]).toBeCloseTo(1, 5)
    expect(t[1]).toBeCloseTo(0, 5)
  })
})

describe('offsetQuadraticBezier — straight segments', () => {
  it('offsets a horizontal line downward by +halfWidth (right-hand normal)', () => {
    // Line from (0,0) to (10,0) along +x axis. Right-hand normal = (0,-1).
    // For font CCW contours, right-hand is the OUTSIDE of the fill.
    const line: QuadCurve = { p0x: 0, p0y: 0, p1x: 5, p1y: 0, p2x: 10, p2y: 0 }
    const out = offsetQuadraticBezier(line, 0.5)
    expect(out.p0x).toBeCloseTo(0, 10)
    expect(out.p0y).toBeCloseTo(-0.5, 10)
    expect(out.p2x).toBeCloseTo(10, 10)
    expect(out.p2y).toBeCloseTo(-0.5, 10)
    expect(out.p1x).toBeCloseTo(5, 10)
    expect(out.p1y).toBeCloseTo(-0.5, 10)
  })

  it('offsets a horizontal line upward with a negative halfWidth', () => {
    const line: QuadCurve = { p0x: 0, p0y: 0, p1x: 5, p1y: 0, p2x: 10, p2y: 0 }
    const out = offsetQuadraticBezier(line, -0.3)
    expect(out.p0y).toBeCloseTo(0.3, 10)
    expect(out.p2y).toBeCloseTo(0.3, 10)
  })

  it('offsets a vertical line to the right (right-hand normal convention)', () => {
    // (0,0) → (0,10) along +y axis. Right-hand normal = (1, 0).
    const line: QuadCurve = { p0x: 0, p0y: 0, p1x: 0, p1y: 5, p2x: 0, p2y: 10 }
    const out = offsetQuadraticBezier(line, 0.5)
    expect(out.p0x).toBeCloseTo(0.5, 10)
    expect(out.p0y).toBeCloseTo(0, 10)
    expect(out.p2x).toBeCloseTo(0.5, 10)
    expect(out.p2y).toBeCloseTo(10, 10)
  })
})

describe('offsetQuadraticBezier — curved segments', () => {
  it('offset endpoints sit on their respective normals at distance halfWidth', () => {
    // Curve bending upward
    const c: QuadCurve = { p0x: 0, p0y: 0, p1x: 1, p1y: 2, p2x: 2, p2y: 0 }
    const halfWidth = 0.3
    const out = offsetQuadraticBezier(c, halfWidth)

    // Distance from p0 to p0' should equal halfWidth
    const d0 = Math.hypot(out.p0x - c.p0x, out.p0y - c.p0y)
    expect(d0).toBeCloseTo(halfWidth, 8)

    // Distance from p2 to p2' should equal halfWidth
    const d2 = Math.hypot(out.p2x - c.p2x, out.p2y - c.p2y)
    expect(d2).toBeCloseTo(halfWidth, 8)

    // (p0' - p0) must be perpendicular to the tangent at p0
    const [t0x, t0y] = unitTangentAt(c, 0)
    const dot0 = (out.p0x - c.p0x) * t0x + (out.p0y - c.p0y) * t0y
    expect(Math.abs(dot0)).toBeLessThan(1e-8)
  })

  it('inner + outer offsets of a symmetric curve are mirror images of the source', () => {
    // Symmetric quad peaking at y=1. Tangent at p0 = (+, +), tangent at
    // p2 = (+, -). With right-hand normal convention, +halfWidth pushes
    // the curve toward -y (below the peak), -halfWidth toward +y.
    const c: QuadCurve = { p0x: -1, p0y: 0, p1x: 0, p1y: 1, p2x: 1, p2y: 0 }
    const plus = offsetQuadraticBezier(c, 0.2)
    const minus = offsetQuadraticBezier(c, -0.2)
    expect(plus.p1y).toBeLessThan(c.p1y)
    expect(minus.p1y).toBeGreaterThan(c.p1y)
  })

  it('zero offset returns the input control points', () => {
    const c: QuadCurve = { p0x: 1, p0y: 2, p1x: 3, p1y: 4, p2x: 5, p2y: 2 }
    const out = offsetQuadraticBezier(c, 0)
    expect(out.p0x).toBeCloseTo(c.p0x, 10)
    expect(out.p0y).toBeCloseTo(c.p0y, 10)
    expect(out.p2x).toBeCloseTo(c.p2x, 10)
    expect(out.p2y).toBeCloseTo(c.p2y, 10)
    expect(out.p1x).toBeCloseTo(c.p1x, 10)
    expect(out.p1y).toBeCloseTo(c.p1y, 10)
  })

  it('round-trip: offset +halfWidth then -halfWidth returns to source within a tight bound', () => {
    // On a single subdivided segment, offset round-trip should be
    // near-exact for endpoints (tangents are re-derived from the
    // offset curve, so p1 can drift slightly).
    const c: QuadCurve = { p0x: 0, p0y: 0, p1x: 0.3, p1y: 0.5, p2x: 1, p2y: 0 }
    const halfWidth = 0.05
    const out = offsetQuadraticBezier(c, halfWidth)
    const back = offsetQuadraticBezier(out, -halfWidth)
    expect(back.p0x).toBeCloseTo(c.p0x, 8)
    expect(back.p0y).toBeCloseTo(c.p0y, 8)
    expect(back.p2x).toBeCloseTo(c.p2x, 8)
    expect(back.p2y).toBeCloseTo(c.p2y, 8)
  })
})

describe('insertJoin', () => {
  // Reusable 90° left-turn corner context:
  //  - curve A ends travelling +x at corner (0,0)
  //  - curve B begins travelling +y from corner (0,0)
  //  - offset halfWidth = 1 (positive → left-hand side of travel)
  // Left-hand normal of +x is +y; of +y is -x.
  // So endA = (0, 1) and startB = (-1, 0).
  const corner90: JoinContext = {
    cornerX: 0, cornerY: 0,
    tangentA: [1, 0],
    tangentB: [0, 1],
    endA: { x: 0, y: 1 },
    startB: { x: -1, y: 0 },
    halfWidth: 1,
    joinStyle: 'bevel',
    miterLimit: 4,
  }

  it('smooth join (coincident endpoints) emits nothing', () => {
    const smooth: JoinContext = {
      ...corner90,
      tangentA: [1, 0], tangentB: [1, 0],
      endA: { x: 0, y: 1 }, startB: { x: 0, y: 1 },
    }
    expect(insertJoin(smooth)).toEqual([])
  })

  it('bevel emits one straight quadratic from endA to startB', () => {
    const quads = insertJoin({ ...corner90, joinStyle: 'bevel' })
    expect(quads).toHaveLength(1)
    expect(quads[0]!.p0x).toBeCloseTo(0, 10)
    expect(quads[0]!.p0y).toBeCloseTo(1, 10)
    expect(quads[0]!.p2x).toBeCloseTo(-1, 10)
    expect(quads[0]!.p2y).toBeCloseTo(0, 10)
    // Straight quad has p1 at the chord midpoint.
    expect(quads[0]!.p1x).toBeCloseTo(-0.5, 10)
    expect(quads[0]!.p1y).toBeCloseTo(0.5, 10)
  })

  it('miter at 90° with miterLimit=4 emits two straight quads via the miter point', () => {
    const quads = insertJoin({ ...corner90, joinStyle: 'miter', miterLimit: 4 })
    // 90° turn: miter length = halfWidth / sin(45°) = √2 ≈ 1.414.
    // 1.414 < 4·1 = 4 → miter applies, 2 quads emitted.
    expect(quads).toHaveLength(2)
    // Miter point is where the offset tangent lines meet — should be
    // at (-1, 1) for our corner geometry.
    expect(quads[0]!.p2x).toBeCloseTo(-1, 8)
    expect(quads[0]!.p2y).toBeCloseTo(1, 8)
    expect(quads[1]!.p0x).toBeCloseTo(-1, 8)
    expect(quads[1]!.p0y).toBeCloseTo(1, 8)
    // Join endpoints match input.
    expect(quads[0]!.p0x).toBeCloseTo(0, 8)
    expect(quads[0]!.p0y).toBeCloseTo(1, 8)
    expect(quads[1]!.p2x).toBeCloseTo(-1, 8)
    expect(quads[1]!.p2y).toBeCloseTo(0, 8)
  })

  it('miter falls back to bevel when miter length exceeds miterLimit × halfWidth', () => {
    // Very acute angle — 10° turn. Miter length blows up.
    const acute: JoinContext = {
      cornerX: 0, cornerY: 0,
      tangentA: [1, 0],
      tangentB: [Math.cos(Math.PI - 10 * Math.PI / 180), Math.sin(Math.PI - 10 * Math.PI / 180)],
      endA: { x: 0, y: 1 },
      startB: { x: 0, y: 0 }, // placeholder; miter calc doesn't use this directly
      halfWidth: 1,
      joinStyle: 'miter',
      miterLimit: 2,
    }
    const quads = insertJoin(acute)
    // Fall-back bevel = single straight quad.
    expect(quads).toHaveLength(1)
  })

  it('round at 90° emits two quadratics approximating the arc', () => {
    // Delta angle from (0,1) to (-1,0) around the corner origin: π/2
    // (CCW). At a 60° max step, that's 2 segments.
    const quads = insertJoin({ ...corner90, joinStyle: 'round' })
    expect(quads).toHaveLength(2)
    // First and last endpoints match the offset endpoints.
    expect(quads[0]!.p0x).toBeCloseTo(0, 8)
    expect(quads[0]!.p0y).toBeCloseTo(1, 8)
    expect(quads[quads.length - 1]!.p2x).toBeCloseTo(-1, 8)
    expect(quads[quads.length - 1]!.p2y).toBeCloseTo(0, 8)
    // All sampled midpoints lie approximately on the arc of radius 1
    // centered at the corner.
    for (const q of quads) {
      const mx = 0.25 * q.p0x + 0.5 * q.p1x + 0.25 * q.p2x
      const my = 0.25 * q.p0y + 0.5 * q.p1y + 0.25 * q.p2y
      const r = Math.hypot(mx, my)
      expect(r).toBeGreaterThan(0.98)
      expect(r).toBeLessThan(1.02)
    }
  })

  it('round at 180° emits three quadratics (60°-per-step budget)', () => {
    // A U-turn: endA at +x axis, startB at -x axis, corner at origin,
    // tangentA = +y, tangentB = -y.
    const uturn: JoinContext = {
      cornerX: 0, cornerY: 0,
      tangentA: [0, 1],
      tangentB: [0, -1],
      endA: { x: 1, y: 0 },
      startB: { x: -1, y: 0 },
      halfWidth: 1,
      joinStyle: 'round',
      miterLimit: 4,
    }
    const quads = insertJoin(uturn)
    // π of arc / (π/3) max step = 3 segments.
    expect(quads).toHaveLength(3)
  })
})

describe('insertCap', () => {
  // Reusable end-cap context: straight horizontal stroke of half-width 1
  // terminating at origin, traveling +x.
  //   outerEnd = (0, 1)   — left-hand offset
  //   innerEnd = (0, -1)  — right-hand offset
  //   tangent  = (1, 0)   — out of the contour
  const endCap: CapContext = {
    endpointX: 0, endpointY: 0,
    tangent: [1, 0],
    outerEnd: { x: 0, y: 1 },
    innerEnd: { x: 0, y: -1 },
    halfWidth: 1,
    capStyle: 'flat',
  }

  it('flat cap: 1 straight quad outer→inner, no extension past endpoint', () => {
    const quads = insertCap({ ...endCap, capStyle: 'flat' })
    expect(quads).toHaveLength(1)
    expect(quads[0]!.p0x).toBeCloseTo(0, 10)
    expect(quads[0]!.p0y).toBeCloseTo(1, 10)
    expect(quads[0]!.p2x).toBeCloseTo(0, 10)
    expect(quads[0]!.p2y).toBeCloseTo(-1, 10)
    // Midpoint is on the chord — no extension
    expect(quads[0]!.p1x).toBeCloseTo(0, 10)
    expect(quads[0]!.p1y).toBeCloseTo(0, 10)
  })

  it('square cap: 3 straight quads, outer rectangle half-width past endpoint', () => {
    const quads = insertCap({ ...endCap, capStyle: 'square' })
    expect(quads).toHaveLength(3)
    // Outer edge extends along tangent from (0,1) to (1,1)
    expect(quads[0]!.p0x).toBeCloseTo(0, 10); expect(quads[0]!.p0y).toBeCloseTo(1, 10)
    expect(quads[0]!.p2x).toBeCloseTo(1, 10); expect(quads[0]!.p2y).toBeCloseTo(1, 10)
    // Across: (1,1) → (1,-1)
    expect(quads[1]!.p2x).toBeCloseTo(1, 10); expect(quads[1]!.p2y).toBeCloseTo(-1, 10)
    // Back to inner: (1,-1) → (0,-1)
    expect(quads[2]!.p2x).toBeCloseTo(0, 10); expect(quads[2]!.p2y).toBeCloseTo(-1, 10)
  })

  it('triangle cap: 2 straight quads meeting at apex half-width past endpoint', () => {
    const quads = insertCap({ ...endCap, capStyle: 'triangle' })
    expect(quads).toHaveLength(2)
    // Apex at (1, 0) — endpoint + tangent·halfWidth.
    expect(quads[0]!.p2x).toBeCloseTo(1, 10); expect(quads[0]!.p2y).toBeCloseTo(0, 10)
    expect(quads[1]!.p0x).toBeCloseTo(1, 10); expect(quads[1]!.p0y).toBeCloseTo(0, 10)
    // Endpoints match outer/inner.
    expect(quads[0]!.p0y).toBeCloseTo(1, 10)
    expect(quads[1]!.p2y).toBeCloseTo(-1, 10)
  })

  it('round cap: emits semicircle approximated by ≤60°-per-segment quads', () => {
    const quads = insertCap({ ...endCap, capStyle: 'round' })
    // 180° arc / 60° max = 3 segments.
    expect(quads).toHaveLength(3)
    // Start/end match outer/inner.
    expect(quads[0]!.p0x).toBeCloseTo(0, 8)
    expect(quads[0]!.p0y).toBeCloseTo(1, 8)
    expect(quads[quads.length - 1]!.p2x).toBeCloseTo(0, 8)
    expect(quads[quads.length - 1]!.p2y).toBeCloseTo(-1, 8)
    // Arc bulges outward (positive x direction — matches tangent).
    // Every segment's p1 has x > 0.
    for (const q of quads) {
      expect(q.p1x).toBeGreaterThan(0)
    }
  })
})

describe('reverseContour', () => {
  it('swaps traversal direction: last p2 becomes first p0', () => {
    const curves: QuadCurve[] = [
      { p0x: 0, p0y: 0, p1x: 1, p1y: 1, p2x: 2, p2y: 0 },
      { p0x: 2, p0y: 0, p1x: 3, p1y: -1, p2x: 4, p2y: 0 },
    ]
    const rev = reverseContour(curves)
    expect(rev).toHaveLength(2)
    // First reversed curve starts at the original last curve's p2.
    expect(rev[0]!.p0x).toBe(4); expect(rev[0]!.p0y).toBe(0)
    expect(rev[0]!.p2x).toBe(2); expect(rev[0]!.p2y).toBe(0)
    // p1 (control point) stays in place — just re-labeled.
    expect(rev[0]!.p1x).toBe(3); expect(rev[0]!.p1y).toBe(-1)
    // Second reversed curve picks up where the first left off.
    expect(rev[1]!.p0x).toBe(2); expect(rev[1]!.p0y).toBe(0)
    expect(rev[1]!.p2x).toBe(0); expect(rev[1]!.p2y).toBe(0)
  })

  it('round-trip: reverse twice = identity', () => {
    const curves: QuadCurve[] = [
      { p0x: 0, p0y: 0, p1x: 1, p1y: 1, p2x: 2, p2y: 0 },
      { p0x: 2, p0y: 0, p1x: 3, p1y: -1, p2x: 4, p2y: 0 },
    ]
    const twice = reverseContour(reverseContour(curves))
    expect(twice).toEqual(curves)
  })
})

describe('strokeOffsetter — closed contours', () => {
  // Unit square going CCW (each edge is a degenerate straight quad)
  const unitSquare: QuadCurve[] = [
    { p0x: 0, p0y: 0, p1x: 0.5, p1y: 0, p2x: 1, p2y: 0 },   // bottom: +x
    { p0x: 1, p0y: 0, p1x: 1, p1y: 0.5, p2x: 1, p2y: 1 },   // right: +y
    { p0x: 1, p0y: 1, p1x: 0.5, p1y: 1, p2x: 0, p2y: 1 },   // top: -x
    { p0x: 0, p0y: 1, p1x: 0, p1y: 0.5, p2x: 0, p2y: 0 },   // left: -y
  ]

  it('emits outer + inner closed contours', () => {
    const out = strokeOffsetter(unitSquare, true, {
      halfWidth: 0.1,
      joinStyle: 'miter',
      miterLimit: 4,
    })
    expect(out).toHaveLength(2)
    expect(out[0]!.closed).toBe(true)
    expect(out[1]!.closed).toBe(true)
    // Outer has more than the source count (joins add extras at corners).
    expect(out[0]!.curves.length).toBeGreaterThanOrEqual(unitSquare.length)
    expect(out[1]!.curves.length).toBeGreaterThanOrEqual(unitSquare.length)
  })

  it('outer contour is CCW (same as source); inner is reversed (CW)', () => {
    const out = strokeOffsetter(unitSquare, true, { halfWidth: 0.1 })
    // Shoelace formula — positive = CCW, negative = CW.
    const signedArea = (curves: QuadCurve[]) => {
      let sum = 0
      for (const c of curves) sum += (c.p2x - c.p0x) * (c.p2y + c.p0y)
      return -sum * 0.5
    }
    expect(signedArea(out[0]!.curves)).toBeGreaterThan(0)
    expect(signedArea(out[1]!.curves)).toBeLessThan(0)
  })

  it('closed-contour offset has no cap (cap style is ignored)', () => {
    const miter = strokeOffsetter(unitSquare, true, { halfWidth: 0.1, capStyle: 'round' })
    const flat = strokeOffsetter(unitSquare, true, { halfWidth: 0.1, capStyle: 'flat' })
    // Same curve count regardless of cap style — closed contours never
    // invoke insertCap.
    expect(miter[0]!.curves.length).toBe(flat[0]!.curves.length)
    expect(miter[1]!.curves.length).toBe(flat[1]!.curves.length)
  })

  it('outer at halfWidth=0.1 grows the square by 0.1 on each side', () => {
    const out = strokeOffsetter(unitSquare, true, { halfWidth: 0.1, joinStyle: 'miter' })
    // Find extreme x and y values in the outer contour.
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity
    for (const c of out[0]!.curves) {
      for (const p of [[c.p0x, c.p0y], [c.p1x, c.p1y], [c.p2x, c.p2y]]) {
        if (p[0]! < xMin) xMin = p[0]!
        if (p[0]! > xMax) xMax = p[0]!
        if (p[1]! < yMin) yMin = p[1]!
        if (p[1]! > yMax) yMax = p[1]!
      }
    }
    // Miter at 90° corner extends halfWidth·√2 on the diagonal bisector.
    // xMin/yMin should be around -0.1 (inner-edge extended by miter).
    expect(xMin).toBeLessThan(-0.09)
    expect(xMax).toBeGreaterThan(1.09)
    expect(yMin).toBeLessThan(-0.09)
    expect(yMax).toBeGreaterThan(1.09)
  })
})

describe('strokeOffsetter — open contours', () => {
  // Horizontal line segment split into two curves.
  const openLine: QuadCurve[] = [
    { p0x: 0, p0y: 0, p1x: 1, p1y: 0, p2x: 2, p2y: 0 },
    { p0x: 2, p0y: 0, p1x: 3, p1y: 0, p2x: 4, p2y: 0 },
  ]

  it('emits one closed contour stitching outer + end cap + inner + start cap', () => {
    const out = strokeOffsetter(openLine, false, {
      halfWidth: 0.1,
      joinStyle: 'miter',
      capStyle: 'flat',
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.closed).toBe(true)
  })

  it('flat cap produces minimum curve count (1 quad per cap)', () => {
    const flat = strokeOffsetter(openLine, false, { halfWidth: 0.1, capStyle: 'flat' })
    const round = strokeOffsetter(openLine, false, { halfWidth: 0.1, capStyle: 'round' })
    const square = strokeOffsetter(openLine, false, { halfWidth: 0.1, capStyle: 'square' })
    const triangle = strokeOffsetter(openLine, false, { halfWidth: 0.1, capStyle: 'triangle' })
    // flat (1+1) < triangle (2+2) < square (3+3) < round (3+3) in quad count.
    expect(flat[0]!.curves.length).toBeLessThan(triangle[0]!.curves.length)
    expect(triangle[0]!.curves.length).toBeLessThanOrEqual(square[0]!.curves.length)
    expect(square[0]!.curves.length).toBeLessThanOrEqual(round[0]!.curves.length)
  })

  it('closed-loop traversal — last curve ends where first begins', () => {
    const out = strokeOffsetter(openLine, false, { halfWidth: 0.1, capStyle: 'flat' })
    const curves = out[0]!.curves
    const first = curves[0]!
    const last = curves[curves.length - 1]!
    expect(last.p2x).toBeCloseTo(first.p0x, 6)
    expect(last.p2y).toBeCloseTo(first.p0y, 6)
  })

  it('adjacent curves share endpoints (p2 of one === p0 of next)', () => {
    const out = strokeOffsetter(openLine, false, { halfWidth: 0.1, capStyle: 'flat' })
    const curves = out[0]!.curves
    for (let i = 0; i < curves.length - 1; i++) {
      expect(curves[i]!.p2x).toBeCloseTo(curves[i + 1]!.p0x, 6)
      expect(curves[i]!.p2y).toBeCloseTo(curves[i + 1]!.p0y, 6)
    }
  })
})

describe('strokeOffsetter — empty + degenerate input', () => {
  it('empty source returns empty output', () => {
    expect(strokeOffsetter([], true, { halfWidth: 0.1 })).toEqual([])
    expect(strokeOffsetter([], false, { halfWidth: 0.1 })).toEqual([])
  })
})

describe('bakeStrokeForGlyph', () => {
  // Unit square contour packed as a SlugGlyphData record (as if it
  // came out of fontParser).
  const unitSquareCurves: QuadCurve[] = [
    { p0x: 0, p0y: 0, p1x: 0.5, p1y: 0, p2x: 1, p2y: 0 },
    { p0x: 1, p0y: 0, p1x: 1, p1y: 0.5, p2x: 1, p2y: 1 },
    { p0x: 1, p0y: 1, p1x: 0.5, p1y: 1, p2x: 0, p2y: 1 },
    { p0x: 0, p0y: 1, p1x: 0, p1y: 0.5, p2x: 0, p2y: 0 },
  ]
  const sourceGlyph = buildGpuGlyphData(42, unitSquareCurves, [0], 1.0, 0.05)

  it('returns null for an advance-only (no-outline) glyph', () => {
    const space = buildAdvanceOnlyGlyph(3, 0.5, 0.02)
    const out = bakeStrokeForGlyph(space, { halfWidth: 0.05 })
    expect(out).toBeNull()
  })

  it('returns null for an empty curves array', () => {
    const empty: typeof sourceGlyph = {
      ...sourceGlyph,
      curves: [],
      contourStarts: [],
    }
    expect(bakeStrokeForGlyph(empty, { halfWidth: 0.05 })).toBeNull()
  })

  it('bakes a closed source into a glyph with two contours (outer + inner hole)', () => {
    const stroked = bakeStrokeForGlyph(sourceGlyph, {
      halfWidth: 0.05,
      joinStyle: 'miter',
      miterLimit: 4,
    })
    expect(stroked).not.toBeNull()
    // Closed source → strokeOffsetter emits 2 contours per source
    // contour (outer + inner reversed). Single source contour → 2 in
    // the stroked glyph.
    expect(stroked!.contourStarts.length).toBe(2)
    // Curves array is non-empty and chained correctly within each
    // contour.
    expect(stroked!.curves.length).toBeGreaterThan(0)
    for (let i = 0; i < stroked!.contourStarts.length; i++) {
      const start = stroked!.contourStarts[i]!
      const end = i + 1 < stroked!.contourStarts.length
        ? stroked!.contourStarts[i + 1]!
        : stroked!.curves.length
      // Adjacent curves in each contour share endpoints (p2 of one
      // equals p0 of the next).
      for (let j = start; j < end - 1; j++) {
        expect(stroked!.curves[j]!.p2x).toBeCloseTo(stroked!.curves[j + 1]!.p0x, 6)
        expect(stroked!.curves[j]!.p2y).toBeCloseTo(stroked!.curves[j + 1]!.p0y, 6)
      }
    }
  })

  it('preserves source glyph advance/lsb (so shaping uses the same width)', () => {
    const stroked = bakeStrokeForGlyph(sourceGlyph, { halfWidth: 0.05 })
    expect(stroked!.advanceWidth).toBe(sourceGlyph.advanceWidth)
    expect(stroked!.lsb).toBe(sourceGlyph.lsb)
    expect(stroked!.glyphId).toBe(sourceGlyph.glyphId)
  })

  it('bounds grow outward — stroked glyph bbox extends halfWidth beyond source', () => {
    const stroked = bakeStrokeForGlyph(sourceGlyph, {
      halfWidth: 0.05,
      joinStyle: 'miter',
      miterLimit: 4,
    })
    // Source bbox: (0,0)..(1,1). Outer offset + miter corner extends
    // by ~halfWidth on each side at 90° (miter = halfWidth·√2 on the
    // diagonal). Stroked bbox should comfortably exceed source bbox.
    expect(stroked!.bounds.xMin).toBeLessThan(sourceGlyph.bounds.xMin)
    expect(stroked!.bounds.yMin).toBeLessThan(sourceGlyph.bounds.yMin)
    expect(stroked!.bounds.xMax).toBeGreaterThan(sourceGlyph.bounds.xMax)
    expect(stroked!.bounds.yMax).toBeGreaterThan(sourceGlyph.bounds.yMax)
  })
})
