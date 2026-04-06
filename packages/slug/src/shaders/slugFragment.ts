import {
  float,
  vec2,
  int,
  uint,
  Loop,
  textureLoad,
  ivec2,
  fwidth,
  abs,
  max,
  saturate,
  clamp,
  select,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { calcRootCode } from './calcRootCode.js'
import { solveHorizPoly, solveVertPoly } from './solveQuadratic.js'
import { calcCoverage } from './calcCoverage.js'

import type { DataTexture } from 'three'

/** Maximum curves per band to iterate in the shader. */
const MAX_CURVES_PER_BAND = 64

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
) {
  // Compute pixel footprint in em-space for coverage scaling
  const emsPerPixel = fwidth(renderCoord)
  const pixelsPerEmX = float(1.0).div(max(emsPerPixel.x, 1e-10))
  const pixelsPerEmY = float(1.0).div(max(emsPerPixel.y, 1e-10))

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
  const hBandHeader = textureLoad(bandTexture, ivec2(glyphLocXi.add(int(bandIdxY)), glyphLocYi))
  const hCurveCount = int(hBandHeader.x)
  const hCurveListOffset = int(hBandHeader.y)

  Loop(MAX_CURVES_PER_BAND, ({ i }) => {
    const inBounds = i.lessThan(hCurveCount)

    const refData = textureLoad(
      bandTexture,
      ivec2(glyphLocXi.add(hCurveListOffset).add(i), glyphLocYi),
    )
    const curveTexX = int(refData.x)
    const curveTexY = int(refData.y)

    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    const p0 = vec2(texel0.x, texel0.y).sub(renderCoord)
    const p1 = vec2(texel0.z, texel0.w).sub(renderCoord)
    const p2 = vec2(texel1.x, texel1.y).sub(renderCoord)

    const rootCode = calcRootCode(p0.y, p1.y, p2.y)

    const r = solveHorizPoly(p0, p1, p2)
    const rpxX = r.x.mul(pixelsPerEmX)
    const rpxY = r.y.mul(pixelsPerEmX)

    const hasRoot1 = rootCode.bitAnd(uint(1)).greaterThan(uint(0))
    const active1 = inBounds.and(hasRoot1)
    xcov.addAssign(select(active1, saturate(rpxX.add(0.5)), 0.0))

    const hasRoot2 = rootCode.bitAnd(uint(0x100)).greaterThan(uint(0))
    const active2 = inBounds.and(hasRoot2)
    xcov.subAssign(select(active2, saturate(rpxY.add(0.5)), 0.0))

    const w1 = saturate(float(1.0).sub(abs(rpxX).mul(2.0)))
    const w2 = saturate(float(1.0).sub(abs(rpxY).mul(2.0)))
    const curveWgt = max(
      select(active1, w1, 0.0),
      select(active2, w2, 0.0),
    )
    xwgt.assign(max(xwgt, curveWgt))
  })

  // --- Vertical band pass ---
  const vBandHeader = textureLoad(
    bandTexture,
    ivec2(glyphLocXi.add(int(numHBands)).add(int(bandIdxX)), glyphLocYi),
  )
  const vCurveCount = int(vBandHeader.x)
  const vCurveListOffset = int(vBandHeader.y)

  Loop(MAX_CURVES_PER_BAND, ({ i }) => {
    const inBounds = i.lessThan(vCurveCount)

    const refData = textureLoad(
      bandTexture,
      ivec2(glyphLocXi.add(vCurveListOffset).add(i), glyphLocYi),
    )
    const curveTexX = int(refData.x)
    const curveTexY = int(refData.y)

    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    const p0 = vec2(texel0.x, texel0.y).sub(renderCoord)
    const p1 = vec2(texel0.z, texel0.w).sub(renderCoord)
    const p2 = vec2(texel1.x, texel1.y).sub(renderCoord)

    const rootCode = calcRootCode(p0.x, p1.x, p2.x)
    const r = solveVertPoly(p0, p1, p2)
    const rpyX = r.x.mul(pixelsPerEmY)
    const rpyY = r.y.mul(pixelsPerEmY)

    const hasRoot1 = rootCode.bitAnd(uint(1)).greaterThan(uint(0))
    const active1 = inBounds.and(hasRoot1)
    ycov.addAssign(select(active1, saturate(rpyX.add(0.5)), 0.0))

    const hasRoot2 = rootCode.bitAnd(uint(0x100)).greaterThan(uint(0))
    const active2 = inBounds.and(hasRoot2)
    ycov.subAssign(select(active2, saturate(rpyY.add(0.5)), 0.0))

    const w1 = saturate(float(1.0).sub(abs(rpyX).mul(2.0)))
    const w2 = saturate(float(1.0).sub(abs(rpyY).mul(2.0)))
    const curveWgt = max(
      select(active1, w1, 0.0),
      select(active2, w2, 0.0),
    )
    ywgt.assign(max(ywgt, curveWgt))
  })

  return calcCoverage(xcov, xwgt, ycov, ywgt, evenOdd, weightBoost)
}
