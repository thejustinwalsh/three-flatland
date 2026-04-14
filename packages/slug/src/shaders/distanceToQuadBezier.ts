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
 * Algorithm mirrors the reference line-for-line: 3 Newton seeds at
 * t ∈ {0, 0.5, 1} × 3 iterations each with [0, 1] clamping, plus the
 * two endpoints, then min over the 5 candidates.
 *
 * Must be called inside a `Fn()` TSL context. Input nodes are em-space
 * `vec2`s; the returned `distance` is in em-space.
 */
export function distanceToQuadBezier(
  p: Node<'vec2'>,
  p0: Node<'vec2'>,
  p1: Node<'vec2'>,
  p2: Node<'vec2'>,
) {
  // Second differences + offset-to-query.
  const A = p2.sub(p1.mul(2.0)).add(p0)
  const D = p1.sub(p0)
  const M = p0.sub(p)

  const AA = A.dot(A)
  const AD = A.dot(D)
  const DD = D.dot(D)
  const MA = M.dot(A)
  const MD = M.dot(D)

  // Cubic coefficients for f(t) = AA·t³ + 3·AD·t² + (2·DD + MA)·t + MD
  const c3 = AA
  const c2 = float(3.0).mul(AD)
  const c1 = float(2.0).mul(DD).add(MA)
  const c0 = MD

  // f(t), f'(t)
  const fEval = (t: Node<'float'>) =>
    c3.mul(t).mul(t).mul(t)
      .add(c2.mul(t).mul(t))
      .add(c1.mul(t))
      .add(c0)
  const fPrime = (t: Node<'float'>) =>
    float(3.0).mul(c3).mul(t).mul(t)
      .add(float(2.0).mul(c2).mul(t))
      .add(c1)

  // One Newton step, guarded against tiny derivatives.
  const denomFloor = float(1.0 / (1 << 20))
  const newton = (t: Node<'float'>) => {
    const fp = fPrime(t)
    // Keep sign of fp, push magnitude above floor so the divide is safe.
    const fpSafe = fp.sign().mul(max(abs(fp), denomFloor))
    return t.sub(fEval(t).div(fpSafe)).clamp(0.0, 1.0)
  }

  // Three seeds × three iterations each, unrolled. Cheap in TSL —
  // the compiler CSEs the fEval/fPrime terms and the whole thing
  // flattens to a straight-line evaluator.
  const refine = (seed: number) => {
    let t = newton(float(seed))
    t = newton(t)
    t = newton(t)
    return t
  }
  const tA = refine(0.0)
  const tB = refine(0.5)
  const tC = refine(1.0)

  // Evaluate each candidate's distance² and pick the smallest.
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
  const dA = evalDistSq(tA)
  const dB = evalDistSq(tB)
  const dC = evalDistSq(tC)

  // Reduction via pairwise min, tracking t alongside. TSL has no
  // native argmin, so we use select() against each pair.
  const pick = (ta: Node<'float'>, da: Node<'float'>, tb: Node<'float'>, db: Node<'float'>) => {
    // Returns (tBest, dBest) as a vec2 via ternary-style select.
    const aWins = da.lessThanEqual(db)
    return vec2(
      aWins.select(ta, tb),
      aWins.select(da, db),
    )
  }

  // Reduce 5 candidates: ((tA,dA) vs (tB,dB)) vs (tC,dC) vs (0,d0) vs (1,d1).
  const ab = pick(tA, dA, tB, dB)
  const abc = pick(ab.x, ab.y, tC, dC)
  const abcZero = pick(abc.x, abc.y, float(0.0), d0)
  const best = pick(abcZero.x, abcZero.y, float(1.0), d1)

  return vec2(sqrt(best.y), best.x)
}

