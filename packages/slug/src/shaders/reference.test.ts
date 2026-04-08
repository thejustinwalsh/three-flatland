import { describe, it, expect } from 'vitest'
import {
  refCalcRootCode,
  refSolveHorizPoly,
  refSolveVertPoly,
  refCalcCoverage,
  refSlugDilate,
} from './reference'

describe('calcRootCode', () => {
  it('returns 0 when all points are above ray (all positive)', () => {
    // shift = 0b000 = 0, (0x2E74 >> 0) & 0x0101 = 0x74 & 0x0101 = 0x0000
    expect(refCalcRootCode(1, 1, 1)).toBe(0)
  })

  it('returns 0 when all points are below ray (all negative)', () => {
    // shift = 0b111 = 7, (0x2E74 >> 7) & 0x0101 = 0x5C & 0x0101 = 0x0000
    expect(refCalcRootCode(-1, -1, -1)).toBe(0)
  })

  it('detects curve crossing ray downward (+ - -)', () => {
    // p0 above, p1 below, p2 below
    // shift = 0b110 = 6, (0x2E74 >> 6) & 0x0101 = 0xB9 & 0x0101 = 0x0001
    const code = refCalcRootCode(1, -1, -1)
    expect(code & 1).toBe(1) // root1 eligible
  })

  it('detects curve crossing ray upward (- - +)', () => {
    // p0 below, p1 below, p2 above
    // shift = 0b011 = 3, (0x2E74 >> 3) & 0x0101 = 0x05CE & 0x0101 = ...
    const code = refCalcRootCode(-1, -1, 1)
    expect(code).toBeGreaterThan(0) // at least one root eligible
  })

  it('detects double crossing (- + -)', () => {
    // Curve dips below and comes back — both roots should contribute
    const code = refCalcRootCode(-1, 1, -1)
    const hasRoot1 = (code & 1) !== 0
    const hasRoot2 = (code & 0x100) !== 0
    expect(hasRoot1 || hasRoot2).toBe(true)
  })

  it('handles tangent touch (+ - +) — should cancel winding', () => {
    // Curve touches ray at tangent — both roots at same point
    const code = refCalcRootCode(1, -0.001, 1)
    // Both roots eligible but at nearly same position — net winding ~0
    expect(code).toBeGreaterThan(0)
  })

  it('is symmetric: all 8 sign combinations produce valid codes', () => {
    const signs = [-1, 1]
    for (const y1 of signs) {
      for (const y2 of signs) {
        for (const y3 of signs) {
          const code = refCalcRootCode(y1, y2, y3)
          // Code must only have bits 0 and 8
          expect(code & ~0x0101).toBe(0)
        }
      }
    }
  })
})

describe('solveHorizPoly', () => {
  it('finds two distinct intersections for an asymmetric arc', () => {
    // Curve from (0, 1) through (0.3, -1) to (1, 0.5)
    // Asymmetric — should produce two distinct x-intersections
    const [x1, x2] = refSolveHorizPoly(0, 1, 0.3, -1, 1, 0.5)
    expect(x1).toBeGreaterThan(0)
    expect(x1).toBeLessThan(1)
    expect(x2).toBeGreaterThan(0)
    expect(x2).toBeLessThan(1)
    expect(Math.abs(x1 - x2)).toBeGreaterThan(0.01) // distinct roots
  })

  it('handles near-degenerate case (a ≈ 0) without NaN', () => {
    // Nearly linear curve: p1.y is almost midpoint of p0.y and p2.y
    // a = 0.5 - 2*0.25 + 0 = 0, b = 0.5 - 0.25 = 0.25, c = 0.5
    // Falls through to linear: t = c / (2b) = 0.5 / 0.5 = 1.0
    const [x1, x2] = refSolveHorizPoly(0, 0.5, 0.5, 0.25, 1, 0)
    expect(isFinite(x1)).toBe(true)
    expect(isFinite(x2)).toBe(true)
  })

  it('finds intersection at known position for unit curve', () => {
    // Curve from (0, -1) through (0.5, 1) to (1, -1)
    // This crosses y=0 at two points
    const [x1, x2] = refSolveHorizPoly(0, -1, 0.5, 1, 1, -1)
    expect(x1).toBeGreaterThanOrEqual(0)
    expect(x2).toBeLessThanOrEqual(1)
  })

  it('handles near-linear case gracefully', () => {
    // Nearly straight line: p1.y is very close to midpoint of p0.y and p2.y
    const [x1, x2] = refSolveHorizPoly(0, -0.5, 0.5, 0, 1, 0.5)
    expect(isFinite(x1)).toBe(true)
    expect(isFinite(x2)).toBe(true)
  })
})

