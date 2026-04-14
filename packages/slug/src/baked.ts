/**
 * Baked binary format for pre-processed SlugFont data.
 *
 * Produced by `slug-bake`, consumed by `SlugFont.fromURL` at runtime.
 * Two files alongside the original font:
 *   - {name}.slug.json — tiny header with byte offsets into the binary
 *   - {name}.slug.bin  — all data: textures, glyph table, cmap, kerning
 *
 * When baked data is present, opentype.js is never loaded at runtime.
 */

import type { SlugGlyphData, GlyphBounds } from './types.js'

/** JSON header stored in the .slug.json file. */
export interface BakedJSON {
  metrics: {
    unitsPerEm: number
    ascender: number
    descender: number
    capHeight: number
    underlinePosition: number
    underlineThickness: number
    strikethroughPosition: number
    strikethroughThickness: number
    subscriptScale: { x: number; y: number }
    subscriptOffset: { x: number; y: number }
    superscriptScale: { x: number; y: number }
    superscriptOffset: { x: number; y: number }
  }
  textureWidth: number
  curveTexture: { height: number; byteOffset: number; byteLength: number }
  bandTexture: { height: number; byteOffset: number; byteLength: number }
  /** Fixed-size glyph table: 10 floats per glyph (id, bounds(4), bandLoc(2), advanceWidth, lsb, hasOutline). */
  glyphs: { byteOffset: number; count: number }
  /** Variable-size band data: per-glyph [numH, numV, ...hBandCounts, ...hBandIndices, ...vBandCounts, ...vBandIndices]. */
  bands: { byteOffset: number; byteLength: number }
  /** Cmap: [charCode(u16), glyphId(u16)] pairs sorted by charCode. */
  cmap: { byteOffset: number; count: number }
  /** Kerning: [glyphId1(u16), glyphId2(u16), value(i16)] triples. */
  kern: { byteOffset: number; count: number }
  /**
   * Optional stroke sets produced at bake time by running each source
   * glyph's contours through the quadratic-Bezier offsetter. When
   * present, each entry describes a single (width, join, cap,
   * miterLimit) tuple; the baked stroke glyph for source glyph `sid`
   * lives at `strokeGlyphId = sid + glyphIdOffset`.
   *
   * Stroke-glyph curve + band data live in the same curve/band
   * textures as the source glyphs — just with fresh IDs in the main
   * glyph table. Lookups at runtime happen via
   * `SlugFont.getStrokeGlyph(sourceGlyphId, width, join, cap)`.
   *
   * Absent when no stroke sets were configured at bake time. Files
   * written before this field was introduced load cleanly with
   * `strokeSets === undefined`.
   */
  strokeSets?: Array<{
    width: number
    joinStyle: 'miter' | 'round' | 'bevel'
    capStyle: 'flat' | 'square' | 'round' | 'triangle'
    miterLimit: number
    /**
     * strokeGlyphId = sourceGlyphId + glyphIdOffset. Offsets are
     * allocated so all stroke sets live in disjoint ID ranges.
     */
    glyphIdOffset: number
  }>
}

/** Glyph table layout: 10 Float32 values per glyph. */
const GLYPH_FLOATS = 10

/**
 * Derive baked file URLs from a font URL.
 * `/fonts/Inter-Regular.ttf` → `/fonts/Inter-Regular.slug.json` + `.slug.bin`
 */
export function bakedURLs(fontURL: string): { json: string; bin: string } {
  const base = fontURL.replace(/\.[^.]+$/, '')
  return {
    json: `${base}.slug.json`,
    bin: `${base}.slug.bin`,
  }
}

// ─── Serialization (used by CLI) ───

export interface BakeInput {
  metrics: BakedJSON['metrics']
  textureWidth: number
  curveTextureHeight: number
  /** RGBA half-float data — 4 channels × 2 bytes per texel. */
  curveData: Uint16Array
  bandTextureHeight: number
  /** RG float32 data — 2 channels × 4 bytes per texel. */
  bandData: Float32Array
  glyphs: Map<number, SlugGlyphData>
  cmap: [charCode: number, glyphId: number][]
  kern: [glyphId1: number, glyphId2: number, value: number][]
  /** Optional stroke-set metadata. Stroke glyphs themselves live in
   *  the `glyphs` map with fresh IDs; this array records the
   *  (params, glyphIdOffset) mapping so runtime can look them up. */
  strokeSets?: BakedJSON['strokeSets']
}

export interface BakeOutput {
  json: BakedJSON
  bin: Uint8Array
}

