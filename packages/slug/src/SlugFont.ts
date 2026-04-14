import type { DataTexture } from 'three'
import type { BakedFontData } from './baked.js'
import { cmapLookup } from './baked.js'
import type {
  SlugGlyphData,
  PositionedGlyph,
  SlugTextureData,
  TextMetrics,
  ParagraphMetrics,
  MeasureParagraphOptions,
  StyleSpan,
  DecorationRect,
} from './types.js'
import { emitDecorations } from './pipeline/decorations.js'

/**
 * Per-font metrics passed into `SlugFont`. Mirrors `parseFont`'s output and
 * the subset of `BakedJSON.metrics` needed at runtime — both loader paths
 * construct one of these.
 */
export interface SlugFontMetrics {
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

  /** Underline stroke bottom-edge y, em-space (negative — below baseline). */
  readonly underlinePosition: number
  /** Underline stroke thickness, em-space. */
  readonly underlineThickness: number
  /** Strikethrough stroke bottom-edge y, em-space. */
  readonly strikethroughPosition: number
  /** Strikethrough stroke thickness, em-space. */
  readonly strikethroughThickness: number
  /** Per-font subscript scale (xx, yy). */
  readonly subscriptScale: { x: number; y: number }
  /** Per-font subscript offset (x, y), em-space. Y is negative — moves down. */
  readonly subscriptOffset: { x: number; y: number }
  /** Per-font superscript scale (xx, yy). */
  readonly superscriptScale: { x: number; y: number }
  /** Per-font superscript offset (x, y), em-space. Y is positive — raises. */
  readonly superscriptOffset: { x: number; y: number }

  // --- Shaping backends (one or the other is set by the loader) ---
  /** @internal */ _opentypeFont: import('opentype.js').Font | null = null
  /** @internal */ _shapeTextOT: typeof import('./pipeline/textShaper.js').shapeText | null = null
  /** @internal */ _wrapLinesOT: typeof import('./pipeline/wrapLines.js').wrapLines | null = null
  /** @internal */ _measureTextOT: typeof import('./pipeline/textMeasure.js').measureText | null = null
  /** @internal */ _bakedData: BakedFontData | null = null
  /** @internal */ _shapeTextBaked: typeof import('./pipeline/textShaperBaked.js').shapeTextBaked | null = null
  /** @internal */ _wrapLinesBaked: typeof import('./pipeline/wrapLinesBaked.js').wrapLinesBaked | null = null
  /** @internal */ _measureTextBaked: typeof import('./pipeline/textMeasureBaked.js').measureTextBaked | null = null

  /** @internal — Use SlugFontLoader to create instances. */
  constructor(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: SlugFontMetrics,
  ) {
    this.glyphs = glyphs
    this.curveTexture = textures.curveTexture
    this.bandTexture = textures.bandTexture
    this.textureWidth = textures.textureWidth
    this.unitsPerEm = metrics.unitsPerEm
    this.ascender = metrics.ascender
    this.descender = metrics.descender
    this.capHeight = metrics.capHeight
    this.underlinePosition = metrics.underlinePosition
    this.underlineThickness = metrics.underlineThickness
    this.strikethroughPosition = metrics.strikethroughPosition
    this.strikethroughThickness = metrics.strikethroughThickness
    this.subscriptScale = metrics.subscriptScale
    this.subscriptOffset = metrics.subscriptOffset
    this.superscriptScale = metrics.superscriptScale
    this.superscriptOffset = metrics.superscriptOffset
  }

  /** @internal — Called by SlugFontLoader for baked path. */
  static _createBaked(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: SlugFontMetrics,
    bakedData: BakedFontData,
    shapeTextBaked: typeof import('./pipeline/textShaperBaked.js').shapeTextBaked,
    wrapLinesBaked: typeof import('./pipeline/wrapLinesBaked.js').wrapLinesBaked,
    measureTextBaked: typeof import('./pipeline/textMeasureBaked.js').measureTextBaked,
  ): SlugFont {
    const font = new SlugFont(glyphs, textures, metrics)
    font._bakedData = bakedData
    font._shapeTextBaked = shapeTextBaked
    font._wrapLinesBaked = wrapLinesBaked
    font._measureTextBaked = measureTextBaked
    return font
  }

