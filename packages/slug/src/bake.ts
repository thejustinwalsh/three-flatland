/**
 * Node/tooling bake module for the `.slug.glb` binary format.
 *
 * Lives behind the `@three-flatland/slug/bake` subpath so the heavy
 * `@gltf-transform/core` machinery is reachable ONLY here — it never enters
 * the browser `.` static graph. The runtime side (`baked.ts`, `SlugFontLoader`)
 * reads `.slug.glb` through the zero-static-dep `@three-flatland/asset` reader.
 *
 * Mirrors the codified per-format baker convention (precedent:
 * `@three-flatland/normals` `./bake` exports `bakeNormalMap`).
 *
 * ## GLB layout — FL_slug_font extension
 *
 * All numeric data lives in standard glTF accessors in the BIN chunk.
 * The `FL_slug_font` extension in the JSON chunk references them by index.
 *
 * The extension JSON emitted by `packBaked` has shape:
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
 * from the source font). Glyph at position `i` in every SoA column corresponds
 * to the `i`-th element of the sorted `glyphId` accessor.
 *
 * ### Band-offset convention
 * The `columns.bandOffsets` accessor is a FLOAT SCALAR of length
 * `glyphCount + 1` (CSR / prefix-sum). Each entry is a **word offset** into
 * the flat `columns.bandData` accessor (USHORT SCALAR).
 */

import { Document, NodeIO } from '@gltf-transform/core'
import { addColumn, createFLExtension } from '@three-flatland/asset/bake'
import { SLUG_FONT_VERSION } from './baked'
import type { BakeInput } from './baked'
import type { SlugGlyphData } from './types'

/**
 * Registerable glTF-Transform extension class for the `FL_slug_font` format.
 *
 * Register it on a `NodeIO`/`WebIO` so gltf-transform tools (optimize, inspect,
 * validate) can read and round-trip `.slug.glb` without dropping the font-data
 * accessors:
 *
 * ```ts
 * import { NodeIO } from '@gltf-transform/core'
 * import { FlSlugFontExtension } from '@three-flatland/slug/bake'
 *
 * const io = new NodeIO().registerExtensions([FlSlugFontExtension])
 * const doc = await io.read('Inter-Regular.slug.glb') // accessor refs intact
 * ```
 *
 * Without registration, an unregistered tool treats the accessors as unused
 * (and refuses an `extensionsRequired` file). Every `FL_*` format SHOULD export
 * a registerable extension class from its `./bake` subpath — see the
 * `@three-flatland/asset` README "ecosystem integration" guidance.
 */
const _slug = createFLExtension('FL_slug_font')
export const FlSlugFontExtension = _slug.ExtClass

/**
 * Count the number of u16 words in the band data for a single glyph.
 * Layout: [numH(1), numV(1), hCounts(N), hIndices(sum), vCounts(M), vIndices(sum)]
 */
function bandWordCount(g: SlugGlyphData): number {
  const { hBands, vBands } = g.bands
  const hTotal = hBands.reduce((s, b) => s + b.curveIndices.length, 0)
  const vTotal = vBands.reduce((s, b) => s + b.curveIndices.length, 0)
  return 2 + hBands.length + hTotal + vBands.length + vTotal
}

/**
 * Write per-glyph band words into `dst` starting at `wordOffset`.
 * Returns the number of words written.
 */
function writeBandWords(g: SlugGlyphData, dst: Uint16Array, wordOffset: number): number {
  const { hBands, vBands } = g.bands
  let w = wordOffset
  dst[w++] = hBands.length
  dst[w++] = vBands.length
  for (const band of hBands) dst[w++] = band.curveIndices.length
  for (const band of hBands) for (const idx of band.curveIndices) dst[w++] = idx
  for (const band of vBands) dst[w++] = band.curveIndices.length
  for (const band of vBands) for (const idx of band.curveIndices) dst[w++] = idx
  return w - wordOffset
}

/**
 * Pack all data into a single `.slug.glb` `Uint8Array`.
 *
 * **Glyph ordering:** sorted ascending by glyphId (see module-level doc).
 * **Band offsets:** word offsets (u16 element indices), CSR prefix-sum, N+1 entries.
 */
