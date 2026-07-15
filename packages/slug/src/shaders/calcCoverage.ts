import { float, abs, max, min, select, saturate, sqrt } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Combine horizontal and vertical coverage into final antialiased coverage.
 *
 * Uses the weighted blend with fallback from Lengyel's algorithm:
 *   coverage = max(|xcov*xwgt + ycov*ywgt| / max(xwgt+ywgt, e), min(|xcov|, |ycov|))
 *
 * Optional stem darkening boosts thin strokes at small ppem (FreeType-style):
 *   darken = clamp(stemDarken / ppem, 0, 0.5)
 *   coverage += darken * coverage * (1 - coverage)
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
  stemDarken?: Node<'float'>,
  ppem?: Node<'float'>
) {
  const epsilon = float(1.0 / 65536.0)

  const weighted = abs(xcov.mul(xwgt).add(ycov.mul(ywgt))).div(max(xwgt.add(ywgt), epsilon))

  const fallback = min(abs(xcov), abs(ycov))
  // .toVar(): rawCoverage feeds both branches of the select below (select evaluates both), so
  // without it the weighted+fallback chain computes twice.
  const rawCoverage = max(weighted, fallback).toVar()

  const nonzeroCov = saturate(rawCoverage)
  const evenOddCov = float(1.0).sub(abs(float(1.0).sub(rawCoverage.mul(0.5).fract().mul(2.0))))

  // .toVar() + .assign(): both selects evaluate both operands and filledCov is reused across the
  // stem-darken math — a plain `let` re-inlines the whole chain at each reference.
  const filledCov = select(evenOdd, evenOddCov, nonzeroCov).toVar()
  filledCov.assign(select(weightBoost, sqrt(filledCov), filledCov))

  // Stem darkening: boost semi-transparent pixels at small ppem.
  // Ramps from full strength at ppem=0 down to zero at ppem>=24.
  // darken * cov * (1 - cov) peaks at cov=0.5 and is zero at 0 or 1,
  // so fully opaque/transparent pixels are unaffected.
  if (stemDarken && ppem) {
    const darkenPpem = float(24.0)
    const darken = stemDarken.mul(max(float(0.0), float(1.0).sub(ppem.div(darkenPpem))))
    filledCov.assign(min(filledCov.add(darken.mul(filledCov).mul(float(1.0).sub(filledCov))), float(1.0)))
  }

  return filledCov
}
