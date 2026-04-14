import {
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  Uint16BufferAttribute,
} from 'three'
import type { SlugFont } from './SlugFont.js'
import type { DecorationRect, PositionedGlyph, SlugGlyphData } from './types.js'

/** Default initial capacity for glyph instances. */
const DEFAULT_CAPACITY = 256

/**
 * Instanced quad geometry for Slug text rendering.
 *
 * Base geometry: 4 vertices forming a unit quad.
 * Instance attributes (5x vec4 per glyph):
 *   glyphPos  — object-space position (xy) + outward normal (zw)
 *   glyphTex  — em-space coord (xy) + glyph band location X (z) + band location Y (w)
 *   glyphJac  — inverse Jacobian 2x2 matrix
 *   glyphBand — band transform: scale(xy) + offset(zw)
 *   glyphColor — RGBA per-glyph color
 */
export class SlugGeometry extends BufferGeometry {
  private _capacity: number
  private _count = 0

  private _glyphPos: Float32Array
  private _glyphTex: Float32Array
  private _glyphJac: Float32Array
  private _glyphBand: Float32Array
  private _glyphColor: Float32Array

  private _glyphPosAttr: InstancedBufferAttribute
  private _glyphTexAttr: InstancedBufferAttribute
  private _glyphJacAttr: InstancedBufferAttribute
  private _glyphBandAttr: InstancedBufferAttribute
  private _glyphColorAttr: InstancedBufferAttribute

