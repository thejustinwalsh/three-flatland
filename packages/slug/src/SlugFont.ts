import type { DataTexture } from 'three'
import { parseFont } from './pipeline/fontParser.js'
import { packTextures } from './pipeline/texturePacker.js'
import { shapeText } from './pipeline/textShaper.js'
import type { SlugGlyphData, PositionedGlyph, SlugTextureData } from './types.js'

/**
 * Font data container for Slug GPU text rendering.
 *
 * Holds parsed glyph outlines, spatial band structures, and packed GPU textures.
 * Provides text shaping (string → positioned glyphs).
 */
export class SlugFont {
  /** Glyph data indexed by glyph ID. */
  readonly glyphs: Map<number, SlugGlyphData>

  /** RGBA32Float DataTexture containing Bezier control points. */
  readonly curveTexture: DataTexture

  /** Float-encoded band header + curve reference DataTexture. */
  readonly bandTexture: DataTexture

  /** Texture width in texels. */
  readonly textureWidth: number

  /** Font units per em. */
  readonly unitsPerEm: number

  /** Ascender in em-space (0–1 range). */
  readonly ascender: number

  /** Descender in em-space (negative). */
  readonly descender: number

  /** Cap height in em-space. */
  readonly capHeight: number

  /** The underlying opentype.js Font for text shaping. */
  private _opentypeFont: import('opentype.js').Font | null = null

  constructor(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: {
      unitsPerEm: number
      ascender: number
      descender: number
      capHeight: number
    },
  ) {
    this.glyphs = glyphs
    this.curveTexture = textures.curveTexture
    this.bandTexture = textures.bandTexture
    this.textureWidth = textures.textureWidth
    this.unitsPerEm = metrics.unitsPerEm
    this.ascender = metrics.ascender
    this.descender = metrics.descender
    this.capHeight = metrics.capHeight
  }

  /**
   * Create a SlugFont from a font file ArrayBuffer.
   */
  /**
   * Create a SlugFont from a font file ArrayBuffer.
   */
  static async fromArrayBuffer(buffer: ArrayBuffer): Promise<SlugFont> {
    const opentype = await import('opentype.js')

    const { glyphs, unitsPerEm, ascender, descender, capHeight } = parseFont(buffer)
    const textures = packTextures(glyphs)

    const otFont = opentype.parse(buffer)

    const font = new SlugFont(glyphs, textures, {
      unitsPerEm,
      ascender,
      descender,
      capHeight,
    })
    font._opentypeFont = otFont
    return font
  }

  /**
   * Create a SlugFont from a URL.
   */
  static async fromURL(url: string): Promise<SlugFont> {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return SlugFont.fromArrayBuffer(buffer)
  }

  /**
   * Shape a text string into positioned glyphs.
   */
  shapeText(
    text: string,
    fontSize: number,
    options?: {
      align?: 'left' | 'center' | 'right'
      lineHeight?: number
      maxWidth?: number
    },
  ): PositionedGlyph[] {
    if (!this._opentypeFont) {
      throw new Error('SlugFont: opentype.js font not available for text shaping')
    }
    return shapeText(this._opentypeFont, text, fontSize, options)
  }

  /**
   * Get the number of horizontal bands for a glyph.
   */
  getHBandCount(glyphId: number): number {
    return this.glyphs.get(glyphId)?.bands.hBands.length ?? 0
  }

  /**
   * Get the number of vertical bands for a glyph.
   */
  getVBandCount(glyphId: number): number {
    return this.glyphs.get(glyphId)?.bands.vBands.length ?? 0
  }

  /**
   * Dispose GPU resources.
   */
  dispose(): void {
    this.curveTexture.dispose()
    this.bandTexture.dispose()
  }
}
