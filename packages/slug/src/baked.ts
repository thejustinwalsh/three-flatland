/**
 * Runtime reader + shared types for the baked `.slug.glb` font format.
 *
 * Produced by `slug-bake` as a single `.slug.glb` file.
 * `SlugFont.fromURL` fetches this one file; no opentype.js loaded at runtime.
 *
 * This module is **glTF-Transform-free**: it uses only slug's own zero-dep GLB
 * loader (`./glb`). The packer (`packBaked`) and the registerable extension
 * class live in the Node-only `./bake` module so `@gltf-transform/core` never
 * enters the browser `.` static graph.
 *
 * ## GLB layout — FL_slug_font extension
 *
 * All numeric data lives in standard glTF accessors in the BIN chunk.
 * The `FL_slug_font` extension in the JSON chunk references them by index.
 *
 * The extension JSON emitted by the bake helper has shape:
 * ```json
 * {
 *   "version": 1,
 *   "metrics": { ... },
 *   "strokeSets": [...],
 *   "glyphs": { "count": N },
 *   "kern": { "stride": 3 },
 *   "curveTexture": { "width": W, "height": H, "format": "rgba16f" },
 *   "bandTexture":  { "width": W, "height": H, "format": "rg32f" },
 *   "bands": { "glyphCount": N },
 *   "columns": {
 *     "glyphId":      { "accessor": <idx> },
 *     "bounds":       { "accessor": <idx> },
 *     "bandLoc":      { "accessor": <idx> },
 *     "advanceWidth": { "accessor": <idx> },
 *     "lsb":          { "accessor": <idx> },
 *     "hasOutline":   { "accessor": <idx> },
 *     "cmap":         { "accessor": <idx> },
 *     "kern":         { "accessor": <idx> },
 *     "bandOffsets":  { "accessor": <idx> },
 *     "bandData":     { "accessor": <idx> },
 *     "curveTexture": { "accessor": <idx> },
 *     "bandTexture":  { "accessor": <idx> }
 *   }
 * }
 * ```
 *
 * ### Glyph ordering convention
 * Glyphs are stored **sorted ascending by glyphId** (the numeric glyph index
 * from the source font). This gives a stable, predictable order: glyph at
 * position `i` in every SoA column corresponds to the `i`-th element of the
 * sorted `glyphId` accessor. G4.2 reads in the same order.
 *
 * ### Band-offset convention
 * The `columns.bandOffsets` accessor is a FLOAT SCALAR of length
 * `glyphCount + 1` (CSR / prefix-sum). Each entry is a **word offset** into
 * the flat `columns.bandData` accessor (USHORT SCALAR):
 *   - `offsets[i]` = index of the first u16 word for glyph `i` (sorted order above)
 *   - `offsets[glyphCount]` = total word count in the data accessor (sentinel)
 *
 * Per-glyph band words layout (same as old binary format):
 * ```
 * [numH: u16, numV: u16,
 *  hBandCount0: u16, ..., hBandCountN-1: u16,
 *  hBand0_idx0: u16, ..., (all h-band indices, band by band),
 *  vBandCount0: u16, ..., vBandCountM-1: u16,
 *  vBand0_idx0: u16, ...]
 * ```
 */

import type { GlbView } from './glb'
import type { SlugGlyphData } from './types'
import { SLUG_EXTENSION_NAME, SLUG_FONT_VERSION } from './format'

/** JSON header shape — kept for backward compat; consumed by unpackBaked (G4.2). */
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
   * Optional stroke sets produced at bake time. Absent when none configured.
   */
  strokeSets?: Array<{
    width: number
    joinStyle: 'miter' | 'round' | 'bevel'
    capStyle: 'flat' | 'square' | 'round' | 'triangle'
    miterLimit: number
    glyphIdOffset: number
  }>
}

/**
 * Derive baked GLB URL from a font URL.
 * `/fonts/Inter-Regular.ttf` → `/fonts/Inter-Regular.slug.glb`
 */