/** Pack all data into baked format. */
export function packBaked(input: BakeInput): BakeOutput {
  const {
    metrics, textureWidth,
    curveTextureHeight, curveData,
    bandTextureHeight, bandData,
    glyphs, cmap, kern,
  } = input

  // --- Calculate sizes ---
  const curveByteLength = curveData.byteLength
  const bandByteLength = bandData.byteLength
  const glyphCount = glyphs.size
  const glyphByteLength = glyphCount * GLYPH_FLOATS * 4

  // Pre-calculate band section size
  let bandSectionSize = 0
  for (const g of glyphs.values()) {
    // 2 uint16 for band counts + all curveIndices
    const hTotal = g.bands.hBands.reduce((s, b) => s + b.curveIndices.length, 0)
    const vTotal = g.bands.vBands.reduce((s, b) => s + b.curveIndices.length, 0)
    bandSectionSize += (2 + g.bands.hBands.length + hTotal + g.bands.vBands.length + vTotal) * 2
  }
  // Align to 4 bytes
  bandSectionSize = Math.ceil(bandSectionSize / 4) * 4

  const cmapByteLength = cmap.length * 4 // 2x uint16
  const kernByteLength = kern.length * 6  // 2x uint16 + 1x int16
  // Align kern to 4 bytes
  const kernByteLengthAligned = Math.ceil(kernByteLength / 4) * 4

  // --- Calculate offsets ---
  let offset = 0
  const curveOffset = offset; offset += curveByteLength
  const bandTexOffset = offset; offset += bandByteLength
  const glyphOffset = offset; offset += glyphByteLength
  const bandsOffset = offset; offset += bandSectionSize
  const cmapOffset = offset; offset += cmapByteLength
  const kernOffset = offset; offset += kernByteLengthAligned

  // --- Build binary ---
  const totalSize = offset
  const buffer = new ArrayBuffer(totalSize)

  // Curve texture (half-float — 2 bytes per element)
  new Uint16Array(buffer, curveOffset, curveData.length).set(curveData)

  // Band texture (float32 RG — 2 channels)
  new Float32Array(buffer, bandTexOffset, bandData.length).set(bandData)

  // Glyph table: [glyphId, xMin, yMin, xMax, yMax, bandLocX, bandLocY, advanceWidth, lsb, hasOutline]
  const glyphTable = new Float32Array(buffer, glyphOffset, glyphCount * GLYPH_FLOATS)
  let gi = 0
  for (const g of glyphs.values()) {
    const base = gi * GLYPH_FLOATS
    glyphTable[base] = g.glyphId
    glyphTable[base + 1] = g.bounds.xMin
    glyphTable[base + 2] = g.bounds.yMin
    glyphTable[base + 3] = g.bounds.xMax
    glyphTable[base + 4] = g.bounds.yMax
    glyphTable[base + 5] = g.bandLocation.x
    glyphTable[base + 6] = g.bandLocation.y
    glyphTable[base + 7] = g.advanceWidth
    glyphTable[base + 8] = g.lsb
    glyphTable[base + 9] = g.curves.length > 0 ? 1 : 0
    gi++
  }

  // Band data: per glyph [numH(u16), numV(u16), hBandCount0, hBandCount1, ..., hIndices..., vBandCount0, ..., vIndices...]
  const bandView = new DataView(buffer, bandsOffset, bandSectionSize)
  let bOff = 0
  for (const g of glyphs.values()) {
    const { hBands, vBands } = g.bands
    bandView.setUint16(bOff, hBands.length, true); bOff += 2
    bandView.setUint16(bOff, vBands.length, true); bOff += 2
    // H band counts + indices
    for (const band of hBands) {
      bandView.setUint16(bOff, band.curveIndices.length, true); bOff += 2
    }
    for (const band of hBands) {
      for (const idx of band.curveIndices) {
        bandView.setUint16(bOff, idx, true); bOff += 2
      }
    }
    // V band counts + indices
    for (const band of vBands) {
      bandView.setUint16(bOff, band.curveIndices.length, true); bOff += 2
    }
    for (const band of vBands) {
      for (const idx of band.curveIndices) {
        bandView.setUint16(bOff, idx, true); bOff += 2
      }
    }
  }

  // Cmap: [charCode(u16), glyphId(u16)]
  const cmapView = new DataView(buffer, cmapOffset, cmapByteLength)
  for (let i = 0; i < cmap.length; i++) {
    cmapView.setUint16(i * 4, cmap[i]![0]!, true)
    cmapView.setUint16(i * 4 + 2, cmap[i]![1]!, true)
  }

  // Kern: [glyphId1(u16), glyphId2(u16), value(i16)]
  const kernView = new DataView(buffer, kernOffset, kernByteLengthAligned)
  for (let i = 0; i < kern.length; i++) {
    kernView.setUint16(i * 6, kern[i]![0]!, true)
    kernView.setUint16(i * 6 + 2, kern[i]![1]!, true)
    kernView.setInt16(i * 6 + 4, kern[i]![2]!, true)
  }

  // --- Build JSON header ---
  const json: BakedJSON = {
    metrics,
    textureWidth,
    curveTexture: { height: curveTextureHeight, byteOffset: curveOffset, byteLength: curveByteLength },
    bandTexture: { height: bandTextureHeight, byteOffset: bandTexOffset, byteLength: bandByteLength },
    glyphs: { byteOffset: glyphOffset, count: glyphCount },
    bands: { byteOffset: bandsOffset, byteLength: bandSectionSize },
    cmap: { byteOffset: cmapOffset, count: cmap.length },
    kern: { byteOffset: kernOffset, count: kern.length },
    ...(input.strokeSets ? { strokeSets: input.strokeSets } : {}),
  }

  return { json, bin: new Uint8Array(buffer) }
}

