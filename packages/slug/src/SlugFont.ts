import type { DataTexture } from 'three'
import type { Font as OpenTypeFont } from 'opentype.js'
import type { BakedFontData } from './baked.js'
import { cmapLookup, kernLookup } from './baked.js'
import type {
  SlugGlyphData,
  PositionedGlyph,
  SlugTextureData,
  TextMetrics,
  ParagraphMetrics,
  MeasureParagraphOptions,
  StyleSpan,
  DecorationRect,
  ShapeTextOptions,
  ShapingBackend,
  SlugGlyphMetrics,
  BakedShapeTextFn,
  BakedMeasureTextFn,
  BakedWrapLinesFn,
  RuntimeShapeTextFn,
  RuntimeMeasureTextFn,
  RuntimeWrapLinesFn,
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

  // --- Shaping state ---
  // The backend is a strategy object built once at load time by
  // `SlugFontLoader` (or the test-friendly `_create*` factories below).
  // Dispatchers forward straight to it without knowing which backend is
  // active. Data fields (`_opentypeFont`, `_bakedData`) stay as
  // structural state because `SlugFontStack` reads them directly.
  /** @internal */ _backend: ShapingBackend | null = null
  /** @internal */ _opentypeFont: OpenTypeFont | null = null
  /** @internal */ _bakedData: BakedFontData | null = null
  /**
   * Pre-baked stroke sets keyed by `(width, joinStyle, capStyle,
   * miterLimit)`. Each entry's `glyphIdOffset` maps a source glyph
   * ID to its corresponding stroke glyph ID (which lives in
   * `this.glyphs` alongside the source glyphs). Empty when the
   * font was baked without `--stroke-widths`.
   */
  strokeSets: ReadonlyArray<{
    width: number
    joinStyle: 'miter' | 'round' | 'bevel'
    capStyle: 'flat' | 'square' | 'round' | 'triangle'
    miterLimit: number
    glyphIdOffset: number
  }> = []

  /** @internal — Use SlugFontLoader to create instances. */
  constructor(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: SlugFontMetrics
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
    shapeTextBaked: BakedShapeTextFn,
    wrapLinesBaked: BakedWrapLinesFn,
    measureTextBaked: BakedMeasureTextFn
  ): SlugFont {
    const font = new SlugFont(glyphs, textures, metrics)
    font._bakedData = bakedData
    font._backend = {
      shapeText: (text, fontSize, options) =>
        shapeTextBaked(bakedData, font.glyphs, font.unitsPerEm, text, fontSize, options),
      measureText: (text, fontSize) =>
        measureTextBaked(
          bakedData,
          font.glyphs,
          font.unitsPerEm,
          font.ascender,
          font.descender,
          text,
          fontSize
        ),
      wrapLines: (text, fontSize, maxWidth) =>
        wrapLinesBaked(bakedData, font.glyphs, font.unitsPerEm, text, fontSize, maxWidth),
    }
    return font
  }

  /** @internal — Called by SlugFontLoader for runtime path. */
  static _createRuntime(
    glyphs: Map<number, SlugGlyphData>,
    textures: SlugTextureData,
    metrics: SlugFontMetrics,
    otFont: OpenTypeFont,
    shapeText: RuntimeShapeTextFn,
    wrapLines: RuntimeWrapLinesFn,
    measureText: RuntimeMeasureTextFn
  ): SlugFont {
    const font = new SlugFont(glyphs, textures, metrics)
    font._opentypeFont = otFont
    font._backend = {
      shapeText: (text, fontSize, options) => shapeText(otFont, text, fontSize, options),
      measureText: (text, fontSize) => measureText(otFont, font.glyphs, text, fontSize),
      wrapLines: (text, fontSize, maxWidth) => wrapLines(otFont, text, fontSize, maxWidth),
    }
    return font
  }

  /**
   * Shape a text string into positioned glyphs. Dispatches to the
   * baked-data shaper or the opentype.js shaper depending on which
   * backend was bound at load time.
   */
  shapeText(text: string, fontSize: number, options?: ShapeTextOptions): PositionedGlyph[] {
    if (!this._backend)
      throw new Error('SlugFont: text shaping not available — load via SlugFontLoader')
    return this._backend.shapeText(text, fontSize, options)
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
    if (!this._backend)
      throw new Error('SlugFont: text measurement not available — load via SlugFontLoader')
    return this._backend.measureText(text, fontSize)
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
    options: MeasureParagraphOptions = {}
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
    fontSize: number
  ): DecorationRect[] {
    const advances = new Map<number, number>()
    for (const [id, g] of this.glyphs) advances.set(id, g.advanceWidth)
    return emitDecorations(
      text,
      positioned,
      styles,
      fontSize,
      {
        underlinePosition: this.underlinePosition,
        underlineThickness: this.underlineThickness,
        strikethroughPosition: this.strikethroughPosition,
        strikethroughThickness: this.strikethroughThickness,
      },
      advances
    )
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
    if (!this._backend)
      throw new Error('SlugFont: wrapText not available — load via SlugFontLoader')
    return this._backend.wrapLines(text, fontSize, maxWidth)
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

  /**
   * Resolve a Unicode codepoint to a glyph ID via the font's cmap.
   * Returns 0 (notdef) for unmapped codepoints. Dispatches across the
   * baked/runtime backends the same way `hasCharCode` does.
   *
   * Codepoints are read as UTF-16 code units, matching every other
   * per-character API in this package (`hasCharCode`, `shapeText`) — no
   * astral-plane handling (documented non-goal, see package CLAUDE.md).
   */
  getGlyphId(codepoint: number): number {
    if (this._bakedData) {
      return cmapLookup(codepoint, this._bakedData.cmapCodes, this._bakedData.cmapGlyphs)
    }
    if (this._opentypeFont) {
      return this._opentypeFont.charToGlyph(String.fromCharCode(codepoint)).index
    }
    return 0
  }

  /**
   * Em-normalized kerning adjustment for a glyph pair, added to the pen
   * advance — fonts encode tightening pairs (e.g. AV) as NEGATIVE values.
   * Reads the same kerning tables `shapeText`/`measureText` already
   * consult (`baked.ts` `kernLookup`; opentype's `getKerningValue`) but
   * makes the value public and unitsPerEm-normalized instead of
   * pixel-scaled — useful to a caller building its own layout instead of
   * going through `shapeText`.
   *
   * Returns 0 for unkerned pairs, notdef, or an unloaded font.
   */
  getKerning(glyphIdA: number, glyphIdB: number): number {
    if (this._bakedData) {
      const { kernData, kernCount } = this._bakedData
      return kernLookup(glyphIdA, glyphIdB, kernData, kernCount) / this.unitsPerEm
    }
    if (this._opentypeFont) {
      const g1 = this._opentypeFont.glyphs.get(glyphIdA)
      const g2 = this._opentypeFont.glyphs.get(glyphIdB)
      if (!g1 || !g2) return 0
      return this._opentypeFont.getKerningValue(g1, g2) / this.unitsPerEm
    }
    return 0
  }

  /**
   * Em-normalized metrics for the glyph a codepoint maps to — advance
   * width, outline bounds, and whether it has a renderable outline at
   * all. Unlike `shapeText`'s output (which drops outline-less glyphs,
   * see package CLAUDE.md "Known gaps"), this returns entries for space,
   * tab, and other advance-only glyphs, so a caller can place a caret
   * after one without re-deriving the mapping itself.
   *
   * Returns `undefined` for a codepoint the font's cmap doesn't cover
   * (mirrors `hasCharCode`'s notion of "unmapped"). Each call returns a
   * fresh object — safe to mutate, no shared internal state leaks.
   */
  getGlyphMetrics(codepoint: number): SlugGlyphMetrics | undefined {
    if (!this._bakedData && !this._opentypeFont) return undefined
    if (!this.hasCharCode(codepoint)) return undefined

    const glyphId = this.getGlyphId(codepoint)
    const glyphData = this.glyphs.get(glyphId)
    if (!glyphData) return undefined

    return {
      glyphId,
      advanceWidth: glyphData.advanceWidth,
      // The advertised left side bearing, not `bounds.xMin`. They coincide for
      // TrueType but can diverge for CFF/OTF, where xMin is where ink actually
      // starts. Layout engines position by lsb.
      lsb: glyphData.lsb,
      bounds: { ...glyphData.bounds },
      // Same heuristic textMeasureBaked.ts uses — valid on both backends
      // because runtime's advance-only glyphs are also stored with
      // all-zero bounds (`buildAdvanceOnlyGlyph`).
      hasOutline: glyphData.bounds.xMax > glyphData.bounds.xMin,
    }
  }

  /** Convenience over `getGlyphMetrics` — takes a single character instead of a codepoint. */
  getGlyphMetricsForChar(char: string): SlugGlyphMetrics | undefined {
    const codepoint = char.codePointAt(0)
    if (codepoint === undefined) return undefined
    return this.getGlyphMetrics(codepoint)
  }

  /**
   * Look up a pre-baked stroke-glyph data record matching the given
   * stroke parameters, or `null` if the font wasn't baked with a
   * matching `(width, joinStyle, capStyle, miterLimit)` tuple or the
   * source glyph has no outline.
   *
   * Returns a `SlugGlyphData` the caller can render through the
   * normal fill pipeline (`slugRender`) — no new shader, 1× fill
   * cost. The stroke glyph has its own ID, bounds, bands, and curves
   * in `this.curveTexture` / `this.bandTexture`.
   *
   * Runtime async fallback for widths not in the baked set is Phase 5
   * Task 20's responsibility — this method just reports pre-baked
   * availability.
   */
  getStrokeGlyph(
    sourceGlyphId: number,
    width: number,
    joinStyle: 'miter' | 'round' | 'bevel' = 'miter',
    capStyle: 'flat' | 'square' | 'round' | 'triangle' = 'flat',
    miterLimit = 4
  ): SlugGlyphData | null {
    for (const s of this.strokeSets) {
      if (
        s.width === width &&
        s.joinStyle === joinStyle &&
        s.capStyle === capStyle &&
        s.miterLimit === miterLimit
      ) {
        return this.glyphs.get(sourceGlyphId + s.glyphIdOffset) ?? null
      }
    }
    return null
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
