import type { QuadCurve, GlyphBounds, GlyphBands, Band } from '../types.js'

/** Default number of bands per axis. */
const DEFAULT_BAND_COUNT = 8

/** Overlap epsilon in em-space for assigning curves to bands. */
const BAND_EPSILON = 1 / 1024

/**
 * Build horizontal and vertical band acceleration structures for a set of curves.
 * Curves are assigned to overlapping bands and sorted for early-exit in the shader.
 */
export function buildBands(
  curves: QuadCurve[],
  bounds: GlyphBounds,
  bandCount: number = DEFAULT_BAND_COUNT,
): GlyphBands {
  const hBands = buildAxisBands(curves, bounds, bandCount, 'horizontal')
  const vBands = buildAxisBands(curves, bounds, bandCount, 'vertical')
  return { hBands, vBands }
}

function buildAxisBands(
  curves: QuadCurve[],
  bounds: GlyphBounds,
  bandCount: number,
  axis: 'horizontal' | 'vertical',
): Band[] {
  const isHorizontal = axis === 'horizontal'

  // For horizontal bands: partition Y axis, sort by descending max-X
  // For vertical bands: partition X axis, sort by descending max-Y
  const bandMin = isHorizontal ? bounds.yMin : bounds.xMin
  const bandMax = isHorizontal ? bounds.yMax : bounds.xMax
  const bandRange = bandMax - bandMin

  if (bandRange <= 0) {
    return Array.from({ length: bandCount }, () => ({ curveIndices: [] }))
  }

  const bandSize = bandRange / bandCount
  const bands: Band[] = Array.from({ length: bandCount }, () => ({ curveIndices: [] }))

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i]!

    // Get the curve's range along the band axis
    let curveMin: number
    let curveMax: number
    if (isHorizontal) {
      // Horizontal bands partition Y — skip purely horizontal curves
      curveMin = Math.min(curve.p0y, curve.p1y, curve.p2y)
      curveMax = Math.max(curve.p0y, curve.p1y, curve.p2y)

      // Skip purely horizontal curves (can't intersect horizontal ray)
      if (curveMax - curveMin < 1e-10) continue
    } else {
      // Vertical bands partition X — skip purely vertical curves
      curveMin = Math.min(curve.p0x, curve.p1x, curve.p2x)
      curveMax = Math.max(curve.p0x, curve.p1x, curve.p2x)

      // Skip purely vertical curves (can't intersect vertical ray)
      if (curveMax - curveMin < 1e-10) continue
    }

    // Assign curve to all overlapping bands (with epsilon overlap)
    const startBand = Math.max(0, Math.floor((curveMin - bandMin - BAND_EPSILON) / bandSize))
    const endBand = Math.min(bandCount - 1, Math.floor((curveMax - bandMin + BAND_EPSILON) / bandSize))

    for (let b = startBand; b <= endBand; b++) {
      bands[b]!.curveIndices.push(i)
    }
  }

  // Sort curves within each band for early-exit optimization
  for (const band of bands) {
    if (isHorizontal) {
      // Sort by descending max-X (shader exits when curve max-X < pixel X)
      band.curveIndices.sort((a, b) => {
        const ca = curves[a]!
        const cb = curves[b]!
        const maxA = Math.max(ca.p0x, ca.p1x, ca.p2x)
        const maxB = Math.max(cb.p0x, cb.p1x, cb.p2x)
        return maxB - maxA
      })
    } else {
      // Sort by descending max-Y
      band.curveIndices.sort((a, b) => {
        const ca = curves[a]!
        const cb = curves[b]!
        const maxA = Math.max(ca.p0y, ca.p1y, ca.p2y)
        const maxB = Math.max(cb.p0y, cb.p1y, cb.p2y)
        return maxB - maxA
      })
    }
  }

  return bands
}
