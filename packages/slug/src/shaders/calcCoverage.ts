import { float, abs, max, min, select, saturate, sqrt } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Combine horizontal and vertical coverage into final antialiased coverage.
 *
 * Uses the weighted blend with fallback from Lengyel's algorithm:
 *   coverage = max(|xcov*xwgt + ycov*ywgt| / max(xwgt+ywgt, e), min(|xcov|, |ycov|))
 *
 * Must be called inside a Fn() TSL context.
 */
export function calcCoverage(
  xcov: Node<'float'>,
  xwgt: Node<'float'>,
  ycov: Node<'float'>,
  ywgt: Node<'float'>,
  evenOdd: Node<'bool'>,
  weightBoost: Node<'bool'>,
) {
  const epsilon = float(1.0 / 65536.0)

  const weighted = abs(
    xcov.mul(xwgt).add(ycov.mul(ywgt)),
  ).div(max(xwgt.add(ywgt), epsilon))

  const fallback = min(abs(xcov), abs(ycov))
  const rawCoverage = max(weighted, fallback)

  const nonzeroCov = saturate(rawCoverage)
  const evenOddCov = float(1.0).sub(
    abs(float(1.0).sub(rawCoverage.mul(0.5).fract().mul(2.0))),
  )

  const filledCov = select(evenOdd, evenOddCov, nonzeroCov)
  return select(weightBoost, sqrt(filledCov), filledCov)
}
