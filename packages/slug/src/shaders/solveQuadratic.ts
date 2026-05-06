import { vec2, select, abs, sqrt, max } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

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

  const disc = max(b.mul(b).sub(a.mul(c)), 0.0)
  const d = sqrt(disc)

  const nearLinear = abs(a).lessThan(1.0 / 65536.0)

  const t1q = b.sub(d).div(a)
  const t2q = b.add(d).div(a)
  const tLin = c.div(b.mul(2.0))

  const t1 = select(nearLinear, tLin, t1q)
  const t2 = select(nearLinear, tLin, t2q)

  const x1 = ax.mul(t1).sub(bx.mul(2.0)).mul(t1).add(p0.x)
  const x2 = ax.mul(t2).sub(bx.mul(2.0)).mul(t2).add(p0.x)

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

  const disc = max(b.mul(b).sub(a.mul(c)), 0.0)
  const d = sqrt(disc)

  const nearLinear = abs(a).lessThan(1.0 / 65536.0)

  const t1q = b.sub(d).div(a)
  const t2q = b.add(d).div(a)
  const tLin = c.div(b.mul(2.0))

  const t1 = select(nearLinear, tLin, t1q)
  const t2 = select(nearLinear, tLin, t2q)

  const y1 = ay.mul(t1).sub(by.mul(2.0)).mul(t1).add(p0.y)
  const y2 = ay.mul(t2).sub(by.mul(2.0)).mul(t2).add(p0.y)

  return vec2(y1, y2)
}
