/**
 * Analytic closest-point / distance from a point to a quadratic Bezier
 * curve. Shared by the pure-JS reference and — in Phase 4 Task 10 — the
 * TSL port used by the stroke fragment shader.
 *
 * The distance function D(t) = |B(t) - P|² is a quartic in t; its
 * derivative dD/dt is a cubic
 *
 *   a·t³ + b·t² + c·t + d = 0
 *   a = A·A,  b = 3·(A·D),  c = 2·(D·D) + M·A,  d = M·D
 *   A = p2 - 2·p1 + p0  (second difference)
 *   D = p1 - p0         (initial tangent / 2)
 *   M = p0 - P
 *
 * Roots of that cubic are the t-values where the distance is locally
 * stationary — candidates for the closest point. We also evaluate the
 * two endpoints (t = 0 and t = 1) and return the min over all survivors.
 *
 * Closed-form Cardano is ~3× the work of `solveQuadratic` but has no
 * convergence risk. Newton from well-chosen seeds is cheaper for our
 * case because the quadratic Beziers produced from font outlines and
 * cubic-to-quadratic splits are well-conditioned — 3 iterations from
 * t ∈ {0, 0.5, 1} lock in to the nearest critical point reliably.
 * We benchmark both in Task 10.3 and pick the winner; this reference
 * uses Newton to keep the pure-JS implementation simple and to mirror
 * the expected TSL cost model.
 */

export interface DistanceResult {
  /** Euclidean distance from P to the closest point on the curve. */
  distance: number
  /**
   * Curve parameter of the closest point in [0, 1]. Values exactly at
   * the endpoints (0 or 1) mean the projection fell outside the curve
   * segment and the closest point is at a control endpoint — callers
   * (stroke shader join classifier) use this to dispatch on endpoint
   * vs body hits.
   */
  t: number
}

/**
 * Reference implementation of `distanceToQuadBezier` for CPU
 * validation. Returns the closest-point distance and the curve parameter
 * at which it occurs.
 *
 * Degenerate handling:
 *   - A·A ≈ 0 (straight line): cubic collapses; we reduce to the
 *     line-projection `t = (P - p0)·(p2 - p0) / |p2 - p0|²` clamped to
 *     [0, 1].
 *   - Coincident control points (p0 = p1 = p2): the curve is a point;
 *     all t give the same distance. We return t = 0.
 */
export function refDistanceToQuadBezier(
  px: number, py: number,
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
): DistanceResult {
  const Ax = p2x - 2 * p1x + p0x
  const Ay = p2y - 2 * p1y + p0y
  const Dx = p1x - p0x
  const Dy = p1y - p0y
  const Mx = p0x - px
  const My = p0y - py

  const AA = Ax * Ax + Ay * Ay
  const AD = Ax * Dx + Ay * Dy
  const DD = Dx * Dx + Dy * Dy
  const MA = Mx * Ax + My * Ay
  const MD = Mx * Dx + My * Dy

  // Degenerate point: p0 = p1 = p2.
  if (AA < 1e-12 && DD < 1e-12) {
    return { distance: Math.hypot(Mx, My), t: 0 }
  }

  // Degenerate line (A near zero): project onto the line p0→p2. In this
  // case the cubic reduces to `c·t + d = 0`, which is the same as the
  // line projection formula. We fall through to the generic path below
  // and let Newton converge from t=0.5; the zero seed produces the
  // projection in a single step.

  // Candidate ts: endpoints + three Newton-refined seeds at 0, 0.5, 1.
  // Clamping each step into [0, 1] prevents runaway and keeps the
  // critical point inside the curve segment. (Slug's fill-side solver
  // uses the same clamp pattern in `solveQuadratic`.)
  const fPrime = (t: number) =>
    3 * AA * t * t + 2 * (3 * AD) * t + (2 * DD + MA)
  const f = (t: number) =>
    AA * t * t * t + 3 * AD * t * t + (2 * DD + MA) * t + MD

  const refine = (seed: number): number => {
    let t = seed
    for (let i = 0; i < 3; i++) {
      const fpT = fPrime(t)
      if (Math.abs(fpT) < 1e-12) break
      t = t - f(t) / fpT
      if (t < 0) t = 0
      else if (t > 1) t = 1
    }
    return t
  }

  const candidates = [0, 1, refine(0), refine(0.5), refine(1)]

  let bestT = 0
  let bestDistSq = Infinity
  for (const t of candidates) {
    const ct = 1 - t
    // Explicit quadratic evaluation — avoids cascading FMA subtractions.
    const bx = ct * ct * p0x + 2 * ct * t * p1x + t * t * p2x
    const by = ct * ct * p0y + 2 * ct * t * p1y + t * t * p2y
    const dx = bx - px
    const dy = by - py
    const distSq = dx * dx + dy * dy
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestT = t
    }
  }

  return { distance: Math.sqrt(bestDistSq), t: bestT }
}
