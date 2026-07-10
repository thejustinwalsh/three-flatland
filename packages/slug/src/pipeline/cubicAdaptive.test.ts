import { describe, it, expect } from 'vitest'
import { cubicToQuadratics, cubicToQuadraticsAdaptive, lineToQuadratic } from './fontParser'
import { refDistanceToQuadBezier } from '../shaders/distanceToQuadBezier'
import type { QuadCurve } from '../types'

/** Evaluate a cubic Bezier at t. */
function cubicAt(c: number[], t: number): [number, number] {
  const [x0, y0, c1x, c1y, c2x, c2y, x3, y3] = c as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const d = 3 * u * t * t
  const e = t * t * t
  return [a * x0 + b * c1x + d * c2x + e * x3, a * y0 + b * c1y + d * c2y + e * y3]
}

/** Evaluate a quadratic Bezier at t. */
function quadAt(q: QuadCurve, t: number): [number, number] {
  const u = 1 - t
  const a = u * u
  const b = 2 * u * t
  const c = t * t
  return [a * q.p0x + b * q.p1x + c * q.p2x, a * q.p0y + b * q.p1y + c * q.p2y]
}

/**
 * Max deviation of the source cubic from the emitted quadratic chain:
 * dense-sample the cubic, take the min distance to a dense sampling of
 * every quadratic, and return the max over cubic samples. A sampling
 * (under-)estimate of the true Hausdorff one-sided distance — the analytic
 * bound in the converter guarantees the true value, this verifies it
 * numerically.
 */
function maxDeviation(cubic: number[], quads: QuadCurve[]): number {
  let worst = 0
  for (let i = 0; i <= 512; i++) {
    const [cx, cy] = cubicAt(cubic, i / 512)
    let best = Infinity
    for (const q of quads) {
      // Exact analytic point-to-quadratic distance (the package's own
      // reference implementation) — no sampling-density artifacts.
      const { distance } = refDistanceToQuadBezier(cx, cy, q.p0x, q.p0y, q.p1x, q.p1y, q.p2x, q.p2y)
      if (distance < best) best = distance
    }
    worst = Math.max(worst, best)
  }
  return worst
}

/**
 * High-curvature corpus in ~unit space — hairpins, cusps, loops, long
 * flat-then-sharp segments. The fixed 2-quad split visibly deviates on
 * several of these; the adaptive converter must stay under tolerance.
 */
const CORPUS: number[][] = [
  // hairpin: out and back
  [0, 0, 1.5, 0.1, 1.5, 0.9, 0, 1],
  // cusp-ish loop
  [0, 0, 1, 1, -1, 1, 0.2, 0.1],
  // quarter circle (kappa cubic)
  [1, 0, 1, 0.5523, 0.5523, 1, 0, 1],
  // long flat run into a sharp turn
  [0, 0, 0.9, 0, 1, 0.02, 1, 1],
  // S-curve with strong asymmetry
  [0, 0, 2, 0, -1, 1, 1, 1],
  // near-degenerate: control points clustered at one end
  [0, 0, 0.01, 0.02, 0.02, 0.01, 1, 0.5],
]

