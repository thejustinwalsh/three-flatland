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
    // Each curve needs 2 texels (no endpoint sharing across glyphs for simplicity)
    totalCurveTexels += glyph.curves.length * 2

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

    // Pack curves into curve texture
    const curveBaseOffset = curveOffset
    for (const curve of glyph.curves) {
      const idx = curveOffset * 4
      // Texel 0: p0x, p0y, p1x, p1y
      curveData[idx] = curve.p0x
      curveData[idx + 1] = curve.p0y
      curveData[idx + 2] = curve.p1x
      curveData[idx + 3] = curve.p1y
      // Texel 1: p2x, p2y, 0, 0
      curveData[idx + 4] = curve.p2x
      curveData[idx + 5] = curve.p2y
      curveData[idx + 6] = 0
      curveData[idx + 7] = 0
      curveOffset += 2
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

    // Pack horizontal band curve references and write headers
    for (let b = 0; b < numHBands; b++) {
      const band = glyph.bands.hBands[b]!
      const headerIdx = (hHeaderStart + b) * 2
      bandData[headerIdx] = band.curveIndices.length
      bandData[headerIdx + 1] = bandOffset - glyphBandStart

      for (const curveIdx of band.curveIndices) {
        const curveTexelOffset = curveBaseOffset + curveIdx * 2
        const bidx = bandOffset * 2
        bandData[bidx] = curveTexelOffset % TEXTURE_WIDTH
        bandData[bidx + 1] = Math.floor(curveTexelOffset / TEXTURE_WIDTH)
        bandOffset++
      }
    }

    // Pack vertical band curve references and write headers
    for (let b = 0; b < numVBands; b++) {
      const band = glyph.bands.vBands[b]!
      const headerIdx = (vHeaderStart + b) * 2
      bandData[headerIdx] = band.curveIndices.length
      bandData[headerIdx + 1] = bandOffset - glyphBandStart

      for (const curveIdx of band.curveIndices) {
        const curveTexelOffset = curveBaseOffset + curveIdx * 2
        const bidx = bandOffset * 2
        bandData[bidx] = curveTexelOffset % TEXTURE_WIDTH
        bandData[bidx + 1] = Math.floor(curveTexelOffset / TEXTURE_WIDTH)
        bandOffset++
      }
    }
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
