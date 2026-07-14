import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RedFormat,
  RGBAFormat,
} from 'three'
import type { SlugGlyphData, SlugTextureData } from '../types.js'

/** Default texture width in texels (must be power of 2). */
const TEXTURE_WIDTH = 4096

// ── Band texel packing (R32Float, single channel) ──────────────────────────
// Every band texel packs two small non-negative integers into ONE float32.
// float32 stores integers ≤ 2^24-1 (16,777,215) exactly, so both encodings are
// bit-exact — the decoded count/offset/texelX/texelY equal the pre-pack values.
// The matching shader decode lives in `shaders/slugFragment.ts` + `slugStroke.ts`.

/** log2(TEXTURE_WIDTH). A curve-ref texel packs texelY in the high bits and
 *  texelX (< 4096) in the low 12 bits: `texelY << 12 | texelX`. */
const LOG_TEXTURE_WIDTH = 12
const TEXTURE_WIDTH_MASK = (1 << LOG_TEXTURE_WIDTH) - 1 // 4095

/**
 * Band-header bit split: `curveCount` in the high 10 bits, `curveListOffset` in
 * the low 14 bits → `curveCount << 14 | curveListOffset`. Max packed value is
 * `1023 * 16384 + 16383 = 2^24-1`, exact in float32.
 *
 * - 10-bit count (≤ 1023) covers `MAX_SAFE_BAND_CURVES` (512, the shader's read
 *   cap) with 2× headroom; no real font band approaches 1023 curves.
 * - 14-bit offset (≤ 16383) covers the largest per-glyph curve-list offset
 *   (offset is glyph-relative — Inter-Regular's densest glyph observes offsets
 *   in the low hundreds, so 16383 leaves ample headroom). Both are GUARDED.
 */
const HEADER_OFFSET_BITS = 14
const HEADER_OFFSET_MASK = (1 << HEADER_OFFSET_BITS) - 1 // 16383
const MAX_HEADER_COUNT = (1 << (24 - HEADER_OFFSET_BITS)) - 1 // 1023

/**
 * Pack a band header `(curveCount, curveListOffset)` into one float32. Both are
 * small non-negative integers and round-trip exactly. Throws {@link RangeError}
 * if either exceeds its field so a silent bit-collision can never ship.
 */
export function packHeader(count: number, offset: number): number {
  if (!Number.isInteger(count) || count < 0 || count > MAX_HEADER_COUNT) {
    throw new RangeError(
      `packHeader: band curve count ${count} out of range 0..${MAX_HEADER_COUNT} ` +
        `(the ${24 - HEADER_OFFSET_BITS}-bit header count field)`
    )
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > HEADER_OFFSET_MASK) {
    throw new RangeError(
      `packHeader: curve-list offset ${offset} out of range 0..${HEADER_OFFSET_MASK} ` +
        `(the ${HEADER_OFFSET_BITS}-bit header offset field)`
    )
  }
  return count * (HEADER_OFFSET_MASK + 1) + offset
}

/**
 * Pack a curve-ref `(texelX, texelY)` into one float32 as `texelY << 12 | texelX`.
 * `texelX` is always `< TEXTURE_WIDTH` by construction; `texelY` is GUARDED to
 * the same 12-bit range and throws {@link RangeError} if the band curve-ref
 * texture ever exceeds 4096 rows.
 */
