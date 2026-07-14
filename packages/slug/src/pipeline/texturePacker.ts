import {
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  RGFormat,
} from 'three'
import type { SlugGlyphData, SlugTextureData } from '../types.js'

/** Default texture width in texels (must be power of 2). */
const TEXTURE_WIDTH = 4096

/** log2(TEXTURE_WIDTH) — the shift the shader uses to unpack a ref's row. */
const LOG_TEXTURE_WIDTH = 12 // 2^12 = 4096

/**
 * Pack a curve texel's (x, y) into one float32-exact scalar for the band-ref
 * texel's R channel: `y * TEXTURE_WIDTH + x`. Because `x < TEXTURE_WIDTH`, this
 * is exact in float32's 24-bit mantissa iff `y < TEXTURE_WIDTH` (max packed =
 * 4095*4096 + 4095 = 2^24 - 1). The shader unpacks it with
 * `int(r) & (W-1)` (→ x) and `int(r) >> log2(W)` (→ y).
 *
 * Throws when the curve row exceeds the exact-integer window — a guard against
 * a pathological atlas silently corrupting every ref for that curve.
 */
export function packRefCoord(x: number, y: number): number {
  if (y >= TEXTURE_WIDTH) {
    throw new RangeError(
      `packRefCoord: curve texel row ${y} >= ${TEXTURE_WIDTH}; the packed ref ` +
        `(y*${TEXTURE_WIDTH}+x) would exceed float32's exact-integer range. ` +
        `The curve texture is too tall for the packed-ref format.`
    )
  }
  return y * TEXTURE_WIDTH + x
}

/** Inverse of {@link packRefCoord}, mirroring the shader's bit ops exactly. */
export function unpackRefCoord(packed: number): { x: number; y: number } {
  return { x: packed & (TEXTURE_WIDTH - 1), y: packed >>> LOG_TEXTURE_WIDTH }
}

/**
 * Hull-max for a band ref's early-exit `G` channel: the max of three control-
 * point coordinates AFTER rounding each to the half-float value the shader
 * decodes from the RGBA16F curve texture. Maxing the SAME values the shader
 * sees makes the stored hull equal the shader's `max(p0,p1,p2)` for that axis
 * exactly, so the pre-load early-exit is a safe OUTWARD bound — it can never
 * cull a curve the shader would include (a too-tight hull would drop curves
 * and visibly corrupt glyphs). `fromHalfFloat(toHalfFloat(x))` is idempotent
 * on values already in half-float space, so feeding decoded texel values is
 * exact.
 */
export function halfFloatHullMax(a: number, b: number, c: number): number {
  return Math.max(
    DataUtils.fromHalfFloat(DataUtils.toHalfFloat(a)),
    DataUtils.fromHalfFloat(DataUtils.toHalfFloat(b)),
    DataUtils.fromHalfFloat(DataUtils.toHalfFloat(c))
  )
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
 * Band Texture (RG32Float — FloatType, 2-channel):
 *   - Per glyph: [hBand headers][vBand headers][curve ref lists]
 *   - Header: (curveCount, offsetFromGlyphStart) — stored as floats but
 *     always integer values, exactly representable up to 2^24
 *   - Curve ref:
 *       R = packRefCoord(texelX, texelY) = texelY*4096 + texelX → pointer into
 *           the curve texture (both coords in ONE channel; see `packRefCoord`)
 *       G = the curve's axis hull-max (max-x for h-band refs, max-y for v-band
 *           refs), em-space, computed from the half-float-rounded control points
 *           the shader decodes. This lets the fragment shader early-exit its
 *           sorted band-curve loop BEFORE the two curve-texel loads for the
 *           terminal (culled) curve. Bit-identical to the shader's old
 *           post-load `max(p0,p1,p2)` test (see `halfFloatHullMax`).
 *   - 8 bytes per texel vs 16 for RGBA32F — halves band bandwidth
 *
 * Format note: the ref layout above is `FL_slug_font` version 2. Version 1 (the
 * unpacked `(texelX, texelY)` ref, no hull) is rejected by `unpackBaked` — a
 * v1 `.slug.glb` loaded against this shader would misread every ref, so it must
 * be re-baked. `SlugShapeSet` re-packs on load, so shape bakes are unaffected.
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
  // Band texture: 2 channels × 4 bytes (float) = 8 bytes/texel.
  const curveData = new Uint16Array(TEXTURE_WIDTH * curveHeight * 4) // RGBA half-float
  const bandData = new Float32Array(TEXTURE_WIDTH * bandHeight * 2) // RG float

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
    // `axis`: 0 packs the max-X hull (h-bands, sorted descending by max-X),
    //         1 packs the max-Y hull (v-bands, sorted descending by max-Y).
    function packBandGroup(bands: typeof glyph.bands.hBands, headerStart: number, axis: 0 | 1) {
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
            // R: both curve-texel coords packed into one float32-exact scalar.
            bandData[bidx] = packRefCoord(
              curveTexelOffset % TEXTURE_WIDTH,
              Math.floor(curveTexelOffset / TEXTURE_WIDTH)
            )
            // G: axis hull-max, read from the SAME half-float texels the shader
            // decodes (texel0 = [p0x,p0y,p1x,p1y], texel1 = [p2x,p2y,...]). The
            // packer guarantees the pair stays in one row, so texel1 is at
            // curveTexelOffset+1. Bit-identical to the shader's max(p0,p1,p2).
            const c0 = curveTexelOffset * 4
            const c1 = (curveTexelOffset + 1) * 4
            bandData[bidx + 1] = halfFloatHullMax(
              DataUtils.fromHalfFloat(curveData[c0 + axis]!), // p0 axis
              DataUtils.fromHalfFloat(curveData[c0 + 2 + axis]!), // p1 axis
              DataUtils.fromHalfFloat(curveData[c1 + axis]!) // p2 axis (endpoint/shared texel)
            )
            bandOffset++
          }
        }
        prevIndicesKey = indicesKey
      }
    }

    packBandGroup(glyph.bands.hBands, hHeaderStart, 0)
    packBandGroup(glyph.bands.vBands, vHeaderStart, 1)
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

  // Band texture — RG32F. Headers hold small non-negative integers (counts,
  // offsets); ref texels hold a packed curve-texel coord (R, integer up to
  // 2^24-1) and an em-space axis hull-max (G, a signed fractional coord). Both
  // are exactly representable as float32. Halves texel width vs the old RGBA32F.
  const bandTexture = new DataTexture(bandData, TEXTURE_WIDTH, bandHeight, RGFormat, FloatType)
  bandTexture.minFilter = NearestFilter
  bandTexture.magFilter = NearestFilter
  bandTexture.needsUpdate = true

  return {
    curveTexture,
    bandTexture,
    textureWidth: TEXTURE_WIDTH,
  }
}