  constructor(capacity: number = DEFAULT_CAPACITY) {
    super()
    this._capacity = capacity

    // Base quad geometry (unit square centered at origin)
    // Vertices: 4 corners of [-0.5, 0.5] quad
    const positions = new Float32Array([
      -0.5, -0.5, 0, // bottom-left
      0.5, -0.5, 0, // bottom-right
      0.5, 0.5, 0, // top-right
      -0.5, 0.5, 0, // top-left
    ])
    const uvs = new Float32Array([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ])
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3])

    this.setAttribute('position', new Float32BufferAttribute(positions, 3))
    this.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    this.setIndex(new Uint16BufferAttribute(indices, 1))

    // Allocate instance attribute buffers
    this._glyphPos = new Float32Array(capacity * 4)
    this._glyphTex = new Float32Array(capacity * 4)
    this._glyphJac = new Float32Array(capacity * 4)
    this._glyphBand = new Float32Array(capacity * 4)
    this._glyphColor = new Float32Array(capacity * 4)

    // Create instanced buffer attributes
    this._glyphPosAttr = new InstancedBufferAttribute(this._glyphPos, 4)
    this._glyphTexAttr = new InstancedBufferAttribute(this._glyphTex, 4)
    this._glyphJacAttr = new InstancedBufferAttribute(this._glyphJac, 4)
    this._glyphBandAttr = new InstancedBufferAttribute(this._glyphBand, 4)
    this._glyphColorAttr = new InstancedBufferAttribute(this._glyphColor, 4)

    this.setAttribute('glyphPos', this._glyphPosAttr)
    this.setAttribute('glyphTex', this._glyphTexAttr)
    this.setAttribute('glyphJac', this._glyphJacAttr)
    this.setAttribute('glyphBand', this._glyphBandAttr)
    this.setAttribute('glyphColor', this._glyphColorAttr)
  }

  /**
   * Set glyph instances from positioned glyphs and (optional) decoration
   * rectangles.
   *
   * Decoration rects are appended after the glyph instances in the same
   * InstancedMesh. They use the rect-sentinel encoding: `glyphJac.w` is
   * negative, which `SlugMaterial`'s fragment shader detects and short-
   * circuits to constant coverage = 1 (skipping the curve evaluation
   * entirely). One draw call covers both glyphs and decorations.
   */
  setGlyphs(
    glyphs: PositionedGlyph[],
    font: SlugFont,
    color: { r: number; g: number; b: number; a: number } = { r: 1, g: 1, b: 1, a: 1 },
    decorations: readonly DecorationRect[] = [],
  ): void {
    const total = glyphs.length + decorations.length
    if (total > this._capacity) this._grow(total)

    this._count = total

    let idx = 0
    for (let i = 0; i < glyphs.length; i++) {
      const pg = glyphs[i]!
      const glyphData = font.glyphs.get(pg.glyphId)
      if (!glyphData) continue
      this._writeGlyphInstance(idx, pg, glyphData, font, color)
      idx++
    }

    for (let i = 0; i < decorations.length; i++) {
      this._writeDecorationInstance(idx, decorations[i]!, color)
      idx++
    }

    // The actual live count is `idx` (some glyphs may have been skipped
    // when their data is missing). Update the count to match.
    this._count = idx

    this._glyphPosAttr.needsUpdate = true
    this._glyphTexAttr.needsUpdate = true
    this._glyphJacAttr.needsUpdate = true
    this._glyphBandAttr.needsUpdate = true
    this._glyphColorAttr.needsUpdate = true
  }

  /**
   * Write a rect-sentinel instance for an underline / strikethrough rect.
   * Sentinel: `glyphJac.w = -1` triggers the fragment shader to bypass
   * curve evaluation and output coverage=1 across the entire quad.
   */
  private _writeDecorationInstance(
    index: number,
    rect: DecorationRect,
    color: { r: number; g: number; b: number; a: number },
  ): void {
    const i4 = index * 4
    this._glyphPos[i4] = rect.x
    this._glyphPos[i4 + 1] = rect.y
    this._glyphPos[i4 + 2] = rect.width * 0.5
    this._glyphPos[i4 + 3] = rect.height * 0.5

    this._glyphTex[i4] = 0
    this._glyphTex[i4 + 1] = 0
    this._glyphTex[i4 + 2] = 0
    this._glyphTex[i4 + 3] = 0

    // invScale must remain finite (used by dilation math); pick 1 so the
    // dilation produces a sensible em-space delta even though we skip the
    // curve eval. Set glyphJac.w to negative as the rect sentinel.
    this._glyphJac[i4] = 1
    this._glyphJac[i4 + 1] = 1
    this._glyphJac[i4 + 2] = 0
    this._glyphJac[i4 + 3] = -1

    this._glyphBand[i4] = 0
    this._glyphBand[i4 + 1] = 0
    this._glyphBand[i4 + 2] = 0
    this._glyphBand[i4 + 3] = 0

    this._glyphColor[i4] = color.r
    this._glyphColor[i4 + 1] = color.g
    this._glyphColor[i4 + 2] = color.b
    this._glyphColor[i4 + 3] = color.a
  }

  private _writeGlyphInstance(
    index: number,
    pg: PositionedGlyph,
    glyph: SlugGlyphData,
    font: SlugFont,
    color: { r: number; g: number; b: number; a: number },
  ): void {
    const { bounds, bandLocation, bands } = glyph

    // Bounds are in normalized em-space (divided by unitsPerEm in font parser).
    // To get object-space size we need fontSize, not scale (= fontSize/unitsPerEm).
    // Using scale would double-normalize.
    const fontSize = pg.scale * font.unitsPerEm
    const width = (bounds.xMax - bounds.xMin) * fontSize
    const height = (bounds.yMax - bounds.yMin) * fontSize
    const cx = pg.x + (bounds.xMin + bounds.xMax) * 0.5 * fontSize
    const cy = pg.y + (bounds.yMin + bounds.yMax) * 0.5 * fontSize

    // glyphPos: center position (xy) + outward normal scale (zw)
    // The normal is used for dilation — encode quad half-size as the normal magnitude
    const i4 = index * 4
    this._glyphPos[i4] = cx
    this._glyphPos[i4 + 1] = cy
    this._glyphPos[i4 + 2] = width * 0.5 // normal x (half-width for dilation)
    this._glyphPos[i4 + 3] = height * 0.5 // normal y (half-height for dilation)

    // glyphTex: em-space center (xy) + band texture location (zw)
    const emCenterX = (bounds.xMin + bounds.xMax) * 0.5
    const emCenterY = (bounds.yMin + bounds.yMax) * 0.5
    this._glyphTex[i4] = emCenterX
    this._glyphTex[i4 + 1] = emCenterY
    this._glyphTex[i4 + 2] = bandLocation.x
    this._glyphTex[i4 + 3] = bandLocation.y

    // Band counts needed by both Jacobian and band transform
    const numHBands = bands.hBands.length
    const numVBands = bands.vBands.length

    // glyphJac: inverse Jacobian scale (xy) + band counts (zw)
    // Maps object-space displacement back to em-space: 1/fontSize.
    const invScale = 1 / fontSize
    this._glyphJac[i4] = invScale
    this._glyphJac[i4 + 1] = invScale
    this._glyphJac[i4 + 2] = numHBands
    this._glyphJac[i4 + 3] = numVBands

    // glyphBand: transform from em-space to band index
    const emWidth = bounds.xMax - bounds.xMin
    const emHeight = bounds.yMax - bounds.yMin

    const bandScaleX = emWidth > 0 ? numVBands / emWidth : 0
    const bandScaleY = emHeight > 0 ? numHBands / emHeight : 0
    const bandOffsetX = -bounds.xMin * bandScaleX
    const bandOffsetY = -bounds.yMin * bandScaleY

    this._glyphBand[i4] = bandScaleX
    this._glyphBand[i4 + 1] = bandScaleY
    this._glyphBand[i4 + 2] = bandOffsetX
    this._glyphBand[i4 + 3] = bandOffsetY

    // glyphColor: RGBA
    this._glyphColor[i4] = color.r
    this._glyphColor[i4 + 1] = color.g
    this._glyphColor[i4 + 2] = color.b
    this._glyphColor[i4 + 3] = color.a
  }

  private _grow(minCapacity: number): void {
    const newCapacity = Math.max(minCapacity, this._capacity * 2)

    const newGlyphPos = new Float32Array(newCapacity * 4)
    const newGlyphTex = new Float32Array(newCapacity * 4)
    const newGlyphJac = new Float32Array(newCapacity * 4)
    const newGlyphBand = new Float32Array(newCapacity * 4)
    const newGlyphColor = new Float32Array(newCapacity * 4)

    newGlyphPos.set(this._glyphPos)
    newGlyphTex.set(this._glyphTex)
    newGlyphJac.set(this._glyphJac)
    newGlyphBand.set(this._glyphBand)
    newGlyphColor.set(this._glyphColor)

    this._glyphPos = newGlyphPos
    this._glyphTex = newGlyphTex
    this._glyphJac = newGlyphJac
    this._glyphBand = newGlyphBand
    this._glyphColor = newGlyphColor

    this._glyphPosAttr = new InstancedBufferAttribute(this._glyphPos, 4)
    this._glyphTexAttr = new InstancedBufferAttribute(this._glyphTex, 4)
    this._glyphJacAttr = new InstancedBufferAttribute(this._glyphJac, 4)
    this._glyphBandAttr = new InstancedBufferAttribute(this._glyphBand, 4)
    this._glyphColorAttr = new InstancedBufferAttribute(this._glyphColor, 4)

    this.setAttribute('glyphPos', this._glyphPosAttr)
    this.setAttribute('glyphTex', this._glyphTexAttr)
    this.setAttribute('glyphJac', this._glyphJacAttr)
    this.setAttribute('glyphBand', this._glyphBandAttr)
    this.setAttribute('glyphColor', this._glyphColorAttr)

    this._capacity = newCapacity
  }

  get glyphCount(): number {
    return this._count
  }

  get capacity(): number {
    return this._capacity
  }
}
