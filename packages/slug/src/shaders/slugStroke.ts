import {
  float,
  vec2,
  int,
  Loop,
  Break,
  textureLoad,
  ivec2,
  fwidth,
  max,
  min,
  clamp,
  smoothstep,
  If,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { DataTexture } from 'three'
import { distanceToQuadBezier } from './distanceToQuadBezier.js'

/**
 * Phase 4 stroke fragment shader — analytic distance-to-curve, runtime-
 * uniform width, bevel-via-min at exterior joins.
 *
 * Unlike the fill shader (`slugRender`), this path computes the closest-
 * point distance from the fragment to each curve in the band, takes the
 * min, and outputs coverage via a crispness-gated smoothstep around
 * `strokeHalfWidth`. Joins fall out of `min(d)` naturally — at a contour
 * vertex where two curves meet, both curves' capsules contribute and
 * the boundary is the bisector, producing a clean bevel.
 *
 * Phase 5 will replace the naked `min` at exterior joins with an
 * endpoint-aware classifier that dispatches on `joinStyle` / `capStyle`
 * / dashing. This file has a labeled extension point marking where
 * that dispatch plugs in.
 *
 * Band probe: uses only the h-band at the fragment's y and the v-band
 * at the fragment's x, same as the fill shader. For text stroke widths
 * (≤ 0.05 em) this catches every curve whose capsule overlaps the
 * fragment — bands are sized per-glyph and typical text band cells are
 * comfortably larger than a hairline width. Phase 5 adds a `halfWidth`-
 * driven multi-band halo probe for thick shape strokes.
 */

/** Mirrors the bound in slugFragment.ts so bake-time warnings apply to both. */
const MAX_CURVES_PER_BAND = 40

const LOG_TEXTURE_WIDTH = 12
const TEXTURE_WIDTH_MASK = (1 << LOG_TEXTURE_WIDTH) - 1

function wrapTexCoord(baseX: Node<'int'>, baseY: Node<'int'>, offset: Node<'int'>) {
  const linearX = baseX.add(offset)
  const wrappedY = baseY.add(linearX.shiftRight(LOG_TEXTURE_WIDTH))
  const wrappedX = linearX.bitAnd(TEXTURE_WIDTH_MASK)
  return ivec2(wrappedX, wrappedY)
}

/**
 * Evaluate stroke coverage for a single fragment.
 *
 * @param curveTexture     — per-glyph curve control points (as used by slugRender)
 * @param bandTexture      — per-glyph band header + curve-list (as used by slugRender)
 * @param renderCoord      — em-space fragment coord (already dilated)
 * @param glyphLocX/Y      — band-texture row/col base for this glyph
 * @param numHBands/VBands — band counts for the glyph
 * @param bandTransform    — (scaleX, scaleY, offsetX, offsetY) → band indices
 * @param strokeHalfWidth  — stroke half-width in em-space (runtime uniform)
 *
 * Returns coverage in [0, 1]. The caller composites with fill coverage
 * when rendering both in one draw.
 */
export function slugStroke(
  curveTexture: DataTexture,
  bandTexture: DataTexture,
  renderCoord: Node<'vec2'>,
  glyphLocX: Node<'float'>,
  glyphLocY: Node<'float'>,
  numHBands: Node<'float'>,
  numVBands: Node<'float'>,
  bandTransform: Node<'vec4'>,
  strokeHalfWidth: Node<'float'>,
) {
  // Pixel footprint in em-space. The AA window scales with this so a
  // 0.5px stroke still appears as a visible 1px outline — the "crispness
  // gate" mentioned in the Phase 4 spec: we widen coverage by at least
  // half a pixel even when the nominal halfWidth is smaller, preventing
  // hairline dropout.
  const emsPerPixel = fwidth(renderCoord)
  const pixelEm = max(emsPerPixel.x, emsPerPixel.y)
  const aaHalf = pixelEm.mul(0.5)

  // Effective halfWidth — min hairline width = one pixel so we never
  // vanish. Trade: a 0.3px stroke bloats to 1px, which is the correct
  // behavior for legibility (matches FreeType's thickening.)
  const effHalf = max(strokeHalfWidth, aaHalf)

  // Band indices — same math as the fill shader.
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

  // Running min distance in em-space. Initialize to a value far enough
  // that any real curve wins — `1.0` em is way beyond any stroke width.
  const minDist = float(1.0).toVar()

  // --- Horizontal band pass ---
  const hBandCoord = wrapTexCoord(glyphLocXi, glyphLocYi, int(bandIdxY))
  const hBandHeader = textureLoad(bandTexture, hBandCoord)
  const hCurveCount = int(hBandHeader.x)
  const hCurveListOffset = int(hBandHeader.y)

  Loop(MAX_CURVES_PER_BAND, ({ i }) => {
    If(i.greaterThanEqual(hCurveCount), () => { Break() })

    const refCoord = wrapTexCoord(glyphLocXi, glyphLocYi, hCurveListOffset.add(i))
    const refData = textureLoad(bandTexture, refCoord)
    const curveTexX = int(refData.x)
    const curveTexY = int(refData.y)

    const texel0 = textureLoad(curveTexture, ivec2(curveTexX, curveTexY))
    const texel1 = textureLoad(curveTexture, ivec2(curveTexX.add(1), curveTexY))

    const p0 = vec2(texel0.x, texel0.y)
    const p1 = vec2(texel0.z, texel0.w)
    const p2 = vec2(texel1.x, texel1.y)

    const result = distanceToQuadBezier(renderCoord, p0, p1, p2)
    // `result` is vec2(distance, t). Phase 5: the endpoint-aware join
    // classifier hooks in here — check `result.y` (t) against 0/1 and
    // the curve's neighbor-tangent flags (loaded from the new third
    // texel), then dispatch to miter/round/bevel/cap logic which
    // accepts, rejects, or adjusts `result.x` before the min.
    minDist.assign(min(minDist, result.x))
  })

  // --- Vertical band pass ---
  // Covers curves that are near the fragment in x but not in the h-band
  // (e.g. curves with large vertical extent). Union with h-band reproduces
  // the fill shader's coverage of "any curve near the fragment".
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

    const p0 = vec2(texel0.x, texel0.y)
    const p1 = vec2(texel0.z, texel0.w)
    const p2 = vec2(texel1.x, texel1.y)

    const result = distanceToQuadBezier(renderCoord, p0, p1, p2)
    minDist.assign(min(minDist, result.x))
  })

  // Crispness-gated smoothstep. Coverage = 1 inside the stroke,
  // smoothly decays across the 1-pixel AA window at the outer edge.
  // `1 - smoothstep(low, high, d)` = 1 for d ≤ low, 0 for d ≥ high.
  const lo = effHalf.sub(aaHalf)
  const hi = effHalf.add(aaHalf)
  const coverage = float(1.0).sub(smoothstep(lo, hi, minDist))

  return coverage
}