  /** @internal — Called by SlugFontLoader for runtime path. */
  static _createRuntime(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: SlugFontMetrics,
    otFont: import('opentype.js').Font,
    shapeText: typeof import('./pipeline/textShaper.js').shapeText,
    wrapLines: typeof import('./pipeline/wrapLines.js').wrapLines,
    measureText: typeof import('./pipeline/textMeasure.js').measureText,
  ): SlugFont {
    const font = new SlugFont(glyphs, textures, metrics)
    font._opentypeFont = otFont
    font._shapeTextOT = shapeText
    font._wrapLinesOT = wrapLines
    font._measureTextOT = measureText
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

  /**
   * Measure a single unwrapped line of text.
   *
   * Spiritually aligned with `CanvasRenderingContext2D.measureText` — same
   * field names, single-line semantics, no wrap. Multi-line paragraph
   * layout is the caller's job (or a later rich-text API).
   *
   * Uses the same advance-width source as `shapeText` and `wrapText`, so
   * widths agree across all three APIs.
   */
  measureText(text: string, fontSize: number): TextMetrics {
    if (this._bakedData && this._measureTextBaked) {
      return this._measureTextBaked(
        this._bakedData,
        this.glyphs,
        this.unitsPerEm,
        this.ascender,
        this.descender,
        text,
        fontSize,
      )
    }
    if (this._opentypeFont && this._measureTextOT) {
      return this._measureTextOT(this._opentypeFont, this.glyphs, text, fontSize)
    }
    throw new Error('SlugFont: text measurement not available — load via SlugFontLoader')
  }

  /**
   * Measure a multi-line (optionally wrapped) block of text.
   *
   * Convenience over `wrapText` + per-line `measureText`. Respects the same
   * `lineHeight` multiplier used by `SlugText` (default 1.2), so the block
   * height here matches what the shaper lays out.
   *
   * - `width` is the widest line's advance — bounded above by `maxWidth`.
   * - `height = lines.length * fontSize * lineHeight`.
   * - Call with `maxWidth` omitted to measure unwrapped multi-line text
   *   (still honours embedded `\n` as forced breaks via the shaper).
   */
  measureParagraph(
    text: string,
    fontSize: number,
    options: MeasureParagraphOptions = {},
  ): ParagraphMetrics {
    const lineHeight = options.lineHeight ?? 1.2
    const lines = this.wrapText(text, fontSize, options.maxWidth)

    let maxWidth = 0
    const lineMetrics = lines.map((line) => {
      const w = this.measureText(line, fontSize).width
      if (w > maxWidth) maxWidth = w
      return { text: line, width: w }
    })

    // Any measureText call gives the same font-level values — reuse those
    // so callers don't have to compute them separately.
    const sample = this.measureText('', fontSize)

    return {
      width: maxWidth,
      height: lines.length * fontSize * lineHeight,
      lines: lineMetrics,
      fontBoundingBoxAscent: sample.fontBoundingBoxAscent,
      fontBoundingBoxDescent: sample.fontBoundingBoxDescent,
    }
  }

  /**
   * Compute underline / strikethrough rectangles for a shaped text run.
   *
   * Pure post-processing over the output of `shapeText` — pass the same
   * `text`, the resulting positioned glyphs, and the style spans you want
   * to apply. Vertical position + thickness come from the font's declared
   * `underline*` / `strikethrough*` metrics scaled to `fontSize`.
   *
   * Returned rectangles are designed to be uploaded as additional
   * `SlugGeometry` instances with the rect-sentinel bit set, so they
   * render in the same draw call as the glyphs.
   */
  emitDecorations(
    text: string,
    positioned: readonly PositionedGlyph[],
    styles: readonly StyleSpan[],
    fontSize: number,
  ): DecorationRect[] {
    const advances = new Map<number, number>()
    for (const [id, g] of this.glyphs) advances.set(id, g.advanceWidth)
    return emitDecorations(text, positioned, styles, fontSize, {
      underlinePosition: this.underlinePosition,
      underlineThickness: this.underlineThickness,
      strikethroughPosition: this.strikethroughPosition,
      strikethroughThickness: this.strikethroughThickness,
    }, advances)
  }

  /**
   * Wrap `text` into lines using Slug's shaper wrap policy
   * (word boundary, hard-break fallback at overflow). Returns the line text
   * for each shaped line — useful for external reference renderers that need
   * to stay line-for-line with Slug's shaped output.
   *
   * Measurements use the same advance-width source as `shapeText` so line
   * breaks are deterministic across baked and runtime paths.
   */
  wrapText(text: string, fontSize: number, maxWidth?: number): string[] {
    if (this._bakedData && this._wrapLinesBaked) {
      return this._wrapLinesBaked(this._bakedData, this.glyphs, this.unitsPerEm, text, fontSize, maxWidth)
    }
    if (this._opentypeFont && this._wrapLinesOT) {
      return this._wrapLinesOT(this._opentypeFont, text, fontSize, maxWidth)
    }
    throw new Error('SlugFont: wrapText not available — load via SlugFontLoader')
  }

  /**
   * Cheap codepoint-coverage check used by `SlugFontStack` to walk
   * fallback chains. Returns true when the font's cmap maps `charCode`
   * to a non-notdef glyph.
   */
  hasCharCode(charCode: number): boolean {
    if (this._bakedData) {
      return cmapLookup(charCode, this._bakedData.cmapCodes, this._bakedData.cmapGlyphs) !== 0
    }
    if (this._opentypeFont) {
      return this._opentypeFont.charToGlyph(String.fromCharCode(charCode)).index !== 0
    }
    return false
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
