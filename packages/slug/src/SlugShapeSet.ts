import type { DataTexture } from 'three'
import { buildGpuGlyphData } from './pipeline/buildGpuGlyph.js'
import { packTextures } from './pipeline/texturePacker.js'
import { readGlb } from './glb.js'
import { readBandWords } from './baked.js'
import { SLUG_SHAPES_EXTENSION_NAME, SLUG_SHAPES_VERSION } from './format.js'
import type { QuadContour, QuadCurve, SlugGlyphData, SlugTextureData } from './types.js'

/**
 * A registered shape — structurally the same record a font glyph gets
 * (`SlugGlyphData`), so `SlugShapeSet` plugs into the existing writer and
 * texture-packing machinery unchanged. `glyphId` is the shape's handle id
 * within its set.
 */
export type SlugShapeHandle = SlugGlyphData

/**
 * "A font whose glyphs are SVG paths" — an incrementally-built registry of
 * closed quadratic-Bezier contours sharing ONE curve/band DataTexture pair,
 * exactly like `SlugFont`. Satisfies `SlugGlyphSource`, so `SlugShapeBatch`
 * (and `SlugMaterial`) bind it the same way they bind a font.
 *
 * Registration is CPU-side and cheap; textures are (re)packed lazily on
 * first texture access after a registration. **Data textures of curve
 * control points — zero render targets exist anywhere in this pipeline.**
 *
 * Growth invariant: `packTextures` packs shapes in insertion order and new
 * shapes only ever append, so a repack NEVER moves previously registered
 * shapes — their `bandLocation`/`curveLocation` and already-written batch
 * instances stay valid. Only the texture *objects* are new after a repack
 * (`version` increments); `SlugShapeBatch.update` re-binds automatically.
 */
export class SlugShapeSet {
  /** Registered shapes keyed by handle id (name matches `SlugFont.glyphs` for writer compat). */
  readonly glyphs = new Map<number, SlugGlyphData>()

  private _nextId = 0
  private _dirty = false
  private _textures: SlugTextureData | null = null
  private _version = 0

  /**
   * Register one shape (a list of closed contours; holes are just
   * counter-wound or nested contours, per the material's fill rule).
   * Returns the shape's handle — pass it to `SlugShapeBatch.writeShape`.
   *
   * Contours must already be in the set's shape space (e.g. `slug/svg`'s
   * normalized, y-up unit box). Coordinates are stored half-float in the
   * curve texture, so keep them within ~[-2, 2] for full precision.
   */
  registerShape(contours: QuadContour[]): SlugShapeHandle {
    const curves: QuadCurve[] = []
    const contourStarts: number[] = []
    for (const contour of contours) {
      if (contour.length === 0) continue
      contourStarts.push(curves.length)
      // Defensive copy + float32 snap: serialization stores float32, so
      // quantizing at the door makes bake → load round-trips BIT-exact
      // (curve texture is half-float — far coarser — so no fidelity cost).
      for (const c of contour) {
        curves.push({
          p0x: Math.fround(c.p0x),
          p0y: Math.fround(c.p0y),
          p1x: Math.fround(c.p1x),
          p1y: Math.fround(c.p1y),
          p2x: Math.fround(c.p2x),
          p2y: Math.fround(c.p2y),
        })
      }
    }
    if (curves.length === 0) {
      throw new Error('SlugShapeSet.registerShape: shape has no curves')
    }

    const id = this._nextId++
    const data = buildGpuGlyphData(id, curves, contourStarts, 0, 0)
    // Snap bounds to float32, same as the control points above. The tight
    // extremum bound (B(t*)) is a full-precision value, not one of the
    // float32 control points, so it would otherwise drift in the low bits
    // across the .glb (float32) bake round-trip and break the shapes
    // bit-exact contract. Snapping here keeps setA == fromBaked exactly.
    data.bounds.xMin = Math.fround(data.bounds.xMin)
    data.bounds.yMin = Math.fround(data.bounds.yMin)
    data.bounds.xMax = Math.fround(data.bounds.xMax)
    data.bounds.yMax = Math.fround(data.bounds.yMax)
    // advanceWidth/lsb are font-layout concepts; for shapes, advance = ink
    // width and lsb = ink start, so metrics-driven callers see sane values.
    data.advanceWidth = data.bounds.xMax - data.bounds.xMin
    data.lsb = data.bounds.xMin
    this.glyphs.set(id, data)
    this._dirty = true
    return data
  }

  /** Registered shape count. */
  get shapeCount(): number {
    return this.glyphs.size
  }

  /** Look up a registered shape by handle id. */
  getShape(id: number): SlugShapeHandle | undefined {
    return this.glyphs.get(id)
  }

  /**
   * Monotonic pack counter. Increments every time the textures are
   * (re)built — consumers holding a material over the old texture objects
   * (e.g. `SlugShapeBatch`) compare against it and re-bind when stale.
   */
  get version(): number {
    this._ensurePacked()
    return this._version
  }

  /** RGBA16F Bezier control-point texture (packs lazily). */
  get curveTexture(): DataTexture {
    this._ensurePacked()
    return this._textures!.curveTexture
  }

