import type { DataTexture } from 'three'
import type { BakedFontData } from './baked.js'
import type { SlugGlyphData, PositionedGlyph, SlugTextureData } from './types.js'

/**
 * Font data container for Slug GPU text rendering.
 *
 * Load fonts via `SlugFontLoader` — the single entry point for all loading:
 *
 * @example
 * ```typescript
 * // Vanilla
 * const font = await SlugFontLoader.load('/fonts/Inter-Regular.ttf')
 *
 * // R3F
 * const font = useLoader(SlugFontLoader, '/fonts/Inter-Regular.ttf')
 * ```
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

  // --- Shaping backends (one or the other is set by the loader) ---
  /** @internal */ _opentypeFont: import('opentype.js').Font | null = null
  /** @internal */ _shapeTextOT: typeof import('./pipeline/textShaper.js').shapeText | null = null
  /** @internal */ _bakedData: BakedFontData | null = null
  /** @internal */ _shapeTextBaked: typeof import('./pipeline/textShaperBaked.js').shapeTextBaked | null = null

  /** @internal — Use SlugFontLoader to create instances. */
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

  /** @internal — Called by SlugFontLoader for baked path. */
  static _createBaked(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: { unitsPerEm: number; ascender: number; descender: number; capHeight: number },
    bakedData: BakedFontData,
    shapeTextBaked: typeof import('./pipeline/textShaperBaked.js').shapeTextBaked,
  ): SlugFont {
    const font = new SlugFont(glyphs, textures, metrics)
    font._bakedData = bakedData
    font._shapeTextBaked = shapeTextBaked
    return font
  }

  /** @internal — Called by SlugFontLoader for runtime path. */
  static _createRuntime(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: { unitsPerEm: number; ascender: number; descender: number; capHeight: number },
    otFont: import('opentype.js').Font,
    shapeText: typeof import('./pipeline/textShaper.js').shapeText,
  ): SlugFont {
    const font = new SlugFont(glyphs, textures, metrics)
    font._opentypeFont = otFont
    font._shapeTextOT = shapeText
    return font
  }

  /**
   * Shape a text string into positioned glyphs.
   * Uses baked shaper (no opentype.js) when loaded from baked data,
   * or opentype.js shaper when loaded from .ttf at runtime.
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
    if (this._bakedData && this._shapeTextBaked) {
      return this._shapeTextBaked(this._bakedData, this.glyphs, this.unitsPerEm, text, fontSize, options)
    }
    if (this._opentypeFont && this._shapeTextOT) {
      return this._shapeTextOT(this._opentypeFont, text, fontSize, options)
    }
    throw new Error('SlugFont: text shaping not available — load via SlugFontLoader')
  }

  getHBandCount(glyphId: number): number {
    return this.glyphs.get(glyphId)?.bands.hBands.length ?? 0
  }

  getVBandCount(glyphId: number): number {
    return this.glyphs.get(glyphId)?.bands.vBands.length ?? 0
  }

  dispose(): void {
    this.curveTexture.dispose()
    this.bandTexture.dispose()
  }
}
