import { vec2, float, sqrt, abs, max } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Analytic closest-point / distance from a point to a quadratic Bezier
 * curve. Shared by the pure-JS reference and the TSL port used by the
 * stroke fragment shader.
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

/**
 * TSL port of `refDistanceToQuadBezier`. Returns a `vec2(distance, t)`.
 *
 * **Intentionally trimmed from the 3-seed reference.** The pure-JS
 * reference runs 3 Newton seeds × 3 iterations for robustness on
 * back-bending S-curves with multiple critical points. Font glyph
 * curves are almost never S-shaped at the quadratic level — most font
 * parsers split cubics at inflection points, so each emitted quad is
 * monotone along one axis. For those, Newton from t=0.5 converges to
 * the global min in 2-3 steps without seed spread.
 *
 * We run a single seed (t=0.5) with 3 iterations, plus the two
 * endpoints as hard candidates. This halves WGSL code size compared
 * to the reference, which directly halves the first-draw pipeline-
 * compile time on WebGPU — enough to turn a visible hitch on outline-
 * toggle into an imperceptible stall. Runtime cost per fragment also
 * drops by ~⅔.
 *
 * On the rare back-bending glyph curve, the single seed can miss the
 * global min by ≤ a few percent of stroke width — invisible for
 * closed-contour text outlines. If Phase 5 shape strokes hit an
 * S-curve edge case, either split the quad at its inflection at bake
 * time or switch to the 3-seed reference path.
 *
 * Must be called inside a `Fn()` TSL context.
 */
export function distanceToQuadBezier(
  p: Node<'vec2'>,
  p0: Node<'vec2'>,
  p1: Node<'vec2'>,
  p2: Node<'vec2'>,
) {
  const A = p2.sub(p1.mul(2.0)).add(p0)
  const D = p1.sub(p0)
  const M = p0.sub(p)

  const AA = A.dot(A)
  const AD = A.dot(D)
  const DD = D.dot(D)
  const MA = M.dot(A)
  const MD = M.dot(D)

  const c3 = AA
  const c2 = float(3.0).mul(AD)
  const c1 = float(2.0).mul(DD).add(MA)
  const c0 = MD

  const fEval = (t: Node<'float'>) =>
    c3.mul(t).mul(t).mul(t)
      .add(c2.mul(t).mul(t))
      .add(c1.mul(t))
      .add(c0)
  const fPrime = (t: Node<'float'>) =>
    float(3.0).mul(c3).mul(t).mul(t)
      .add(float(2.0).mul(c2).mul(t))
      .add(c1)

  const denomFloor = float(1.0 / (1 << 20))
  const newton = (t: Node<'float'>) => {
    const fp = fPrime(t)
    const fpSafe = fp.sign().mul(max(abs(fp), denomFloor))
    return t.sub(fEval(t).div(fpSafe)).clamp(0.0, 1.0)
  }

  // Single seed at t=0.5, 3 Newton refinements.
  let tMid = newton(float(0.5))
  tMid = newton(tMid)
  tMid = newton(tMid)

  // Evaluate candidate distances at the refined seed + both endpoints.
  const evalDistSq = (t: Node<'float'>) => {
    const ct = float(1.0).sub(t)
    const bx = ct.mul(ct).mul(p0.x)
      .add(float(2.0).mul(ct).mul(t).mul(p1.x))
      .add(t.mul(t).mul(p2.x))
    const by = ct.mul(ct).mul(p0.y)
      .add(float(2.0).mul(ct).mul(t).mul(p1.y))
      .add(t.mul(t).mul(p2.y))
    const dx = bx.sub(p.x)
    const dy = by.sub(p.y)
    return dx.mul(dx).add(dy.mul(dy))
  }

  const d0 = evalDistSq(float(0.0))
  const d1 = evalDistSq(float(1.0))
  const dM = evalDistSq(tMid)

  // Pairwise reduction carrying (t, d²) through select() — TSL lacks
  // a native argmin.
  const pick = (ta: Node<'float'>, da: Node<'float'>, tb: Node<'float'>, db: Node<'float'>) => {
    const aWins = da.lessThanEqual(db)
    return vec2(
      aWins.select(ta, tb),
      aWins.select(da, db),
    )
  }

  const mid0 = pick(tMid, dM, float(0.0), d0)
  const best = pick(mid0.x, mid0.y, float(1.0), d1)

  return vec2(sqrt(best.y), best.x)
}