  /** R32F band header + curve reference texture (packed, packs lazily). */
  get bandTexture(): DataTexture {
    this._ensurePacked()
    return this._textures!.bandTexture
  }

  /** Texture width in texels. */
  get textureWidth(): number {
    this._ensurePacked()
    return this._textures!.textureWidth
  }

  private _ensurePacked(): void {
    if (!this._dirty && this._textures) return
    if (this.glyphs.size === 0) {
      throw new Error('SlugShapeSet: no shapes registered')
    }
    this._textures?.curveTexture.dispose()
    this._textures?.bandTexture.dispose()
    // packTextures fills each shape's bandLocation/curveLocation in place.
    // Insertion order is stable and new shapes append, so previously packed
    // shapes land on identical texels (see class doc growth invariant).
    this._textures = packTextures(this.glyphs)
    this._dirty = false
    this._version++
  }

  /** Dispose the packed textures. The CPU-side shape registry stays usable. */
  dispose(): void {
    this._textures?.curveTexture.dispose()
    this._textures?.bandTexture.dispose()
    this._textures = null
    this._dirty = true
  }

  /**
   * Rehydrate a set baked by `packShapeSet` (`@three-flatland/slug/bake`).
   * No SVG parsing, no band building — curves, contours, and prebuilt bands
   * are read straight from the GLB; only the linear-copy texture pack runs
   * (lazily). The set stays growable: `registerShape` continues from the
   * highest baked id + 1.
   */
  static fromBaked(buffer: ArrayBuffer): SlugShapeSet {
    const glb = readGlb(buffer)
    const ext = glb.ext<Record<string, unknown>>(SLUG_SHAPES_EXTENSION_NAME)
    if (!ext) {
      throw new Error(`SlugShapeSet.fromBaked: ${SLUG_SHAPES_EXTENSION_NAME} extension not found`)
    }
    const version = ext['version']
    if (typeof version !== 'number' || version > SLUG_SHAPES_VERSION) {
      throw new Error(
        `SlugShapeSet.fromBaked: unsupported ${SLUG_SHAPES_EXTENSION_NAME} version ` +
          `${String(version)} (this build supports up to ${SLUG_SHAPES_VERSION}).`
      )
    }
    const shapesMeta = ext['shapes'] as { count?: number } | undefined
    const count = shapesMeta?.count
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`SlugShapeSet.fromBaked: invalid shapes.count ${String(count)}`)
    }

    const columns = ext['columns'] as Record<string, { accessor: number }> | undefined
    const col = (name: string) => {
      const ref = columns?.[name]
      if (!ref) throw new Error(`SlugShapeSet.fromBaked: missing column '${name}'`)
      return glb.accessor(ref.accessor)
    }

    const shapeIdArr = col('shapeId') as Float32Array
    const boundsArr = col('bounds') as Float32Array
    const curveOffsets = col('curveOffsets') as Float32Array
    const curveData = col('curveData') as Float32Array
    const contourOffsets = col('contourOffsets') as Float32Array
    const contourStartsArr = col('contourStarts') as Float32Array
    const bandOffsets = col('bandOffsets') as Float32Array
    const bandData = col('bandData') as Uint16Array

    const set = new SlugShapeSet()
    for (let i = 0; i < count; i++) {
      const id = shapeIdArr[i]!

      const curves: QuadCurve[] = []
      for (let c = curveOffsets[i]!; c < curveOffsets[i + 1]!; c++) {
        const o = c * 6
        curves.push({
          p0x: curveData[o]!,
          p0y: curveData[o + 1]!,
          p1x: curveData[o + 2]!,
          p1y: curveData[o + 3]!,
          p2x: curveData[o + 4]!,
          p2y: curveData[o + 5]!,
        })
      }

      const contourStarts: number[] = []
      for (let s = contourOffsets[i]!; s < contourOffsets[i + 1]!; s++) {
        contourStarts.push(contourStartsArr[s]!)
      }

      const bands = readBandWords(
        bandData,
        bandOffsets[i]!,
        bandOffsets[i + 1]!,
        `SlugShapeSet.fromBaked: shape ${id}`
      )

      const bounds = {
        xMin: boundsArr[i * 4]!,
        yMin: boundsArr[i * 4 + 1]!,
        xMax: boundsArr[i * 4 + 2]!,
        yMax: boundsArr[i * 4 + 3]!,
      }

      set.glyphs.set(id, {
        glyphId: id,
        curves,
        contourStarts,
        bands,
        bounds,
        advanceWidth: bounds.xMax - bounds.xMin,
        lsb: bounds.xMin,
        bandLocation: { x: 0, y: 0 },
        curveLocation: { x: 0, y: 0 },
      })
      set._nextId = Math.max(set._nextId, id + 1)
    }
    set._dirty = true

    // Arbitrary bake-time metadata round-trips for consumers (e.g.
    // `uikit-bake icons` stores its name → handle/fill map here).
    set.meta = ext['meta'] as Record<string, unknown> | undefined
    return set
  }

  /**
   * Free-form metadata carried by the baked container (`packShapeSet`'s
   * `meta` argument). `undefined` for runtime-built sets.
   */
  meta: Record<string, unknown> | undefined
}
