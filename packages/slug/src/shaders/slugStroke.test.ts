import { describe, it, expect } from 'vitest'
import { refDistanceToQuadBezier } from './distanceToQuadBezier'

/**
 * Pure-JS reference for stroke coverage. Mirrors the TSL `slugStroke`
 * algorithm line-for-line so we can validate behavior without a GPU.
 *
 * GPU-vs-CPU parity (the actual headless-WebGPU render) lands in a
 * follow-up integration test once `SlugStrokeMaterial` + `SlugText.outline`
 * are wired up. For now this verifies the math itself: bevel-via-min,
 * crispness gate, AA window.
 */
interface Curve {
  p0: [number, number]
  p1: [number, number]
  p2: [number, number]
}

function refStrokeCoverage(
  curves: readonly Curve[],
  px: number, py: number,
  strokeHalfWidth: number,
  pixelEm: number,
): number {
  const aaHalf = pixelEm * 0.5
  const effHalf = Math.max(strokeHalfWidth, aaHalf)

  let minDist = 1.0
  for (const c of curves) {
    const r = refDistanceToQuadBezier(
      px, py,
      c.p0[0], c.p0[1],
      c.p1[0], c.p1[1],
      c.p2[0], c.p2[1],
    )
    if (r.distance < minDist) minDist = r.distance
  }

  const lo = effHalf - aaHalf
  const hi = effHalf + aaHalf
  // smoothstep(lo, hi, d) = 0 at d≤lo, 1 at d≥hi, smooth in between
  const t = Math.min(Math.max((minDist - lo) / (hi - lo), 0), 1)
  const s = t * t * (3 - 2 * t)
  return 1 - s
}

describe('refStrokeCoverage — single straight segment', () => {
  const curves: Curve[] = [{
    p0: [0, 0],
    p1: [5, 0],
    p2: [10, 0],
  }]

  it('full coverage at the center of a 0.1-em wide stroke', () => {
    // halfWidth = 0.05, fragment on the curve, pixelEm tiny (no AA blur)
    const c = refStrokeCoverage(curves, 5, 0, 0.05, 1e-4)
    expect(c).toBeCloseTo(1, 3)
  })

  it('zero coverage well outside the stroke', () => {
    const c = refStrokeCoverage(curves, 5, 0.5, 0.05, 1e-4)
    expect(c).toBeCloseTo(0, 3)
  })

  it('partial coverage inside the AA window at the outer edge', () => {
    // halfWidth = 0.05, AA half = 0.01, so stroke edge fades 0.04..0.06
    const c = refStrokeCoverage(curves, 5, 0.05, 0.05, 0.02)
    // At exactly halfWidth the smoothstep midpoint gives 0.5
    expect(c).toBeCloseTo(0.5, 1)
  })

  it('crispness gate: sub-pixel halfWidth widens to 1 pixel', () => {
    // halfWidth 0.1·pixelEm = 0.002, pixelEm = 0.02 → effHalf = 0.01 (aaHalf)
    // A fragment at distance 0.005 em (= 0.25 px) from the curve should
    // have coverage > 0 even though 0.005 > nominal halfWidth of 0.002.
    const c = refStrokeCoverage(curves, 5, 0.005, 0.002, 0.02)
    expect(c).toBeGreaterThan(0)
    expect(c).toBeLessThanOrEqual(1)
  })
})

describe('refStrokeCoverage — closed square contour (bevel-via-min)', () => {
  // Unit square with corners (0,0), (1,0), (1,1), (0,1).
  // Four line-like quads. Exterior corner fragments should get min
  // distance to adjacent curves → clean bevel, no extended tip, no gap.
  const curves: Curve[] = [
    { p0: [0, 0], p1: [0.5, 0], p2: [1, 0] },     // bottom
    { p0: [1, 0], p1: [1, 0.5], p2: [1, 1] },     // right
    { p0: [1, 1], p1: [0.5, 1], p2: [0, 1] },     // top
    { p0: [0, 1], p1: [0, 0.5], p2: [0, 0] },     // left
  ]

  it('full coverage on a stroke segment midpoint', () => {
    const c = refStrokeCoverage(curves, 0.5, 0, 0.05, 1e-4)
    expect(c).toBeCloseTo(1, 3)
  })

  it('full coverage at the exterior corner point', () => {
    // Corner at (0,0). Distance to the corner = 0 from both adjacent
    // curves. min(0, 0) = 0, well inside halfWidth.
    const c = refStrokeCoverage(curves, 0, 0, 0.05, 1e-4)
    expect(c).toBeCloseTo(1, 3)
  })

  it('coverage outside the exterior corner is capped by bevel, not miter', () => {
    // At (-0.04, -0.04) — diagonal distance ≈ 0.0566.
    // A miter would extend the stroke past halfWidth (=0.05) along the
    // bisector to the miter point, giving coverage 1 at this fragment.
    // Bevel-via-min gives distance = 0.0566 which falls outside halfWidth,
    // so coverage is low. This is the defining behavior of Phase 4's
    // bevel default (Phase 5 adds explicit miter).
    const c = refStrokeCoverage(curves, -0.04, -0.04, 0.05, 1e-4)
    expect(c).toBeLessThan(0.5)
  })

  it('interior corner stays fully covered', () => {
    // Interior fragment (0.05, 0.05) — distance to all four sides
    // ≈ 0.05 (exactly halfWidth). At halfWidth the smoothstep value
    // is 0.5 midway; with tiny AA window it's either 1 or 0. Pick a
    // fragment safely inside: (0.02, 0.02) — distance to bottom = 0.02,
    // within halfWidth. Coverage should be full.
    const c = refStrokeCoverage(curves, 0.02, 0.02, 0.05, 1e-4)
    expect(c).toBeCloseTo(1, 3)
  })
})

describe('refStrokeCoverage — sharp exterior corner (A-top analog)', () => {
  // Two curves meeting at (0, 1) with a sharp exterior angle — like
  // the apex of an "A". Incoming left leg: (-0.5, 0) → (0, 1).
  // Outgoing right leg: (0, 1) → (0.5, 0).
  const curves: Curve[] = [
    { p0: [-0.5, 0], p1: [-0.25, 0.5], p2: [0, 1] },
    { p0: [0, 1], p1: [0.25, 0.5], p2: [0.5, 0] },
  ]

  it('apex vertex itself has full coverage', () => {
    const c = refStrokeCoverage(curves, 0, 1, 0.05, 1e-4)
    expect(c).toBeCloseTo(1, 3)
  })

  it('bevel-via-min clips the stroke at the perpendicular bisector', () => {
    // Up and slightly away from the apex — an explicit miter would
    // extend the stroke well past the apex along the outward bisector;
    // bevel-via-min truncates at the bevel edge.
    const c = refStrokeCoverage(curves, 0, 1.08, 0.05, 1e-4)
    expect(c).toBeLessThan(0.1)
  })

  it('interior coverage (inside the A) is smooth and full', () => {
    const c = refStrokeCoverage(curves, 0, 0.9, 0.05, 1e-4)
    // Inside the triangle at (0, 0.9) — distance to each leg is small
    // relative to halfWidth.
    expect(c).toBeGreaterThan(0.5)
  })
})
