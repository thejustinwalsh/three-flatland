import { describe, it, expect } from 'vitest'
import { refDistanceToQuadBezier } from './distanceToQuadBezier'

/**
 * Closed-form distance-to-quadratic-Bezier validation.
 * Each test has an analytic ground truth so we can assert the
 * reference implementation matches to floating-point precision.
 */

describe('refDistanceToQuadBezier — straight degenerate quad', () => {
  // Degenerate line from (0,0) to (10,0) with control (5,0) — a true
  // line segment along the x-axis.
  const p0x = 0,
    p0y = 0
  const p1x = 5,
    p1y = 0
  const p2x = 10,
    p2y = 0

  it('computes distance 3 and t=0.5 for (5, 3)', () => {
    const r = refDistanceToQuadBezier(5, 3, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(3, 6)
    expect(r.t).toBeCloseTo(0.5, 6)
  })

  it('clamps t=0 when projection falls left of p0', () => {
    // Point (-4, 0): closest is p0 at distance 4, t=0.
    const r = refDistanceToQuadBezier(-4, 0, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(4, 6)
    expect(r.t).toBe(0)
  })

  it('clamps t=1 when projection falls right of p2', () => {
    const r = refDistanceToQuadBezier(14, 0, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(4, 6)
    expect(r.t).toBe(1)
  })

  it('exactly on the curve returns zero distance', () => {
    const r = refDistanceToQuadBezier(7, 0, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(0, 6)
    expect(r.t).toBeCloseTo(0.7, 5)
  })
})

describe('refDistanceToQuadBezier — symmetric quarter-arc', () => {
  // p0=(0,10), p1=(0,0), p2=(10,0). This is the standard quarter-arc
  // approximation used in glyph outlines — not a true circle but
  // symmetric across the y=x line.
  const p0x = 0,
    p0y = 10
  const p1x = 0,
    p1y = 0
  const p2x = 10,
    p2y = 0

  it('distance from origin matches analytical value', () => {
    // Closest point on B(t) = ((1-t)²·0 + 2(1-t)t·0 + t²·10, (1-t)²·10 + 2(1-t)t·0 + t²·0)
    //                      = (10t², 10(1-t)²)
    // To (0, 0): dist² = 100(t⁴ + (1-t)⁴). Minimum at t = 0.5, value 2·10·(1/16) = 12.5
    // ⇒ dist² = 100·(0.125) = 12.5, dist = √12.5 ≈ 3.5355
    const r = refDistanceToQuadBezier(0, 0, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(Math.sqrt(12.5), 5)
    expect(r.t).toBeCloseTo(0.5, 5)
  })

  it('endpoint p0 returns distance 0 at t=0', () => {
    const r = refDistanceToQuadBezier(0, 10, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(0, 6)
    expect(r.t).toBeCloseTo(0, 5)
  })

  it('endpoint p2 returns distance 0 at t=1', () => {
    const r = refDistanceToQuadBezier(10, 0, p0x, p0y, p1x, p1y, p2x, p2y)
    expect(r.distance).toBeCloseTo(0, 6)
    expect(r.t).toBeCloseTo(1, 5)
  })

  it('point far outside arc clamps to nearest endpoint', () => {
    const r = refDistanceToQuadBezier(-5, 15, p0x, p0y, p1x, p1y, p2x, p2y)
    // Closest should be near p0=(0,10). Distance sqrt(25+25)=sqrt(50)
    expect(r.distance).toBeCloseTo(Math.sqrt(50), 3)
    expect(r.t).toBeCloseTo(0, 5)
  })
})

describe('refDistanceToQuadBezier — degenerate point', () => {
  it('returns Euclidean distance when p0=p1=p2', () => {
    const r = refDistanceToQuadBezier(3, 4, 0, 0, 0, 0, 0, 0)
    expect(r.distance).toBeCloseTo(5, 6)
    expect(r.t).toBe(0)
  })
})

describe('refDistanceToQuadBezier — monotone convergence', () => {
  // On a curve, sampling t from 0..1 the distance to a point should
  // decrease to the closest-point then increase. This catches Newton
  // getting stuck on a local stationary point other than the global
  // min.
  it('sampled distances decrease then increase across the closest point', () => {
    const p0x = 0,
      p0y = 0
    const p1x = 10,
      p1y = 20
    const p2x = 20,
      p2y = 0
    const px = 10,
      py = 5

    const ref = refDistanceToQuadBezier(px, py, p0x, p0y, p1x, p1y, p2x, p2y)

    // Brute-force search over 1000 samples and confirm Newton hit the
    // global minimum.
    let bruteBest = Infinity
    let bruteT = 0
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000
      const ct = 1 - t
      const bx = ct * ct * p0x + 2 * ct * t * p1x + t * t * p2x
      const by = ct * ct * p0y + 2 * ct * t * p1y + t * t * p2y
      const d = Math.hypot(bx - px, by - py)
      if (d < bruteBest) {
        bruteBest = d
        bruteT = t
      }
    }

    expect(ref.distance).toBeCloseTo(bruteBest, 3)
    expect(Math.abs(ref.t - bruteT)).toBeLessThan(0.01)
  })
})

describe('refDistanceToQuadBezier — S-curve with two stationary points', () => {
  // A curve that bends back — Newton can get stuck on the wrong
  // critical point if seeds aren't spread across [0, 1].
  it('finds global minimum on a back-bending curve', () => {
    const p0x = 0,
      p0y = 0
    const p1x = 10,
      p1y = 10
    const p2x = 0,
      p2y = 20
    const px = 5,
      py = 10

    const ref = refDistanceToQuadBezier(px, py, p0x, p0y, p1x, p1y, p2x, p2y)

    let bruteBest = Infinity
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000
      const ct = 1 - t
      const bx = ct * ct * p0x + 2 * ct * t * p1x + t * t * p2x
      const by = ct * ct * p0y + 2 * ct * t * p1y + t * t * p2y
      const d = Math.hypot(bx - px, by - py)
      if (d < bruteBest) bruteBest = d
    }

    expect(ref.distance).toBeCloseTo(bruteBest, 3)
  })
})
