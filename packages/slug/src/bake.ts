/**
 * Node/tooling bake module for the `.slug.glb` binary format.
 *
 * Lives behind the `@three-flatland/slug/bake` subpath so the heavy
 * `@gltf-transform/core` machinery is reachable ONLY here — it never enters
 * the browser `.` static graph. The runtime side (`baked.ts`, `SlugFontLoader`)
 * reads `.slug.glb` through slug's own zero-dep GLB loader (`glb.ts`).
 *
 * ## GLB layout — FL_slug_font extension
 *
 * All numeric data lives in standard glTF accessors in the BIN chunk.
 * The `FL_slug_font` extension in the JSON chunk references them by index.
 *
 * The extension JSON emitted by `packBaked` has shape:
 * ```json
 * {
 *   "version": 2,
 *   "metrics": { ... },
 *   "strokeSets": [...],
 *   "glyphs": { "count": N },
 *   "kern": { "stride": 3 },
 *   "curveTexture": { "width": W, "height": H, "format": "rgba16f" },
 *   "bandTexture":  { "width": W, "height": H, "format": "rg32f" },
 *   "bands": { "glyphCount": N },
 *   "columns": {
 *     "glyphId": { "accessor": <idx> }, "bounds": { "accessor": <idx> }, …
 *   }
 * }
 * ```
 *
 * Format v2 (breaking): the `bandTexture` curve-ref texel packs both curve-texel
 * coords in R (`texelY*4096 + texelX`) plus the curve's axis hull-max in G, so
 * the fill shader can early-exit before the curve-texel loads. `unpackBaked`
 * rejects v1 bakes (unpacked `(texelX, texelY)`, no hull) — re-bake them.
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

import {
  type Accessor,
  type Buffer,
  Document,
  Extension,
  ExtensionProperty,
  type IProperty,
  NodeIO,
  type Nullable,
  PropertyType,
  type ReaderContext,
  RefMap,
  type WriterContext,
} from '@gltf-transform/core'
import type { BakeInput } from './baked.js'
import {
  SLUG_COLUMNS,
  SLUG_EXTENSION_NAME,
  SLUG_FONT_VERSION,
  SLUG_SHAPES_EXTENSION_NAME,
  SLUG_SHAPES_VERSION,
  SLUG_SHAPE_COLUMNS,
  type SlugColumnName,
  type SlugShapeColumnName,
} from './format.js'
import type { SlugGlyphData } from './types.js'

type SupportedTypedArray =
  | Float32Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Int8Array<ArrayBuffer>

/** Create a named glTF `Accessor` from a TypedArray (componentType inferred). */
function addColumn(
  doc: Document,
  buffer: Buffer,
  name: string,
  typedArray: SupportedTypedArray,
  type: string
): Accessor {
  return doc
    .createAccessor(name)
    .setBuffer(buffer)
    .setType(type as Parameters<Accessor['setType']>[0])
    .setArray(typedArray)
}

// ---------------------------------------------------------------------------
// Slug root glTF-Transform extensions (FL_slug_font, FL_slug_shapes)
//
// Root extensions holding plain JSON metadata + named accessor references.
// Emitted JSON shape: { ...metadata, columns: { "<name>": { accessor: <idx> } } }.
// All baked data lives in native accessors; the extension is the reachability
// root that keeps them linked. Both formats share the same property/extension
// behavior — the subclasses only pin the extension name.
// ---------------------------------------------------------------------------

/** Backing data for {@link SlugRootProperty}: a free-form JSON metadata object
 *  plus a named map of accessor references. */
interface ISlugRootProperty extends IProperty {
  metadata: Record<string, unknown>
  accessorRefs: RefMap<Accessor>
}

/** Shared root `ExtensionProperty` behavior — holds the metadata object and
 *  the named accessor refs the writer serializes under `columns`. */
abstract class SlugRootProperty extends ExtensionProperty<ISlugRootProperty> {
  public readonly parentTypes = [PropertyType.ROOT]

  protected init(): void {
    // Concrete values are class fields on the subclasses.
  }

  protected getDefaults(): Nullable<ISlugRootProperty> {
    return Object.assign(super.getDefaults() as IProperty, {
      metadata: {},
      accessorRefs: new RefMap<Accessor>(),
    })
  }

