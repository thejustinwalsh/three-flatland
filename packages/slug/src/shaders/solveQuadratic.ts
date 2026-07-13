import { vec2, select, abs, sqrt, max, float } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Two real roots of `a·t² − 2b·t + c = 0`, ordered `t1 = (b−d)/a`, `t2 = (b+d)/a`
 * (d = √disc) so the pairing still matches `calcRootCode`'s winding convention.
 *
 * Uses the numerically-stable q-form instead of the naive `(b∓d)/a`: on a flat or
 * grazing curve `b ≈ d`, and `(b−d)` catastrophically cancels in f32 — a real
 * rim-fringe artifact on near-tangent curves. `q = b + sign(b)·d` adds same-sign
 * terms (no cancellation); the two roots are `q/a` and `c/q` (Vieta's `t1·t2 = c/a`),
 * assigned by sign(b) to preserve the ordering above. Two guards:
 *   - a ≈ 0  → the curve is linear along this axis; use the single linear root.
 *   - d ≈ 0  → tangent/grazing (disc clamped to 0); the stable `c/q` pairing drifts
 *              off the true double root, so fold both to the extremum `b/a`.
 * (Kept faithful to Lengyel's reference; the naive form got the grazing case for free.)
 *
 * Must be called inside a Fn() TSL context.
 */
function stableRoots(a: Node<'float'>, b: Node<'float'>, c: Node<'float'>) {
  const disc = max(b.mul(b).sub(a.mul(c)), 0.0)
  const d = sqrt(disc)

  // sign(b) via select so b == 0 yields +1 (avoids q == 0 → div-by-zero).
  const bPos = b.greaterThanEqual(0.0)
  const q = b.add(select(bPos, float(1.0), float(-1.0)).mul(d))
  const rootA = q.div(a) // (b+d)/a when b>=0, (b-d)/a when b<0
  const rootB = c.div(q) // paired Vieta root

  const extremum = b.div(a)
  const grazing = d.lessThan(1.0 / 65536.0)
  const t1 = select(grazing, extremum, select(bPos, rootB, rootA))
  const t2 = select(grazing, extremum, select(bPos, rootA, rootB))

  const nearLinear = abs(a).lessThan(1.0 / 65536.0)
  const tLin = c.div(b.mul(2.0))
  return vec2(select(nearLinear, tLin, t1), select(nearLinear, tLin, t2))
}

/**
 * Solve the quadratic intersection of a curve with a horizontal ray (y = 0).
 *
 * Given control points (p0, p1, p2) already translated so the ray is at y=0,
 * returns vec2(x1, x2) -- the x-coordinates of the two intersection points.
 *
 * Must be called inside a Fn() TSL context.
 */
export function solveHorizPoly(p0: Node<'vec2'>, p1: Node<'vec2'>, p2: Node<'vec2'>) {
  const a = p0.y.sub(p1.y.mul(2.0)).add(p2.y)
  const b = p0.y.sub(p1.y)
  const c = p0.y

  const ax = p0.x.sub(p1.x.mul(2.0)).add(p2.x)
  const bx = p0.x.sub(p1.x)

  const t = stableRoots(a, b, c)
  const x1 = ax.mul(t.x).sub(bx.mul(2.0)).mul(t.x).add(p0.x)
  const x2 = ax.mul(t.y).sub(bx.mul(2.0)).mul(t.y).add(p0.x)

  return vec2(x1, x2)
}

/**
 * Solve the quadratic intersection of a curve with a vertical ray (x = 0).
 * Same as solveHorizPoly but with x and y swapped.
 *
 * Must be called inside a Fn() TSL context.
 */
export function solveVertPoly(p0: Node<'vec2'>, p1: Node<'vec2'>, p2: Node<'vec2'>) {
  const a = p0.x.sub(p1.x.mul(2.0)).add(p2.x)
  const b = p0.x.sub(p1.x)
  const c = p0.x

  const ay = p0.y.sub(p1.y.mul(2.0)).add(p2.y)
  const by = p0.y.sub(p1.y)

  const t = stableRoots(a, b, c)
  const y1 = ay.mul(t.x).sub(by.mul(2.0)).mul(t.x).add(p0.y)
  const y2 = ay.mul(t.y).sub(by.mul(2.0)).mul(t.y).add(p0.y)

  return vec2(y1, y2)
}