describe('cubicToQuadraticsAdaptive', () => {
  const TOLERANCE = 0.0025 * Math.SQRT2 // slug/svg default for a square viewBox

  it('keeps max deviation under the tolerance on the high-curvature corpus', () => {
    for (const cubic of CORPUS) {
      const quads = cubicToQuadraticsAdaptive(
        cubic[0]!,
        cubic[1]!,
        cubic[2]!,
        cubic[3]!,
        cubic[4]!,
        cubic[5]!,
        cubic[6]!,
        cubic[7]!,
        TOLERANCE
      )
      const dev = maxDeviation(cubic, quads)
      // Sampling underestimates the true max, the analytic bound guarantees
      // it — allow only sampling slack above the tolerance.
      expect(dev, `cubic [${cubic.join(', ')}] emitted ${quads.length} quads`).toBeLessThanOrEqual(
        TOLERANCE * 1.05
      )
    }
  })

  it('subdivides harder as the tolerance tightens', () => {
    const cubic = CORPUS[0]!
    const counts = [0.02, 0.002, 0.0002].map(
      (tol) =>
        cubicToQuadraticsAdaptive(
          cubic[0]!,
          cubic[1]!,
          cubic[2]!,
          cubic[3]!,
          cubic[4]!,
          cubic[5]!,
          cubic[6]!,
          cubic[7]!,
          tol
        ).length
    )
    expect(counts[0]!).toBeLessThan(counts[1]!)
    expect(counts[1]!).toBeLessThan(counts[2]!)
  })

  it('emits a single quadratic when the cubic is already quad-representable', () => {
    // A degree-elevated quadratic: zero third difference → zero error bound.
    // Quadratic (0,0) (1,1) (2,0) elevated: c1 = 2/3·q1, c2 = q1 + (q2−q1)/3
    const quads = cubicToQuadraticsAdaptive(0, 0, 2 / 3, 2 / 3, 4 / 3, 2 / 3, 2, 0, 1e-9)
    expect(quads).toHaveLength(1)
    expect(quads[0]!.p1x).toBeCloseTo(1, 6)
    expect(quads[0]!.p1y).toBeCloseTo(1, 6)
  })

  it('respects the depth cap', () => {
    const cubic = CORPUS[1]!
    const quads = cubicToQuadraticsAdaptive(
      cubic[0]!,
      cubic[1]!,
      cubic[2]!,
      cubic[3]!,
      cubic[4]!,
      cubic[5]!,
      cubic[6]!,
      cubic[7]!,
      1e-12,
      3
    )
    expect(quads.length).toBeLessThanOrEqual(8) // 2^3
  })

  it('chains quads continuously (each end point = next start point)', () => {
    const cubic = CORPUS[4]!
    const quads = cubicToQuadraticsAdaptive(
      cubic[0]!,
      cubic[1]!,
      cubic[2]!,
      cubic[3]!,
      cubic[4]!,
      cubic[5]!,
      cubic[6]!,
      cubic[7]!,
      0.001
    )
    expect(quads.length).toBeGreaterThan(2)
    expect(quads[0]!.p0x).toBe(cubic[0])
    expect(quads[0]!.p0y).toBe(cubic[1])
    expect(quads[quads.length - 1]!.p2x).toBe(cubic[6])
    expect(quads[quads.length - 1]!.p2y).toBe(cubic[7])
    for (let i = 1; i < quads.length; i++) {
      expect(quads[i]!.p0x).toBe(quads[i - 1]!.p2x)
      expect(quads[i]!.p0y).toBe(quads[i - 1]!.p2y)
    }
  })
})

describe('cubicToQuadratics (fixed) regression', () => {
  it('still emits exactly 2 quadratics with the original best-fit math', () => {
    const quads = cubicToQuadratics(0, 0, 1, 1, -1, 1, 0.2, 0.1)
    expect(quads).toHaveLength(2)
    // Midpoint continuity + exact endpoints
    expect(quads[0]!.p0x).toBe(0)
    expect(quads[1]!.p2x).toBe(0.2)
    expect(quads[0]!.p2x).toBe(quads[1]!.p0x)
    expect(quads[0]!.p2y).toBe(quads[1]!.p0y)
  })

  it('matches the adaptive converter forced to one split (same shared core)', () => {
    const c = [0, 0, 1, 1, -1, 1, 0.2, 0.1] as const
    const fixed = cubicToQuadratics(...c)
    // maxDepth 1 + impossible tolerance → exactly one split, two leaf fits.
    const adaptive = cubicToQuadraticsAdaptive(...c, 0, 1)
    expect(adaptive).toEqual(fixed)
  })
})

describe('lineToQuadratic (exported for slug/svg)', () => {
  it('bows diagonal lines and keeps axis-aligned lines exact', () => {
    const diagonal = lineToQuadratic(0, 0, 1, 1, 1 / 1024)
    const mid = { x: 0.5, y: 0.5 }
    const off = Math.hypot(diagonal.p1x - mid.x, diagonal.p1y - mid.y)
    expect(off).toBeGreaterThan(0)
    expect(off).toBeLessThan(0.001)

    const axis = lineToQuadratic(0, 0, 1, 0, 1 / 1024)
    expect(axis.p1x).toBe(0.5)
    expect(axis.p1y).toBe(0)
  })
})
