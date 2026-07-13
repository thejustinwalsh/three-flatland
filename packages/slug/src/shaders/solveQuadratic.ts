import { vec2, select, abs, sqrt, float, If } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Two real roots of `a·t² − 2b·t + c = 0`, ordered `t1 = (b−d)/a`, `t2 = (b+d)/a`
 * (d = √disc) so the pairing matches `calcRootCode`'s winding convention.
 *
 * Imperative `If/ElseIf/Else` (NOT `select`): `select` evaluates every operand, so a
 * branchless form would pay all four divisions on every fragment; the common path
 * here needs only two. No derivatives occur, so branching is safe. Three cases:
 *   - a ≈ 0        → curve is linear along this axis; single linear root.
 *   - discRaw ≤ 0  → tangent (=0) or no real crossing (<0, skipped by rootCode); both
 *                    roots fold to the extremum b/a. Guarding on the PRE-CLAMP
 *                    discriminant is the only correct grazing test — root separation is
 *                    2d/|a|, so a small |d| (or |q|) does NOT imply a double root when a
 *                    is also small, and an absolute threshold collapses distinct roots.
 *   - else         → distinct real roots via the numerically-stable q-form
 *                    (q = b + sign(b)·d; roots q/a and c/q via Vieta), which avoids the
 *                    catastrophic cancellation of the naive `(b−d)/a` on flat curves.
 *
 * Must be called inside a Fn() TSL context.
 */
function stableRoots(a: Node<'float'>, b: Node<'float'>, c: Node<'float'>) {
  const discRaw = b.mul(b).sub(a.mul(c))
  const t1 = float(0).toVar()
  const t2 = float(0).toVar()

  If(abs(a).lessThan(1.0 / 65536.0), () => {
    const tLin = c.div(b.mul(2.0))
    t1.assign(tLin)
    t2.assign(tLin)
  })
    .ElseIf(discRaw.lessThanEqual(0.0), () => {
      const extremum = b.div(a)
      t1.assign(extremum)
      t2.assign(extremum)
    })
    .Else(() => {
      const d = sqrt(discRaw)
      const bPos = b.greaterThanEqual(0.0)
      const q = b.add(select(bPos, float(1.0), float(-1.0)).mul(d))
      const rootA = q.div(a) // (b+d)/a when b>=0, (b-d)/a when b<0
      const rootB = c.div(q) // paired Vieta root
      t1.assign(select(bPos, rootB, rootA))
      t2.assign(select(bPos, rootA, rootB))
    })

  return vec2(t1, t2)
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