// ─── Deserialization (used at runtime) ───

/** Baked font data reconstructed from the binary. No opentype.js needed. */
export interface BakedFontData {
  glyphs: Map<number, SlugGlyphData>
  /** charCode → glyphId lookup (sorted array for binary search). */
  cmapCodes: Uint16Array
  cmapGlyphs: Uint16Array
  /** Kerning: packed [g1, g2, value] triples. */
  kernData: DataView
  kernCount: number
}

/** Unpack glyph map + shaping data from the binary. */
export function unpackBaked(bin: ArrayBuffer, json: BakedJSON): BakedFontData {
  // Glyph table
  const glyphTable = new Float32Array(bin, json.glyphs.byteOffset, json.glyphs.count * GLYPH_FLOATS)
  const glyphs = new Map<number, SlugGlyphData>()

  // Band data
  const bandView = new DataView(bin, json.bands.byteOffset, json.bands.byteLength)
  let bOff = 0

  for (let gi = 0; gi < json.glyphs.count; gi++) {
    const base = gi * GLYPH_FLOATS
    const glyphId = glyphTable[base]!
    const hasOutline = glyphTable[base + 9]! > 0

    // Read bands
    const numH = bandView.getUint16(bOff, true); bOff += 2
    const numV = bandView.getUint16(bOff, true); bOff += 2

    // H band counts
    const hCounts: number[] = []
    for (let b = 0; b < numH; b++) {
      hCounts.push(bandView.getUint16(bOff, true)); bOff += 2
    }
    // H band indices
    const hBands = hCounts.map((count) => {
      const curveIndices: number[] = []
      for (let j = 0; j < count; j++) {
        curveIndices.push(bandView.getUint16(bOff, true)); bOff += 2
      }
      return { curveIndices }
    })

    // V band counts
    const vCounts: number[] = []
    for (let b = 0; b < numV; b++) {
      vCounts.push(bandView.getUint16(bOff, true)); bOff += 2
    }
    // V band indices
    const vBands = vCounts.map((count) => {
      const curveIndices: number[] = []
      for (let j = 0; j < count; j++) {
        curveIndices.push(bandView.getUint16(bOff, true)); bOff += 2
      }
      return { curveIndices }
    })

    glyphs.set(glyphId, {
      glyphId,
      curves: [],
      contourStarts: [],
      bounds: {
        xMin: glyphTable[base + 1]!,
        yMin: glyphTable[base + 2]!,
        xMax: glyphTable[base + 3]!,
        yMax: glyphTable[base + 4]!,
      },
      bandLocation: { x: glyphTable[base + 5]!, y: glyphTable[base + 6]! },
      bands: { hBands, vBands },
      advanceWidth: glyphTable[base + 7]!,
      lsb: glyphTable[base + 8]!,
      curveLocation: { x: 0, y: 0 }, // Not needed at runtime
    })
  }

  // Cmap
  const cmapCodes = new Uint16Array(json.cmap.count)
  const cmapGlyphs = new Uint16Array(json.cmap.count)
  const cmapView = new DataView(bin, json.cmap.byteOffset, json.cmap.count * 4)
  for (let i = 0; i < json.cmap.count; i++) {
    cmapCodes[i] = cmapView.getUint16(i * 4, true)
    cmapGlyphs[i] = cmapView.getUint16(i * 4 + 2, true)
  }

  // Kern
  const kernData = new DataView(bin, json.kern.byteOffset, json.kern.count * 6)

  return { glyphs, cmapCodes, cmapGlyphs, kernData, kernCount: json.kern.count }
}

/** Binary search cmap for a char code. Returns glyphId or 0 (notdef). */
export function cmapLookup(charCode: number, codes: Uint16Array, glyphIds: Uint16Array): number {
  let lo = 0
  let hi = codes.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const v = codes[mid]!
    if (v === charCode) return glyphIds[mid]!
    if (v < charCode) lo = mid + 1
    else hi = mid - 1
  }
  return 0
}

/** Look up kerning value for a glyph pair. Returns value in font units or 0. */
export function kernLookup(g1: number, g2: number, data: DataView, count: number): number {
  // Linear scan — kern tables are typically small. Could upgrade to hash if needed.
  for (let i = 0; i < count; i++) {
    const off = i * 6
    if (data.getUint16(off, true) === g1 && data.getUint16(off + 2, true) === g2) {
      return data.getInt16(off + 4, true)
    }
  }
  return 0
}
