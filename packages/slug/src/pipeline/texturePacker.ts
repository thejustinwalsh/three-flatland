import {
  DataTexture,
  FloatType,
  RGBAFormat,
  UnsignedIntType,
  RGIntegerFormat,
  NearestFilter,
} from 'three'
import type { SlugGlyphData, SlugTextureData } from '../types.js'

/** Default texture width in texels (must be power of 2). */
const TEXTURE_WIDTH = 4096

/** Round up to next power of 2. */
function nextPow2(n: number): number {
  if (n <= 0) return 1
  n--
  n |= n >> 1
  n |= n >> 2
  n |= n >> 4
  n |= n >> 8
  n |= n >> 16
  return n + 1
}

/**
 * Pack all glyph curve and band data into GPU DataTextures.
 *
 * Curve Texture (RGBA32Float):
 *   - 2 texels per curve: [p0x, p0y, p1x, p1y] + [p2x, p2y, 0, 0]
 *   - Endpoint sharing: contiguous curves share texels
 *
 * Band Texture (RG32Uint):
 *   - Per glyph: [hBand headers][vBand headers][curve ref lists]
 *   - Header: (curveCount, offsetFromGlyphStart)
 *   - Curve ref: (texelX, texelY) → pointer into curve texture
 */
export function packTextures(glyphs: Map<number, SlugGlyphData>): SlugTextureData {
  // First pass: calculate total sizes
  let totalCurveTexels = 0
  let totalBandTexels = 0

  for (const glyph of glyphs.values()) {
    // Endpoint sharing: each contour of N curves needs N+1 texels.
    // Add +1 per curve for worst-case row-boundary padding.
    const starts = glyph.contourStarts
    for (let c = 0; c < starts.length; c++) {
      const contourStart = starts[c]!
      const contourEnd = c + 1 < starts.length ? starts[c + 1]! : glyph.curves.length
      const contourCurves = contourEnd - contourStart
      totalCurveTexels += contourCurves * 2 + 1 // worst case: every curve needs a pad
    }

    // Band headers + curve reference lists
    const numHBands = glyph.bands.hBands.length
    const numVBands = glyph.bands.vBands.length
    let bandTexels = numHBands + numVBands // headers

    for (const band of glyph.bands.hBands) {
      bandTexels += band.curveIndices.length
    }
    for (const band of glyph.bands.vBands) {
      bandTexels += band.curveIndices.length
    }

    totalBandTexels += bandTexels
  }

  // Calculate texture heights — round up to next power of 2 for GPU compression support
  const curveHeight = nextPow2(Math.max(1, Math.ceil(totalCurveTexels / TEXTURE_WIDTH)))
  const bandHeight = nextPow2(Math.max(1, Math.ceil(totalBandTexels / TEXTURE_WIDTH)))

  // Allocate buffers
  const curveData = new Float32Array(TEXTURE_WIDTH * curveHeight * 4) // RGBA
  const bandData = new Uint32Array(TEXTURE_WIDTH * bandHeight * 2) // RG

  let curveOffset = 0 // texel offset into curve texture
  let bandOffset = 0 // texel offset into band texture

  for (const glyph of glyphs.values()) {
    // Record glyph's curve location
    glyph.curveLocation = {
      x: curveOffset % TEXTURE_WIDTH,
      y: Math.floor(curveOffset / TEXTURE_WIDTH),
    }

    // Record glyph's band location
    glyph.bandLocation = {
      x: bandOffset % TEXTURE_WIDTH,
      y: Math.floor(bandOffset / TEXTURE_WIDTH),
    }

    // Pack curves with endpoint sharing.
    // Within a contour, curve i's texel is [p0x, p0y, p1x, p1y] and
    // curve i+1's first channel pair is [p2x, p2y] = the shared endpoint.
    // The shader reads texel[i] and texel[i+1] — works identically.
    //
    // curveTexelMap[curveIndex] = texel offset of that curve's first texel
    const curveTexelMap: number[] = new Array(glyph.curves.length)
    const starts = glyph.contourStarts

    for (let c = 0; c < starts.length; c++) {
      const contourStart = starts[c]!
      const contourEnd = c + 1 < starts.length ? starts[c + 1]! : glyph.curves.length

      for (let ci = contourStart; ci < contourEnd; ci++) {
        const curve = glyph.curves[ci]!

        // Ensure the texel pair [offset, offset+1] doesn't cross a row boundary.
        // If we're at the last column, skip to the start of the next row.
        if (curveOffset % TEXTURE_WIDTH === TEXTURE_WIDTH - 1) {
          curveOffset++ // skip padding texel
        }

        curveTexelMap[ci] = curveOffset

        const idx = curveOffset * 4
        curveData[idx] = curve.p0x
        curveData[idx + 1] = curve.p0y
        curveData[idx + 2] = curve.p1x
        curveData[idx + 3] = curve.p1y
        curveOffset++
      }

      // Final endpoint texel — also must not land at x=4095 if it would
      // be read as part of the last curve's pair (it always is).
      // The check above already ensures the last curve's texel is at x < 4095,
      // so curveOffset here is at most x=4095 which is fine (endpoint is the +1 read).
      const lastCurve = glyph.curves[contourEnd - 1]!
      const idx = curveOffset * 4
      curveData[idx] = lastCurve.p2x
      curveData[idx + 1] = lastCurve.p2y
      curveData[idx + 2] = 0
      curveData[idx + 3] = 0
      curveOffset++
    }

    // Pack band data
    const glyphBandStart = bandOffset
    const numHBands = glyph.bands.hBands.length
    const numVBands = glyph.bands.vBands.length

    // Reserve space for headers
    const hHeaderStart = bandOffset
    bandOffset += numHBands
    const vHeaderStart = bandOffset
    bandOffset += numVBands

    // Pack band curve reference lists with deduplication.
    // Adjacent bands with identical curve index lists share data.
    function packBandGroup(bands: typeof glyph.bands.hBands, headerStart: number) {
      let prevIndicesKey = ''
      let prevListOffset = 0

      for (let b = 0; b < bands.length; b++) {
        const band = bands[b]!
        const headerIdx = (headerStart + b) * 2
        bandData[headerIdx] = band.curveIndices.length

        // Check if this band's curve list matches the previous band's
        const indicesKey = band.curveIndices.join(',')
        if (b > 0 && indicesKey === prevIndicesKey) {
          // Reuse previous band's data offset
          bandData[headerIdx + 1] = prevListOffset
        } else {
          // Write new curve reference list
          const listOffset = bandOffset - glyphBandStart
          bandData[headerIdx + 1] = listOffset
          prevListOffset = listOffset

          for (const curveIdx of band.curveIndices) {
            const curveTexelOffset = curveTexelMap[curveIdx]!
            const bidx = bandOffset * 2
            bandData[bidx] = curveTexelOffset % TEXTURE_WIDTH
            bandData[bidx + 1] = Math.floor(curveTexelOffset / TEXTURE_WIDTH)
            bandOffset++
          }
        }
        prevIndicesKey = indicesKey
      }
    }

    packBandGroup(glyph.bands.hBands, hHeaderStart)
    packBandGroup(glyph.bands.vBands, vHeaderStart)
  }

  // Create DataTextures
  const curveTexture = new DataTexture(
    curveData,
    TEXTURE_WIDTH,
    curveHeight,
    RGBAFormat,
    FloatType,
  )
  curveTexture.minFilter = NearestFilter
  curveTexture.magFilter = NearestFilter
  curveTexture.needsUpdate = true

  // For the band texture, we use a float-encoded workaround since integer
  // DataTextures have limited support. Pack uint32 pairs into RGBA float.
  const bandFloatData = new Float32Array(TEXTURE_WIDTH * bandHeight * 4)
  for (let i = 0; i < TEXTURE_WIDTH * bandHeight; i++) {
    bandFloatData[i * 4] = bandData[i * 2]! // R = first uint
    bandFloatData[i * 4 + 1] = bandData[i * 2 + 1]! // G = second uint
    bandFloatData[i * 4 + 2] = 0
    bandFloatData[i * 4 + 3] = 0
  }

  const bandTexture = new DataTexture(
    bandFloatData,
    TEXTURE_WIDTH,
    bandHeight,
    RGBAFormat,
    FloatType,
  )
  bandTexture.minFilter = NearestFilter
  bandTexture.magFilter = NearestFilter
  bandTexture.needsUpdate = true

  return {
    curveTexture,
    bandTexture,
    textureWidth: TEXTURE_WIDTH,
  }
}