export function packRefCoord(texelX: number, texelY: number): number {
  if (!Number.isInteger(texelY) || texelY < 0 || texelY > TEXTURE_WIDTH_MASK) {
    throw new RangeError(
      `packRefCoord: curve texel Y ${texelY} out of range 0..${TEXTURE_WIDTH_MASK} ` +
        `(curve texture exceeded ${TEXTURE_WIDTH_MASK + 1} rows — split the atlas)`
    )
  }
  // texelX < TEXTURE_WIDTH by construction (curveOffset % TEXTURE_WIDTH).
  return texelY * (TEXTURE_WIDTH_MASK + 1) + texelX
}

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
 * Curve Texture (RGBA16F — HalfFloatType):
 *   - 2 texels per curve: [p0x, p0y, p1x, p1y] + [p2x, p2y, 0, 0]
 *   - Endpoint sharing: contiguous curves share texels
 *   - 8 bytes per texel vs 16 for Float32 — halves texture bandwidth.
 *     Em-space coordinates are in ~[-1, +1.25], well within half-float
 *     range and at ~11-bit mantissa precision which is subpixel-accurate
 *     at all realistic rendering sizes.
 *
 * Band Texture (R32Float — FloatType, single-channel):
 *   - Per glyph: [hBand headers][vBand headers][curve ref lists]
 *   - Header texel: `packHeader(curveCount, offsetFromGlyphStart)` — two ints
 *     packed into one float32 (count << 14 | offset), exact up to 2^24-1.
 *   - Curve-ref texel: `packRefCoord(texelX, texelY)` = texelY << 12 | texelX,
 *     a pointer into the curve texture, exact up to 2^24-1.
 *   - 4 bytes per texel vs 8 for the old RG32F — halves every band read
 *     (~2 headers + 1 ref-per-curve per fragment). Universal bandwidth win.
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

  // Allocate buffers.
  // Curve texture: 4 channels × 2 bytes (half-float) = 8 bytes/texel.
  // Band texture: 1 channel × 4 bytes (float) = 4 bytes/texel (packed).
  const curveData = new Uint16Array(TEXTURE_WIDTH * curveHeight * 4) // RGBA half-float
  const bandData = new Float32Array(TEXTURE_WIDTH * bandHeight * 1) // R float (packed)

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
    const curveTexelMap = new Array<number>(glyph.curves.length)
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
        curveData[idx] = DataUtils.toHalfFloat(curve.p0x)
        curveData[idx + 1] = DataUtils.toHalfFloat(curve.p0y)
        curveData[idx + 2] = DataUtils.toHalfFloat(curve.p1x)
        curveData[idx + 3] = DataUtils.toHalfFloat(curve.p1y)
        curveOffset++
      }

      // Final endpoint texel — also must not land at x=4095 if it would
      // be read as part of the last curve's pair (it always is).
      // The check above already ensures the last curve's texel is at x < 4095,
      // so curveOffset here is at most x=4095 which is fine (endpoint is the +1 read).
      const lastCurve = glyph.curves[contourEnd - 1]!
      const idx = curveOffset * 4
      curveData[idx] = DataUtils.toHalfFloat(lastCurve.p2x)
      curveData[idx + 1] = DataUtils.toHalfFloat(lastCurve.p2y)
      curveData[idx + 2] = 0 // half-float zero is bit-pattern 0
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
        const headerIdx = headerStart + b // one R32F texel per header
        const count = band.curveIndices.length

        // Check if this band's curve list matches the previous band's
        const indicesKey = band.curveIndices.join(',')
        if (b > 0 && indicesKey === prevIndicesKey) {
          // Reuse previous band's data offset
          bandData[headerIdx] = packHeader(count, prevListOffset)
        } else {
          // Write new curve reference list
          const listOffset = bandOffset - glyphBandStart
          bandData[headerIdx] = packHeader(count, listOffset)
          prevListOffset = listOffset

          for (const curveIdx of band.curveIndices) {
            const curveTexelOffset = curveTexelMap[curveIdx]!
            bandData[bandOffset] = packRefCoord(
              curveTexelOffset % TEXTURE_WIDTH,
              Math.floor(curveTexelOffset / TEXTURE_WIDTH)
            )
            bandOffset++
          }
        }
        prevIndicesKey = indicesKey
      }
    }

    packBandGroup(glyph.bands.hBands, hHeaderStart)
    packBandGroup(glyph.bands.vBands, vHeaderStart)
  }

  // Curve texture — RGBA16F (half-float).
  const curveTexture = new DataTexture(
    curveData,
    TEXTURE_WIDTH,
    curveHeight,
    RGBAFormat,
    HalfFloatType
  )
  curveTexture.minFilter = NearestFilter
  curveTexture.magFilter = NearestFilter
  curveTexture.needsUpdate = true

  // Band texture — R32F (single channel). Each texel packs two small non-negative
  // integers (header = count/offset, ref = texelX/texelY) into one float32 — all
  // exact in float32's 24-bit mantissa. Halves texel width vs the old RG32F.
  const bandTexture = new DataTexture(bandData, TEXTURE_WIDTH, bandHeight, RedFormat, FloatType)
  bandTexture.minFilter = NearestFilter
  bandTexture.magFilter = NearestFilter
  bandTexture.needsUpdate = true

  return {
    curveTexture,
    bandTexture,
    textureWidth: TEXTURE_WIDTH,
  }
}