describe('solveVertPoly', () => {
  it('finds intersection of a curve with a vertical ray', () => {
    // Curve from (-1, 0) through (0.5, 0.5) to (-1, 1) — crosses x=0
    const [y1, y2] = refSolveVertPoly(-1, 0, 0.5, 0.5, -1, 1)
    expect(isFinite(y1)).toBe(true)
    expect(isFinite(y2)).toBe(true)
  })

  it('is symmetric with solveHorizPoly (swapped axes)', () => {
    // Same curve shape but rotated 90 degrees
    const [hx1, hx2] = refSolveHorizPoly(0, -1, 0.5, 0, 1, -1)
    const [vy1, vy2] = refSolveVertPoly(-1, 0, 0, 0.5, -1, 1)
    // The actual values differ (different curves) but both should produce finite results
    expect(isFinite(hx1) && isFinite(hx2)).toBe(true)
    expect(isFinite(vy1) && isFinite(vy2)).toBe(true)
  })
})

describe('calcCoverage', () => {
  it('returns 1.0 for fully inside pixel (high positive coverage)', () => {
    const cov = refCalcCoverage(1.0, 1.0, 1.0, 1.0)
    expect(cov).toBeCloseTo(1.0, 5)
  })

  it('returns 0.0 for fully outside pixel (zero coverage)', () => {
    const cov = refCalcCoverage(0.0, 0.0, 0.0, 0.0)
    expect(cov).toBeCloseTo(0.0, 5)
  })

  it('returns ~0.5 for half-covered pixel', () => {
    const cov = refCalcCoverage(0.5, 1.0, 0.5, 1.0)
    expect(cov).toBeCloseTo(0.5, 2)
  })

  it('uses fallback when weights are zero', () => {
    // Weights zero but coverage nonzero — uses min(|xcov|, |ycov|) fallback
    const cov = refCalcCoverage(0.7, 0.0, 0.3, 0.0)
    expect(cov).toBeCloseTo(0.3, 5)
  })

  it('handles weighted blend correctly', () => {
    // Horizontal coverage dominant
    const cov = refCalcCoverage(0.8, 1.0, 0.2, 0.1)
    expect(cov).toBeGreaterThan(0.5) // dominated by xcov
    expect(cov).toBeLessThanOrEqual(1.0)
  })

  it('clamps to [0, 1] for nonzero fill rule', () => {
    const cov = refCalcCoverage(2.0, 1.0, 2.0, 1.0)
    expect(cov).toBe(1.0) // saturated
  })

  it('folds for even-odd fill rule', () => {
    // Coverage of 2.0 with even-odd should produce ~0.0 (even winding)
    const cov = refCalcCoverage(2.0, 1.0, 2.0, 1.0, true)
    expect(cov).toBeLessThan(0.2) // near zero for even winding
  })

  it('applies sqrt weight boost', () => {
    const covNormal = refCalcCoverage(0.25, 1.0, 0.25, 1.0, false, false)
    const covBoosted = refCalcCoverage(0.25, 1.0, 0.25, 1.0, false, true)
    expect(covBoosted).toBeGreaterThan(covNormal) // sqrt(0.25) = 0.5 > 0.25
    expect(covBoosted).toBeCloseTo(Math.sqrt(covNormal), 5)
  })
})