  /** Replace the metadata object (copied defensively). */
  public setMetadata(meta: Record<string, unknown>): this {
    return this.set('metadata', { ...meta })
  }
  /** The metadata object emitted alongside `columns`. */
  public getMetadata(): Record<string, unknown> {
    return this.get('metadata')
  }
  /** Bind `accessor` under a semantic column name (e.g. `'glyphId'`). */
  public setAccessorRef(semantic: string, accessor: Accessor | null): this {
    return this.setRefMap('accessorRefs', semantic, accessor, { usage: 'OTHER' })
  }
  /** The accessor bound to `semantic`, or `null`. */
  public getAccessorRef(semantic: string): Accessor | null {
    return this.getRefMap('accessorRefs', semantic)
  }
  /** All bound semantic column names. */
  public listAccessorSemantics(): string[] {
    return this.listRefMapKeys('accessorRefs')
  }
}

/** Root `ExtensionProperty` for `FL_slug_font`. */
class SlugFontProperty extends SlugRootProperty {
  public static readonly EXTENSION_NAME = SLUG_EXTENSION_NAME
  public readonly extensionName = SLUG_EXTENSION_NAME
  public readonly propertyType = 'FlSlugFontProperty'
}

/** Root `ExtensionProperty` for `FL_slug_shapes`. */
class SlugShapesProperty extends SlugRootProperty {
  public static readonly EXTENSION_NAME = SLUG_SHAPES_EXTENSION_NAME
  public readonly extensionName = SLUG_SHAPES_EXTENSION_NAME
  public readonly propertyType = 'FlSlugShapesProperty'
}

/** Shared read/write for both slug root extensions (name-parameterized). */
abstract class SlugRootExtension extends Extension {
  /** Create a detached root property seeded with `metadata`. */
  public abstract createProperty(metadata: Record<string, unknown>): SlugRootProperty

  /** @hidden */
  public read(context: ReaderContext): this {
    const extJson = context.jsonDoc.json.extensions?.[this.extensionName] as
      | Record<string, unknown>
      | undefined
    if (!extJson) return this

    const columns = extJson['columns'] as Record<string, { accessor: number }> | undefined
    const metadata: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(extJson)) if (k !== 'columns') metadata[k] = v

    const prop = this.createProperty(metadata)
    if (columns) {
      for (const [semantic, { accessor: idx }] of Object.entries(columns)) {
        const acc = context.accessors[idx]
        if (acc) prop.setAccessorRef(semantic, acc)
      }
    }
    this.document.getRoot().setExtension(this.extensionName, prop)
    return this
  }

  /** @hidden */
  public write(context: WriterContext): this {
    const prop = this.document.getRoot().getExtension<SlugRootProperty>(this.extensionName)
    if (!prop) return this

    const columns: Record<string, { accessor: number }> = {}
    for (const semantic of prop.listAccessorSemantics()) {
      const acc = prop.getAccessorRef(semantic)
      if (acc) {
        const idx = context.accessorIndexMap.get(acc)
        if (idx !== undefined) columns[semantic] = { accessor: idx }
      }
    }

    const extJson: Record<string, unknown> = { ...prop.getMetadata() }
    if (Object.keys(columns).length > 0) extJson['columns'] = columns

    context.jsonDoc.json.extensions ??= {}
    context.jsonDoc.json.extensions[this.extensionName] = extJson
    return this
  }
}

/**
 * Registerable glTF-Transform extension for the `FL_slug_font` format.
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
 * (and refuses an `extensionsRequired` file).
 */
export class FlSlugFontExtension extends SlugRootExtension {
  public static readonly EXTENSION_NAME = SLUG_EXTENSION_NAME
  public readonly extensionName = SLUG_EXTENSION_NAME

  /** Create a detached {@link SlugFontProperty} seeded with `metadata`. */
  public createProperty(metadata: Record<string, unknown>): SlugFontProperty {
    const prop = new SlugFontProperty(this.document.getGraph())
    prop.setMetadata(metadata)
    return prop
  }
}

/**
 * Registerable glTF-Transform extension for the `FL_slug_shapes` format
 * (baked `SlugShapeSet` containers written by `packShapeSet`). Same
 * registration story as {@link FlSlugFontExtension}.
 */