export async function packBaked(input: BakeInput): Promise<Uint8Array> {
  const {
    metrics,
    textureWidth,
    curveTextureHeight,
    curveData,
    bandTextureHeight,
    bandData,
    glyphs,
    cmap,
    kern,
  } = input

  // ── Sort glyphs ascending by glyphId ──
  const sortedGlyphs = Array.from(glyphs.values()).sort((a, b) => a.glyphId - b.glyphId)
  const glyphCount = sortedGlyphs.length

  // ── SoA column arrays ──
  const glyphIdArr = new Float32Array(glyphCount)
  const boundsArr = new Float32Array(glyphCount * 4) // VEC4: xMin yMin xMax yMax
  const bandLocArr = new Float32Array(glyphCount * 2) // VEC2: x y
  const advanceWidthArr = new Float32Array(glyphCount)
  const lsbArr = new Float32Array(glyphCount)
  const hasOutlineArr = new Float32Array(glyphCount)

  for (let i = 0; i < glyphCount; i++) {
    const g = sortedGlyphs[i]!
    glyphIdArr[i] = g.glyphId
    boundsArr[i * 4] = g.bounds.xMin
    boundsArr[i * 4 + 1] = g.bounds.yMin
    boundsArr[i * 4 + 2] = g.bounds.xMax
    boundsArr[i * 4 + 3] = g.bounds.yMax
    bandLocArr[i * 2] = g.bandLocation.x
    bandLocArr[i * 2 + 1] = g.bandLocation.y
    advanceWidthArr[i] = g.advanceWidth
    lsbArr[i] = g.lsb
    hasOutlineArr[i] = g.curves.length > 0 ? 1 : 0
  }

  // ── Band data: flat USHORT words + FLOAT prefix-sum offsets (N+1) ──
  const totalBandWords = sortedGlyphs.reduce((s, g) => s + bandWordCount(g), 0)
  const bandDataArr = new Uint16Array(totalBandWords)
  const bandOffsets = new Float32Array(glyphCount + 1)

  let wordOff = 0
  for (let i = 0; i < glyphCount; i++) {
    bandOffsets[i] = wordOff
    wordOff += writeBandWords(sortedGlyphs[i]!, bandDataArr, wordOff)
  }
  bandOffsets[glyphCount] = wordOff

  // ── Cmap: USHORT VEC2 [charCode, glyphId] ──
  const cmapArr = new Uint16Array(cmap.length * 2)
  for (let i = 0; i < cmap.length; i++) {
    cmapArr[i * 2] = cmap[i]![0]
    cmapArr[i * 2 + 1] = cmap[i]![1]
  }

  // ── Kern: SHORT SCALAR, stride 3: [g1, g2, value, ...] ──
  const kernArr = new Int16Array(kern.length * 3)
  for (let i = 0; i < kern.length; i++) {
    kernArr[i * 3] = kern[i]![0]
    kernArr[i * 3 + 1] = kern[i]![1]
    kernArr[i * 3 + 2] = kern[i]![2]
  }

  // ── Build glTF-Transform Document ──
  const doc = new Document()
  const buf = doc.createBuffer()

  // Glyph SoA columns
  const accGlyphId = addColumn(doc, buf, 'glyphId', glyphIdArr, 'SCALAR')
  const accBounds = addColumn(doc, buf, 'bounds', boundsArr, 'VEC4')
  const accBandLoc = addColumn(doc, buf, 'bandLoc', bandLocArr, 'VEC2')
  const accAdvanceWidth = addColumn(doc, buf, 'advanceWidth', advanceWidthArr, 'SCALAR')
  const accLsb = addColumn(doc, buf, 'lsb', lsbArr, 'SCALAR')
  const accHasOutline = addColumn(doc, buf, 'hasOutline', hasOutlineArr, 'SCALAR')
  // Cmap + kern
  const accCmap = addColumn(doc, buf, 'cmap', cmapArr, 'VEC2')
  const accKern = addColumn(doc, buf, 'kern', kernArr, 'SCALAR')
  // Bands
  const accBandOffsets = addColumn(doc, buf, 'bandOffsets', bandOffsets, 'SCALAR')
  const accBandData = addColumn(doc, buf, 'bandData', bandDataArr, 'SCALAR')
  // Textures (raw bytes stored in typed accessors; format declared in extension).
  // Cast ArrayBufferLike → ArrayBuffer to match addColumn's typed-array constraint;
  // these arrays are always backed by a plain ArrayBuffer in practice.
  const accCurveTexture = addColumn(
    doc,
    buf,
    'curveTexture',
    new Uint16Array(curveData.buffer as ArrayBuffer, curveData.byteOffset, curveData.length),
    'SCALAR'
  )
  const accBandTexture = addColumn(
    doc,
    buf,
    'bandTexture',
    new Float32Array(bandData.buffer as ArrayBuffer, bandData.byteOffset, bandData.length),
    'SCALAR'
  )

  // ── FL_slug_font extension ──
  const ext = doc.createExtension(FlSlugFontExtension).setRequired(true)

  // Metadata fields (accessor refs are emitted via the 'columns' mechanism).
  // The extension JSON shape (after write) is:
  //   { version, metrics, glyphs:{count}, kern:{stride}, curveTexture:{w,h,format},
  //     bandTexture:{w,h,format}, bands:{glyphCount},
  //     columns: { glyphId:{accessor}, bounds:{accessor}, ... } }
  const metadata: Record<string, unknown> = {
    version: SLUG_FONT_VERSION,
    metrics,
    glyphs: { count: glyphCount },
    kern: { stride: 3 },
    curveTexture: { width: textureWidth, height: curveTextureHeight, format: 'rgba16f' },
    bandTexture: { width: textureWidth, height: bandTextureHeight, format: 'rg32f' },
    bands: { glyphCount },
    ...(input.strokeSets ? { strokeSets: input.strokeSets } : {}),
  }

  const prop = ext.createProperty(metadata)

  // Register accessor refs — these appear in extension JSON under 'columns'
  prop.setAccessorRef('glyphId', accGlyphId)
  prop.setAccessorRef('bounds', accBounds)
  prop.setAccessorRef('bandLoc', accBandLoc)
  prop.setAccessorRef('advanceWidth', accAdvanceWidth)
  prop.setAccessorRef('lsb', accLsb)
  prop.setAccessorRef('hasOutline', accHasOutline)
  prop.setAccessorRef('cmap', accCmap)
  prop.setAccessorRef('kern', accKern)
  prop.setAccessorRef('bandOffsets', accBandOffsets)
  prop.setAccessorRef('bandData', accBandData)
  prop.setAccessorRef('curveTexture', accCurveTexture)
  prop.setAccessorRef('bandTexture', accBandTexture)

  doc.getRoot().setExtension('FL_slug_font', prop)

  // ── Write GLB ──
  const io = new NodeIO().registerExtensions([FlSlugFontExtension])
  return io.writeBinary(doc)
}