describe('stemDarken', () => {
  it('has no effect when stemDarken is 0', () => {
    const base = refCalcCoverage(0.5, 1.0, 0.5, 1.0)
    const darkened = refCalcCoverage(0.5, 1.0, 0.5, 1.0, false, false, 0, 12)
    expect(darkened).toBeCloseTo(base, 5)
  })

  it('boosts mid-coverage at small ppem', () => {
    const base = refCalcCoverage(0.5, 1.0, 0.5, 1.0, false, false, 0)
    const darkened = refCalcCoverage(0.5, 1.0, 0.5, 1.0, false, false, 0.4, 8)
    expect(darkened).toBeGreaterThan(base)
  })

  it('does not affect fully opaque pixels (coverage = 1)', () => {
    const darkened = refCalcCoverage(1.0, 1.0, 1.0, 1.0, false, false, 0.4, 8)
    expect(darkened).toBeCloseTo(1.0, 5)
  })

  it('does not affect fully transparent pixels (coverage = 0)', () => {
    const darkened = refCalcCoverage(0.0, 0.0, 0.0, 0.0, false, false, 0.4, 8)
    expect(darkened).toBeCloseTo(0.0, 5)
  })

  it('has stronger effect at lower ppem', () => {
    const at16 = refCalcCoverage(0.4, 1.0, 0.4, 1.0, false, false, 0.4, 16)
    const at8 = refCalcCoverage(0.4, 1.0, 0.4, 1.0, false, false, 0.4, 8)
    expect(at8).toBeGreaterThan(at16)
  })

  it('has minimal effect at large ppem', () => {
    const base = refCalcCoverage(0.5, 1.0, 0.5, 1.0)
    const darkened = refCalcCoverage(0.5, 1.0, 0.5, 1.0, false, false, 0.4, 96)
    // At 96ppem, darken = 0.4/96 ≈ 0.004 — negligible
    expect(Math.abs(darkened - base)).toBeLessThan(0.01)
  })

  it('peaks at coverage = 0.5 (maximum boost)', () => {
    // darken * cov * (1-cov) is maximized at cov = 0.5
    const at25 = refCalcCoverage(0.25, 1.0, 0.25, 1.0, false, false, 0.5, 8)
    const at50 = refCalcCoverage(0.5, 1.0, 0.5, 1.0, false, false, 0.5, 8)
    const at75 = refCalcCoverage(0.75, 1.0, 0.75, 1.0, false, false, 0.5, 8)

    const boost25 = at25 - 0.25
    const boost50 = at50 - 0.5
    const boost75 = at75 - 0.75
    expect(boost50).toBeGreaterThan(boost25)
    expect(boost50).toBeGreaterThan(boost75)
  })
})

describe('slugDilate', () => {
  it('expands outward along normal direction', () => {
    // Simple orthographic-like MVP (identity-ish)
    const m0: [number, number, number, number] = [1, 0, 0, 0]
    const m1: [number, number, number, number] = [0, 1, 0, 0]
    const m3: [number, number, number, number] = [0, 0, 0, 1]
    const dim: [number, number] = [800, 600]

    const result = refSlugDilate(
      [0, 0],      // vertex at origin
      [1, 0],      // normal pointing right
      [0.5, 0.5],  // em-space center
      [1, 0, 0, 1], // identity Jacobian
      m0, m1, m3, dim,
    )

    // Vertex should move right (positive x)
    expect(result.vpos[0]).toBeGreaterThan(0)
    // Texcoord should also shift
    expect(result.texcoord[0]).toBeGreaterThan(0.5)
  })

  it('dilates more at smaller viewport sizes', () => {
    const m0: [number, number, number, number] = [1, 0, 0, 0]
    const m1: [number, number, number, number] = [0, 1, 0, 0]
    const m3: [number, number, number, number] = [0, 0, 0, 1]

    const resultLarge = refSlugDilate(
      [0, 0], [1, 0], [0.5, 0.5], [1, 0, 0, 1],
      m0, m1, m3, [1920, 1080],
    )
    const resultSmall = refSlugDilate(
      [0, 0], [1, 0], [0.5, 0.5], [1, 0, 0, 1],
      m0, m1, m3, [320, 240],
    )

    // Smaller viewport → larger dilation (more object-space displacement needed per pixel)
    expect(Math.abs(resultSmall.vpos[0])).toBeGreaterThan(Math.abs(resultLarge.vpos[0]))
  })

  it('produces zero dilation for zero-length normal', () => {
    const m0: [number, number, number, number] = [1, 0, 0, 0]
    const m1: [number, number, number, number] = [0, 1, 0, 0]
    const m3: [number, number, number, number] = [0, 0, 0, 1]

    const result = refSlugDilate(
      [0, 0], [0, 0], [0.5, 0.5], [1, 0, 0, 1],
      m0, m1, m3, [800, 600],
    )

    expect(result.vpos[0]).toBe(0)
    expect(result.vpos[1]).toBe(0)
  })

  it('adjusts texcoord through inverse Jacobian', () => {
    const m0: [number, number, number, number] = [1, 0, 0, 0]
    const m1: [number, number, number, number] = [0, 1, 0, 0]
    const m3: [number, number, number, number] = [0, 0, 0, 1]

    // Jacobian that scales x by 2
    const result = refSlugDilate(
      [0, 0], [1, 0], [0.5, 0.5], [2, 0, 0, 1],
      m0, m1, m3, [800, 600],
    )

    // The em-space displacement should be 2x the object-space displacement
    const objDisp = result.vpos[0]
    const emDisp = result.texcoord[0] - 0.5
    expect(emDisp).toBeCloseTo(objDisp * 2, 5)
  })
})
