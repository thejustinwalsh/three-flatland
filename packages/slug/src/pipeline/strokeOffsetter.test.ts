import { describe, it, expect } from 'vitest'
import { offsetQuadraticBezier, subdivideForOffset, unitTangentAt } from './strokeOffsetter'
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
  it('offsets a horizontal line upward by +halfWidth', () => {
    // Line from (0,0) to (10,0) along +x axis. Left-hand normal = (0,1).
    const line: QuadCurve = { p0x: 0, p0y: 0, p1x: 5, p1y: 0, p2x: 10, p2y: 0 }
    const out = offsetQuadraticBezier(line, 0.5)
    expect(out.p0x).toBeCloseTo(0, 10)
    expect(out.p0y).toBeCloseTo(0.5, 10)
    expect(out.p2x).toBeCloseTo(10, 10)
    expect(out.p2y).toBeCloseTo(0.5, 10)
    // p1 for a straight line falls back to the midpoint of p0' and p2'
    expect(out.p1x).toBeCloseTo(5, 10)
    expect(out.p1y).toBeCloseTo(0.5, 10)
  })

  it('offsets a horizontal line downward with a negative halfWidth', () => {
    const line: QuadCurve = { p0x: 0, p0y: 0, p1x: 5, p1y: 0, p2x: 10, p2y: 0 }
    const out = offsetQuadraticBezier(line, -0.3)
    expect(out.p0y).toBeCloseTo(-0.3, 10)
    expect(out.p2y).toBeCloseTo(-0.3, 10)
  })

  it('offsets a vertical line to the left (left-hand normal convention)', () => {
    // (0,0) → (0,10) along +y axis. Left-hand normal = (-1, 0).
    const line: QuadCurve = { p0x: 0, p0y: 0, p1x: 0, p1y: 5, p2x: 0, p2y: 10 }
    const out = offsetQuadraticBezier(line, 0.5)
    expect(out.p0x).toBeCloseTo(-0.5, 10)
    expect(out.p0y).toBeCloseTo(0, 10)
    expect(out.p2x).toBeCloseTo(-0.5, 10)
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
    // Symmetric quad peaking at y=1
    const c: QuadCurve = { p0x: -1, p0y: 0, p1x: 0, p1y: 1, p2x: 1, p2y: 0 }
    const outer = offsetQuadraticBezier(c, 0.2)
    const inner = offsetQuadraticBezier(c, -0.2)
    // Outer lifts the peak (higher y), inner drops it (lower y)
    expect(outer.p1y).toBeGreaterThan(c.p1y)
    expect(inner.p1y).toBeLessThan(c.p1y)
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