export class FlSlugShapesExtension extends SlugRootExtension {
  public static readonly EXTENSION_NAME = SLUG_SHAPES_EXTENSION_NAME
  public readonly extensionName = SLUG_SHAPES_EXTENSION_NAME

  /** Create a detached {@link SlugShapesProperty} seeded with `metadata`. */
  public createProperty(metadata: Record<string, unknown>): SlugShapesProperty {
    const prop = new SlugShapesProperty(this.document.getGraph())
    prop.setMetadata(metadata)
    return prop
  }
}

/** Assert `value` fits losslessly in a Uint16 (0..65535) and return it —
 *  guards every 16-bit write against silent TypedArray wraparound. */
function assertUint16(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`packBaked: ${label} ${value} exceeds Uint16 range (0..65535)`)
  }
  return value
}

/** Assert `value` fits losslessly in an Int16 (-32768..32767) and return it. */
function assertInt16(value: number, label: string): number {
  if (!Number.isInteger(value) || value < -0x8000 || value > 0x7fff) {
    throw new RangeError(`packBaked: ${label} ${value} exceeds Int16 range (-32768..32767)`)
  }
  return value
}

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
  dst[w++] = assertUint16(hBands.length, 'hBand count')
  dst[w++] = assertUint16(vBands.length, 'vBand count')
  for (const band of hBands) dst[w++] = assertUint16(band.curveIndices.length, 'hBand curve count')
  for (const band of hBands)
    for (const idx of band.curveIndices) dst[w++] = assertUint16(idx, 'curve index')
  for (const band of vBands) dst[w++] = assertUint16(band.curveIndices.length, 'vBand curve count')
  for (const band of vBands)
    for (const idx of band.curveIndices) dst[w++] = assertUint16(idx, 'curve index')
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
    cmapArr[i * 2] = assertUint16(cmap[i]![0], 'cmap charCode')
    cmapArr[i * 2 + 1] = assertUint16(cmap[i]![1], 'cmap glyphId')
  }

  // ── Kern: SHORT SCALAR, stride 3: [g1, g2, value, ...] ──
  // g1/g2 are glyph IDs read back via getUint16 (0..65535); the value is read
  // via getInt16 (-32768..32767). Validate against those read semantics.
  const kernArr = new Int16Array(kern.length * 3)
  for (let i = 0; i < kern.length; i++) {
    kernArr[i * 3] = assertUint16(kern[i]![0], 'kern glyph id')
    kernArr[i * 3 + 1] = assertUint16(kern[i]![1], 'kern glyph id')
    kernArr[i * 3 + 2] = assertInt16(kern[i]![2], 'kern value')
  }

  // ── Build glTF-Transform Document ──
  const doc = new Document()
  const buf = doc.createBuffer()

  // Column arrays keyed by the shared contract's column names. Texture columns
  // re-base their source view onto a plain ArrayBuffer to satisfy addColumn's
  // typed-array constraint (these are always ArrayBuffer-backed in practice).
  const columnArrays: Record<SlugColumnName, SupportedTypedArray> = {
    glyphId: glyphIdArr,
    bounds: boundsArr,
    bandLoc: bandLocArr,
    advanceWidth: advanceWidthArr,
    lsb: lsbArr,
    hasOutline: hasOutlineArr,
    cmap: cmapArr,
    kern: kernArr,
    bandOffsets,
    bandData: bandDataArr,
    curveTexture: new Uint16Array(
      curveData.buffer as ArrayBuffer,
      curveData.byteOffset,
      curveData.length
    ),
    bandTexture: new Float32Array(
      bandData.buffer as ArrayBuffer,
      bandData.byteOffset,
      bandData.length
    ),
  }

  // ── FL_slug_font extension ──
  const ext = doc.createExtension(FlSlugFontExtension).setRequired(true)

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

  // Emit one glTF accessor per column from the shared SLUG_COLUMNS contract and
  // register its ref under the same name; the reader resolves these by name.
  for (const { name, type } of SLUG_COLUMNS) {
    const acc = addColumn(doc, buf, name, columnArrays[name], type)
    prop.setAccessorRef(name, acc)
  }

  doc.getRoot().setExtension(SLUG_EXTENSION_NAME, prop)

  // ── Write GLB ──
  const io = new NodeIO().registerExtensions([FlSlugFontExtension])
  return io.writeBinary(doc)
}