export function bakedURLs(fontURL: string): string {
  // Preserve any query/fragment; strip only the extension off the path segment.
  const hashIdx = fontURL.indexOf('#')
  const hash = hashIdx >= 0 ? fontURL.slice(hashIdx) : ''
  const beforeHash = hashIdx >= 0 ? fontURL.slice(0, hashIdx) : fontURL
  const queryIdx = beforeHash.indexOf('?')
  const query = queryIdx >= 0 ? beforeHash.slice(queryIdx) : ''
  const path = queryIdx >= 0 ? beforeHash.slice(0, queryIdx) : beforeHash
  const base = path.replace(/\.[^./]+$/, '')
  return `${base}.slug.glb${query}${hash}`
}

// ─── Shared bake input (consumed by `./bake` packBaked + the CLI) ───

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

/**
 * Unpack glyph map + shaping data from a parsed `.slug.glb` (`GlbView`).
 *
 * Reads the `FL_slug_font` extension written by `packBaked`:
 * - Glyph SoA columns (glyphId, bounds, bandLoc, advanceWidth, lsb, hasOutline)
 *   are read in sorted-ascending-glyphId order (see module-level doc).
 * - Per-glyph `hBands`/`vBands` are reconstructed by slicing the flat
 *   `bandData` (USHORT) accessor using the `bandOffsets` (FLOAT, word indices)
 *   CSR prefix-sum.
 * - `cmap` is a USHORT VEC2 accessor `[charCode, glyphId]` pairs.
 * - `kern` is a SHORT SCALAR accessor with stride 3: `[g1, g2, value, ...]`.
 */
