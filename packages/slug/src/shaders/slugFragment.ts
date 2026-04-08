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

/** Maximum curves per band to iterate in the shader. */
const MAX_CURVES_PER_BAND = 64

/** log2(TEXTURE_WIDTH) for row-wrapping bit ops. */
const LOG_TEXTURE_WIDTH = 12 // 2^12 = 4096
const TEXTURE_WIDTH_MASK = (1 << LOG_TEXTURE_WIDTH) - 1 // 4095

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
  thicken?: Node<'float'>,
) {
  // Compute pixel footprint in em-space for coverage scaling
  const emsPerPixel = fwidth(renderCoord)
  const pixelsPerEmX = float(1.0).div(max(emsPerPixel.x, 1.0 / 65536.0))
  const pixelsPerEmY = float(1.0).div(max(emsPerPixel.y, 1.0 / 65536.0))

  // Pixels-per-em (isotropic average) for stem darkening and thickening
  const ppem = pixelsPerEmX.add(pixelsPerEmY).mul(0.5)

  // Thickening: widen coverage window at small ppem to prevent thin-stroke dropout.
  // Factor ramps from 1+thicken at ppem=0 down to 1.0 at ppem>=thickenPpem (24).
  // At 8px with thicken=1.0: factor = 1 + 1.0 * max(0, 1 - 8/24) = 1.67
  const thickenPpem = float(24.0)
  const thickenFactor = thicken
    ? float(1.0).add(thicken.mul(max(float(0.0), float(1.0).sub(ppem.div(thickenPpem)))))
    : float(1.0)

  // Determine band indices from band transform
  const bandIdxX = clamp(
    renderCoord.x.mul(bandTransform.x).add(bandTransform.z),
    0,
    numVBands.sub(1),
  )
  const bandIdxY = clamp(
    renderCoord.y.mul(bandTransform.y).add(bandTransform.w),
    0,
    numHBands.sub(1),
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
  const hCurveCount = int(hBandHeader.x)
  const hCurveListOffset = int(hBandHeader.y)

  Loop(MAX_CURVES_PER_BAND, ({ i }) => {
    // Early exit when past curve count
    If(i.greaterThanEqual(hCurveCount), () => { Break() })

    // Read curve reference with row wrapping
    const refCoord = wrapTexCoord(glyphLocXi, glyphLocYi, hCurveListOffset.add(i))
    const refData = textureLoad(bandTexture, refCoord)
    const curveTexX = int(refData.x)
    const curveTexY = int(refData.y)

    // Load 3 control points from curve texture (2 consecutive texels)
    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    // Control points relative to pixel position
    const p0 = vec2(texel0.x, texel0.y).sub(renderCoord)
    const p1 = vec2(texel0.z, texel0.w).sub(renderCoord)
    const p2 = vec2(texel1.x, texel1.y).sub(renderCoord)

    // Early exit on sorted max-X: curves are sorted descending by max X,
    // so if this curve's max X is left of pixel, all remaining are too
    const maxX = max(max(p0.x, p1.x), p2.x).mul(pixelsPerEmX)
    If(maxX.lessThan(-0.5), () => { Break() })

    // Root eligibility
    const rootCode = calcRootCode(p0.y, p1.y, p2.y)

    // Solve intersection
    const r = solveHorizPoly(p0, p1, p2)
    const rpxX = r.x.mul(pixelsPerEmX)
    const rpxY = r.y.mul(pixelsPerEmX)

    // Coverage from first root (bit 0)
    const hasRoot1 = rootCode.bitAnd(uint(1)).greaterThan(uint(0))
    xcov.addAssign(select(hasRoot1, saturate(rpxX.mul(thickenFactor).add(0.5)), 0.0))

    // Coverage from second root (bit 8)
    const hasRoot2 = rootCode.bitAnd(uint(0x100)).greaterThan(uint(0))
    xcov.subAssign(select(hasRoot2, saturate(rpxY.mul(thickenFactor).add(0.5)), 0.0))

    // Weight: proximity to pixel center
    const w1 = saturate(float(1.0).sub(abs(rpxX).mul(2.0)))
    const w2 = saturate(float(1.0).sub(abs(rpxY).mul(2.0)))
    const curveWgt = max(
      select(hasRoot1, w1, 0.0),
      select(hasRoot2, w2, 0.0),
    )
    xwgt.assign(max(xwgt, curveWgt))
  })

  // --- Vertical band pass ---
  // Band header at (glyphLoc + numHBands + bandIdxX)
  const vBandCoord = wrapTexCoord(glyphLocXi, glyphLocYi, int(numHBands).add(int(bandIdxX)))
  const vBandHeader = textureLoad(bandTexture, vBandCoord)
  const vCurveCount = int(vBandHeader.x)
  const vCurveListOffset = int(vBandHeader.y)

  Loop(MAX_CURVES_PER_BAND, ({ i }) => {
    If(i.greaterThanEqual(vCurveCount), () => { Break() })

    const refCoord = wrapTexCoord(glyphLocXi, glyphLocYi, vCurveListOffset.add(i))
    const refData = textureLoad(bandTexture, refCoord)
    const curveTexX = int(refData.x)
    const curveTexY = int(refData.y)

    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    const p0 = vec2(texel0.x, texel0.y).sub(renderCoord)
    const p1 = vec2(texel0.z, texel0.w).sub(renderCoord)
    const p2 = vec2(texel1.x, texel1.y).sub(renderCoord)

    // Early exit on sorted max-Y
    const maxY = max(max(p0.y, p1.y), p2.y).mul(pixelsPerEmY)
    If(maxY.lessThan(-0.5), () => { Break() })

    const rootCode = calcRootCode(p0.x, p1.x, p2.x)
    const r = solveVertPoly(p0, p1, p2)
    const rpyX = r.x.mul(pixelsPerEmY)
    const rpyY = r.y.mul(pixelsPerEmY)

    // Vertical band: signs INVERTED vs horizontal per Lengyel's convention
    const hasRoot1 = rootCode.bitAnd(uint(1)).greaterThan(uint(0))
    ycov.subAssign(select(hasRoot1, saturate(rpyX.mul(thickenFactor).add(0.5)), 0.0))

    const hasRoot2 = rootCode.bitAnd(uint(0x100)).greaterThan(uint(0))
    ycov.addAssign(select(hasRoot2, saturate(rpyY.mul(thickenFactor).add(0.5)), 0.0))

    const w1 = saturate(float(1.0).sub(abs(rpyX).mul(2.0)))
    const w2 = saturate(float(1.0).sub(abs(rpyY).mul(2.0)))
    const curveWgt = max(
      select(hasRoot1, w1, 0.0),
      select(hasRoot2, w2, 0.0),
    )
    ywgt.assign(max(ywgt, curveWgt))
  })

  return calcCoverage(xcov, xwgt, ycov, ywgt, evenOdd, weightBoost, stemDarken, ppem)
}