/**
 * Pack a `SlugShapeSet` (or anything exposing its `glyphs` map of
 * `SlugGlyphData`) into an `FL_slug_shapes` GLB — the baked shape-set
 * container `SlugShapeSet.fromBaked` rehydrates without SVG parsing or
 * band building. Geometry-complete: curves + contour starts + prebuilt
 * bands round-trip losslessly, so the loaded set renders pixel-identically
 * to the runtime-registered one AND stays growable.
 *
 * **Ordering:** shapes are stored sorted ascending by id; the reader
 * re-registers in the same order, so a repack after load reproduces the
 * exact texel layout the runtime path produces.
 *
 * `meta` is free-form JSON carried verbatim in the extension (surfaced as
 * `SlugShapeSet.meta`) — `uikit-bake icons` stores its icon-name →
 * handle/fill map there.
 */
export async function packShapeSet(
  set: { glyphs: Map<number, SlugGlyphData> },
  meta?: Record<string, unknown>
): Promise<Uint8Array> {
  const sorted = Array.from(set.glyphs.values()).sort((a, b) => a.glyphId - b.glyphId)
  const count = sorted.length
  if (count === 0) throw new Error('packShapeSet: no shapes registered')

  const shapeIdArr = new Float32Array(count)
  const boundsArr = new Float32Array(count * 4)
  const curveOffsets = new Float32Array(count + 1)
  const contourOffsets = new Float32Array(count + 1)
  const bandOffsets = new Float32Array(count + 1)

  let totalCurves = 0
  let totalContours = 0
  let totalBandWords = 0
  for (let i = 0; i < count; i++) {
    const s = sorted[i]!
    if (s.curves.length === 0) {
      throw new Error(`packShapeSet: shape ${s.glyphId} has no curve data (already baked away?)`)
    }
    shapeIdArr[i] = s.glyphId
    boundsArr[i * 4] = s.bounds.xMin
    boundsArr[i * 4 + 1] = s.bounds.yMin
    boundsArr[i * 4 + 2] = s.bounds.xMax
    boundsArr[i * 4 + 3] = s.bounds.yMax
    curveOffsets[i] = totalCurves
    contourOffsets[i] = totalContours
    bandOffsets[i] = totalBandWords
    totalCurves += s.curves.length
    totalContours += s.contourStarts.length
    totalBandWords += bandWordCount(s)
  }
  curveOffsets[count] = totalCurves
  contourOffsets[count] = totalContours
  bandOffsets[count] = totalBandWords

  const curveData = new Float32Array(totalCurves * 6)
  const contourStarts = new Float32Array(totalContours)
  const bandDataArr = new Uint16Array(totalBandWords)

  let curveOff = 0
  let contourOff = 0
  let wordOff = 0
  for (const s of sorted) {
    for (const c of s.curves) {
      const o = curveOff * 6
      curveData[o] = c.p0x
      curveData[o + 1] = c.p0y
      curveData[o + 2] = c.p1x
      curveData[o + 3] = c.p1y
      curveData[o + 4] = c.p2x
      curveData[o + 5] = c.p2y
      curveOff++
    }
    for (const start of s.contourStarts) contourStarts[contourOff++] = start
    wordOff += writeBandWords(s, bandDataArr, wordOff)
  }

  const columnArrays: Record<SlugShapeColumnName, SupportedTypedArray> = {
    shapeId: shapeIdArr,
    bounds: boundsArr,
    curveOffsets,
    curveData,
    contourOffsets,
    contourStarts,
    bandOffsets,
    bandData: bandDataArr,
  }

  const doc = new Document()
  const buf = doc.createBuffer()
  const ext = doc.createExtension(FlSlugShapesExtension).setRequired(true)

  const metadata: Record<string, unknown> = {
    version: SLUG_SHAPES_VERSION,
    shapes: { count },
    ...(meta !== undefined ? { meta } : {}),
  }
  const prop = ext.createProperty(metadata)

  for (const { name, type } of SLUG_SHAPE_COLUMNS) {
    const acc = addColumn(doc, buf, name, columnArrays[name], type)
    prop.setAccessorRef(name, acc)
  }
  doc.getRoot().setExtension(SLUG_SHAPES_EXTENSION_NAME, prop)

  const io = new NodeIO().registerExtensions([FlSlugShapesExtension])
  return io.writeBinary(doc)
}