export function unpackBaked(asset: GlbView): BakedFontData {
  const ext = asset.ext<Record<string, unknown>>(SLUG_EXTENSION_NAME)
  if (!ext) throw new Error('unpackBaked: FL_slug_font extension not found in GLB')

  const version = ext['version']
  if (typeof version !== 'number' || version > SLUG_FONT_VERSION) {
    throw new Error(
      `unpackBaked: unsupported FL_slug_font version ${String(version)} ` +
        `(this build supports up to ${SLUG_FONT_VERSION}). Re-bake with a matching ` +
        `slug-bake, or upgrade @three-flatland/slug.`
    )
  }

  const columns = ext['columns'] as Record<string, { accessor: number }>
  const glyphsMeta = ext['glyphs'] as { count?: number } | undefined
  const glyphCount = glyphsMeta?.count
  if (typeof glyphCount !== 'number' || !Number.isInteger(glyphCount) || glyphCount < 0) {
    throw new Error(`unpackBaked: invalid FL_slug_font glyphs.count ${String(glyphCount)}`)
  }
  const kernMeta = ext['kern'] as { stride?: number } | undefined
  const kernStride = kernMeta?.stride
  // kernLookup reads fixed 6-byte (stride-3) records; reject anything else.
  if (kernStride !== 3) {
    throw new Error(`unpackBaked: FL_slug_font kern.stride must be 3, got ${String(kernStride)}`)
  }

  // ── Glyph SoA column accessors ──
  const glyphIdArr = asset.accessor(columns['glyphId']!.accessor) as Float32Array
  const boundsArr = asset.accessor(columns['bounds']!.accessor) as Float32Array // VEC4, length N*4
  const bandLocArr = asset.accessor(columns['bandLoc']!.accessor) as Float32Array // VEC2, length N*2
  const advanceWidthArr = asset.accessor(columns['advanceWidth']!.accessor) as Float32Array
  const lsbArr = asset.accessor(columns['lsb']!.accessor) as Float32Array
  const hasOutlineArr = asset.accessor(columns['hasOutline']!.accessor) as Float32Array

  // ── Band data: FLOAT prefix-sum offsets (N+1) + USHORT flat words ──
  const bandOffsets = asset.accessor(columns['bandOffsets']!.accessor) as Float32Array
  const bandData = asset.accessor(columns['bandData']!.accessor) as Uint16Array

  const glyphs = new Map<number, SlugGlyphData>()

  for (let i = 0; i < glyphCount; i++) {
    const glyphId = glyphIdArr[i]!

    // ── Reconstruct hBands / vBands from the flat bandData slice ──
    const wordStart = bandOffsets[i]!
    const wordEnd = bandOffsets[i + 1]!
    let w = wordStart

    const numH = bandData[w++]!
    const numV = bandData[w++]!

    // Read all hBand counts first, then all hBand indices (same layout as packBaked)
    const hCounts: number[] = []
    for (let b = 0; b < numH; b++) hCounts.push(bandData[w++]!)

    const hBands = hCounts.map((count) => {
      const curveIndices: number[] = []
      for (let j = 0; j < count; j++) curveIndices.push(bandData[w++]!)
      return { curveIndices }
    })

    const vCounts: number[] = []
    for (let b = 0; b < numV; b++) vCounts.push(bandData[w++]!)

    const vBands = vCounts.map((count) => {
      const curveIndices: number[] = []
      for (let j = 0; j < count; j++) curveIndices.push(bandData[w++]!)
      return { curveIndices }
    })

    // Sanity: w should equal wordEnd
    if (w !== wordEnd) {
      throw new Error(
        `unpackBaked: band word count mismatch for glyph ${glyphId}: expected ${wordEnd - wordStart}, consumed ${w - wordStart}`
      )
    }

    glyphs.set(glyphId, {
      glyphId,
      curves: [], // curve data lives in GPU texture, not rehydrated at runtime
      contourStarts: [],
      bounds: {
        xMin: boundsArr[i * 4]!,
        yMin: boundsArr[i * 4 + 1]!,
        xMax: boundsArr[i * 4 + 2]!,
        yMax: boundsArr[i * 4 + 3]!,
      },
      bandLocation: { x: bandLocArr[i * 2]!, y: bandLocArr[i * 2 + 1]! },
      bands: { hBands, vBands },
      advanceWidth: advanceWidthArr[i]!,
      lsb: lsbArr[i]!,
      curveLocation: { x: 0, y: 0 },
    })
    // hasOutlineArr[i] is available if callers ever need it, but SlugGlyphData
    // infers outline presence from bounds-area (xMax > xMin) per textMeasureBaked.
    void hasOutlineArr
  }

  // ── Cmap: USHORT VEC2 [charCode, glyphId] ──
  const cmapView = asset.accessor(columns['cmap']!.accessor) as Uint16Array
  const cmapCount = cmapView.length / 2 // VEC2 accessor: length = N*2 elements
  const cmapCodes = new Uint16Array(cmapCount)
  const cmapGlyphs = new Uint16Array(cmapCount)
  for (let i = 0; i < cmapCount; i++) {
    cmapCodes[i] = cmapView[i * 2]!
    cmapGlyphs[i] = cmapView[i * 2 + 1]!
  }

  // ── Kern: SHORT SCALAR stride 3 → DataView for kernLookup ──
  // kernLookup reads byte offsets i*6 (getUint16 at 0, 2; getInt16 at 4).
  // The Int16Array view is stride-3 triples; wrap it in a DataView.
  const kernArr = asset.accessor(columns['kern']!.accessor) as Int16Array
  if (kernArr.length % kernStride !== 0) {
    throw new Error(`unpackBaked: kern accessor length ${kernArr.length} not divisible by stride ${kernStride}`)
  }
  const kernCount = kernArr.length / kernStride
  const kernData = new DataView(kernArr.buffer, kernArr.byteOffset, kernArr.byteLength)

  return { glyphs, cmapCodes, cmapGlyphs, kernData, kernCount }
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
  for (let i = 0; i < count; i++) {
    const off = i * 6
    if (data.getUint16(off, true) === g1 && data.getUint16(off + 2, true) === g2) {
      return data.getInt16(off + 4, true)
    }
  }
  return 0
}
