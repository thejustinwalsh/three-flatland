import {
  float,
  vec2,
  int,
  uint,
  Loop,
  Break,
  textureLoad,
  ivec2,
  fwidth,
  abs,
  max,
  saturate,
  clamp,
  select,
  If,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { calcRootCode } from './calcRootCode.js'
import { solveHorizPoly, solveVertPoly } from './solveQuadratic.js'
import { calcCoverage } from './calcCoverage.js'

import type { DataTexture } from 'three'

/** log2(TEXTURE_WIDTH) for row-wrapping bit ops. */
const LOG_TEXTURE_WIDTH = 12 // 2^12 = 4096
const TEXTURE_WIDTH_MASK = (1 << LOG_TEXTURE_WIDTH) - 1 // 4095

/**
 * Defensive per-fragment loop cap. The band curve count is read straight from a
 * texture, and baked fonts can be fetched from external URLs — a corrupt/hostile
 * `.slug.glb` could carry a garbage count and spin the (now dynamic) loop into a GPU
 * watchdog / device loss. Clamp far above any real font's densest band (even adaptive
 * CJK bands stay well under this) so legitimate glyphs never truncate — only runaway
 * data. `min(read, cap)` is still a runtime bound, so the loop stays dynamic (no unroll).
 */
const MAX_SAFE_BAND_CURVES = 512

/**
 * Wrap a linear texel offset into (x, y) coordinates for a 4096-wide texture.
 * Handles offsets that cross row boundaries.
 */
function wrapTexCoord(baseX: Node<'int'>, baseY: Node<'int'>, offset: Node<'int'>) {
  const linearX = baseX.add(offset)
  const wrappedY = baseY.add(linearX.shiftRight(LOG_TEXTURE_WIDTH))
  const wrappedX = linearX.bitAnd(TEXTURE_WIDTH_MASK)
  return ivec2(wrappedX, wrappedY)
}

/**
 * Evaluate the Slug algorithm for a single fragment.
 *
 * Casts dual rays (horizontal + vertical) per pixel, solves quadratic
 * equations to find curve intersections, computes winding number, and
 * returns fractional coverage in [0, 1].
 *
 * Must be called inside a Fn() TSL context.
 */
export function slugRender(
  curveTexture: DataTexture,
  bandTexture: DataTexture,
  renderCoord: Node<'vec2'>,
  glyphLocX: Node<'float'>,
  glyphLocY: Node<'float'>,
  numHBands: Node<'float'>,
  numVBands: Node<'float'>,
  bandTransform: Node<'vec4'>,
  evenOdd: Node<'bool'>,
  weightBoost: Node<'bool'>,
  stemDarken?: Node<'float'>,
  thicken?: Node<'float'>
) {
  // Compute pixel footprint in em-space for coverage scaling. These are per-FRAGMENT invariants
  // reused inside BOTH band loops; .toVar() forces them to be computed ONCE (hoisted above the
  // loops) instead of TSL re-inlining them at every iteration — critically fwidth(), a derivative
  // op that must not be evaluated per-curve.
  const emsPerPixel = fwidth(renderCoord).toVar()
  const pixelsPerEmX = float(1.0)
    .div(max(emsPerPixel.x, 1.0 / 65536.0))
    .toVar()
  const pixelsPerEmY = float(1.0)
    .div(max(emsPerPixel.y, 1.0 / 65536.0))
    .toVar()

  // Pixels-per-em (isotropic average) for stem darkening and thickening
  const ppem = pixelsPerEmX.add(pixelsPerEmY).mul(0.5).toVar()

  // Thickening: widen coverage window at small ppem to prevent thin-stroke dropout.
  // Factor ramps from 1+thicken at ppem=0 down to 1.0 at ppem>=thickenPpem (24).
  // At 8px with thicken=1.0: factor = 1 + 1.0 * max(0, 1 - 8/24) = 1.67
  const thickenPpem = float(24.0)
  // .toVar(): used 4× inside the two loops — hoist so its div/sub/mul/max runs once, not per curve.
  const thickenFactor = thicken
    ? float(1.0)
        .add(thicken.mul(max(float(0.0), float(1.0).sub(ppem.div(thickenPpem)))))
        .toVar()
    : float(1.0)

  // Determine band indices from band transform
  const bandIdxX = clamp(
    renderCoord.x.mul(bandTransform.x).add(bandTransform.z),
    0,
    numVBands.sub(1)
  )
  const bandIdxY = clamp(
    renderCoord.y.mul(bandTransform.y).add(bandTransform.w),
    0,
    numHBands.sub(1)
  )

  const glyphLocXi = int(glyphLocX)
  const glyphLocYi = int(glyphLocY)

  // Accumulators
  const xcov = float(0.0).toVar()
  const xwgt = float(0.0).toVar()
  const ycov = float(0.0).toVar()
  const ywgt = float(0.0).toVar()

  // --- Horizontal band pass ---
  // Band header at (glyphLoc + bandIdxY)
  const hBandCoord = wrapTexCoord(glyphLocXi, glyphLocYi, int(bandIdxY))
  const hBandHeader = textureLoad(bandTexture, hBandCoord)
  const hRawCount = int(hBandHeader.x)
  const hCurveCount = select(
    hRawCount.greaterThan(int(MAX_SAFE_BAND_CURVES)),
    int(MAX_SAFE_BAND_CURVES),
    hRawCount
  )
  const hCurveListOffset = int(hBandHeader.y)

  // Dynamic loop bound: iterate exactly this band's curve count (from the band
  // header), like Lengyel's/JSlug's reference. A compile-time bound forced the
  // compiler to reserve registers for the worst case on EVERY fragment; a runtime
  // bound can't be unrolled, so register pressure tracks the real (small) per-band
  // count. It also removes the old truncation risk — a band denser than the former
  // 40-curve cap now renders correctly instead of dropping curves.
  Loop({ start: 0, end: hCurveCount, type: 'int' }, ({ i }) => {
    // Read curve reference with row wrapping
    const refCoord = wrapTexCoord(glyphLocXi, glyphLocYi, hCurveListOffset.add(i))
    const refData = textureLoad(bandTexture, refCoord)

    // Early exit on sorted max-X — BEFORE the two curve-texel loads. Curves are
    // sorted descending by max-X, so once a curve's hull is >0.5px left of the
    // pixel, all remaining are too. refData.y is the curve's max-x hull in
    // em-space (pre-subtraction), baked from the SAME half-float texels this
    // shader decodes, so `(hull - renderCoord.x)*ppem` is bit-identical to the
    // old post-load `max(p0.x,p1.x,p2.x)*ppem` — but skips the terminal curve's
    // texel reads (perf win #2). pixelsPerEmX/renderCoord are hoisted vars.
    If(refData.y.sub(renderCoord.x).mul(pixelsPerEmX).lessThan(-0.5), () => {
      Break()
    })

    // Unpack the packed curve-texel coord: x = packed & (W-1), y = packed >> log2(W).
    const packed = int(refData.x).toVar()
    const curveTexX = packed.bitAnd(TEXTURE_WIDTH_MASK).toVar()
    const curveTexY = packed.shiftRight(LOG_TEXTURE_WIDTH).toVar()

    // Load 3 control points from curve texture (2 consecutive texels)
    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    // Control points relative to pixel position
    const p0 = vec2(texel0.x, texel0.y).sub(renderCoord)
    const p1 = vec2(texel0.z, texel0.w).sub(renderCoord)
    const p2 = vec2(texel1.x, texel1.y).sub(renderCoord)

    // Root eligibility — if both roots are ineligible (rootCode == 0) the
    // curve doesn't cross the horizontal ray at all and contributes nothing.
    // Skip the sqrt + divisions + saturates + weight math in that case.
    const rootCode = calcRootCode(p0.y, p1.y, p2.y)

    If(rootCode.greaterThan(uint(0)), () => {
      const r = solveHorizPoly(p0, p1, p2)
      // .toVar(): each used twice (coverage + weight); without it r.x/r.y — and the whole poly
      // eval behind them — re-inline per use.
      const rpxX = r.x.mul(pixelsPerEmX).toVar()
      const rpxY = r.y.mul(pixelsPerEmX).toVar()

      // Coverage from first root (bit 0)
      const hasRoot1 = rootCode.bitAnd(uint(1)).greaterThan(uint(0)).toVar()
      xcov.addAssign(select(hasRoot1, saturate(rpxX.mul(thickenFactor).add(0.5)), 0.0))

      // Coverage from second root (bit 8)
      const hasRoot2 = rootCode.bitAnd(uint(0x100)).greaterThan(uint(0)).toVar()
      xcov.subAssign(select(hasRoot2, saturate(rpxY.mul(thickenFactor).add(0.5)), 0.0))

      // Weight: proximity to pixel center
      const w1 = saturate(float(1.0).sub(abs(rpxX).mul(2.0)))
      const w2 = saturate(float(1.0).sub(abs(rpxY).mul(2.0)))
      const curveWgt = max(select(hasRoot1, w1, 0.0), select(hasRoot2, w2, 0.0))
      xwgt.assign(max(xwgt, curveWgt))
    })
  })

  // --- Vertical band pass ---
  // Band header at (glyphLoc + numHBands + bandIdxX)
  const vBandCoord = wrapTexCoord(glyphLocXi, glyphLocYi, int(numHBands).add(int(bandIdxX)))
  const vBandHeader = textureLoad(bandTexture, vBandCoord)
  const vRawCount = int(vBandHeader.x)
  const vCurveCount = select(
    vRawCount.greaterThan(int(MAX_SAFE_BAND_CURVES)),
    int(MAX_SAFE_BAND_CURVES),
    vRawCount
  )
  const vCurveListOffset = int(vBandHeader.y)

  // Dynamic loop bound — see the horizontal pass above.
  Loop({ start: 0, end: vCurveCount, type: 'int' }, ({ i }) => {
    const refCoord = wrapTexCoord(glyphLocXi, glyphLocYi, vCurveListOffset.add(i))
    const refData = textureLoad(bandTexture, refCoord)

    // Early exit on sorted max-Y — BEFORE the curve loads. refData.y is this
    // curve's max-y hull (em-space), so the test is bit-identical to the old
    // post-load `max(p0.y,p1.y,p2.y)*ppem`. See the horizontal pass above.
    If(refData.y.sub(renderCoord.y).mul(pixelsPerEmY).lessThan(-0.5), () => {
      Break()
    })

    const packed = int(refData.x).toVar()
    const curveTexX = packed.bitAnd(TEXTURE_WIDTH_MASK).toVar()
    const curveTexY = packed.shiftRight(LOG_TEXTURE_WIDTH).toVar()

    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    const p0 = vec2(texel0.x, texel0.y).sub(renderCoord)
    const p1 = vec2(texel0.z, texel0.w).sub(renderCoord)
    const p2 = vec2(texel1.x, texel1.y).sub(renderCoord)

    const rootCode = calcRootCode(p0.x, p1.x, p2.x)

    If(rootCode.greaterThan(uint(0)), () => {
      const r = solveVertPoly(p0, p1, p2)
      // .toVar(): each used twice (coverage + weight) — see the horizontal pass.
      const rpyX = r.x.mul(pixelsPerEmY).toVar()
      const rpyY = r.y.mul(pixelsPerEmY).toVar()

      // Vertical band: signs INVERTED vs horizontal per Lengyel's convention
      const hasRoot1 = rootCode.bitAnd(uint(1)).greaterThan(uint(0)).toVar()
      ycov.subAssign(select(hasRoot1, saturate(rpyX.mul(thickenFactor).add(0.5)), 0.0))

      const hasRoot2 = rootCode.bitAnd(uint(0x100)).greaterThan(uint(0)).toVar()
      ycov.addAssign(select(hasRoot2, saturate(rpyY.mul(thickenFactor).add(0.5)), 0.0))

      const w1 = saturate(float(1.0).sub(abs(rpyX).mul(2.0)))
      const w2 = saturate(float(1.0).sub(abs(rpyY).mul(2.0)))
      const curveWgt = max(select(hasRoot1, w1, 0.0), select(hasRoot2, w2, 0.0))
      ywgt.assign(max(ywgt, curveWgt))
    })
  })

  return calcCoverage(xcov, xwgt, ycov, ywgt, evenOdd, weightBoost, stemDarken, ppem)
}
