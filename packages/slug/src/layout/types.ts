import type { SlugGlyphMetrics } from '../types.js'

/** CSS-style whitespace handling applied before wrapping. */
export type WhiteSpace = 'normal' | 'collapse' | 'pre' | 'pre-line'

/** Wrap mode: `break-word` wraps at spaces, `break-all` anywhere, `keep-all` only at `\n`. */
export type WordBreak = 'keep-all' | 'break-all' | 'break-word'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

export type VerticalAlign = 'top' | 'center' | 'middle' | 'bottom'

/**
 * The font surface the layout engine consumes — the em-space metrics subset
 * of `SlugFont`. Structural, so tests and non-Slug metric sources can stub it.
 */
export interface SlugLayoutFont {
  /** Ascender in em-space (positive, above baseline). */
  readonly ascender: number
  /** Descender in em-space (negative, below baseline). */
  readonly descender: number
  getGlyphMetricsForChar(char: string): SlugGlyphMetrics | undefined
  /** Em-normalized kerning adjustment, added to the pen advance. */
  getKerning(glyphIdA: number, glyphIdB: number): number
}

/**
 * Layout input. Everything but `text` and `font` is optional — defaults are
 * resolved by `resolveGlyphLayoutProperties`.
 */
export interface SlugGlyphLayoutProperties {
  text: string
  font: SlugLayoutFont
  /** Default 16. All output units are the units `fontSize` is expressed in. */
  fontSize?: number
  /** Extra advance per glyph, absolute units. Default 0. */
  letterSpacing?: number
  /**
   * Line box height: absolute units, or a percentage of `fontSize`
   * (`'150%'`). Default `(ascender - descender) * fontSize`.
   */
  lineHeight?: number | `${number}%`
  /** Default `'break-word'`. */
  wordBreak?: WordBreak
  /** Default `'normal'`. Applied to `text` before wrapping. */
  whiteSpace?: WhiteSpace
  /** Spaces a tab expands to under `whiteSpace: 'pre'`. Default 8. */
  tabSize?: number
}

/**
 * Fully-resolved layout properties. `text` is whitespace-normalized — all
 * `charIndex` values in layouts and queries refer to THIS string, not the
 * raw input.
 */
export interface ResolvedGlyphLayoutProperties {
  text: string
  font: SlugLayoutFont
  fontSize: number
  letterSpacing: number
  /** Absolute line box height (percentages already applied). */
  lineHeight: number
  wordBreak: WordBreak
  whiteSpace: WhiteSpace
  tabSize: number
}

/** One wrapped line, as char offsets + measured widths (no positions yet). */
export interface GlyphLayoutLine {
  /** Index of the line's first char in the normalized text. */
  charIndexOffset: number
  /** Char count including trailing whitespace and the terminating `\n`. */
  charLength: number
  /** Char count up to and including the last non-whitespace char. */
  nonWhitespaceCharLength: number
  /** Advance width up to the last non-whitespace char. */
  nonWhitespaceWidth: number
  /** Space count between non-whitespace chars — the justify denominator. */
  whitespacesBetween: number
}

export interface GlyphLayout extends ResolvedGlyphLayoutProperties {
  lines: Array<GlyphLayoutLine>
  availableWidth: number
  availableHeight: number
}

/**
 * A positioned glyph or whitespace slot.
 *
 * Coordinates are y-up with the origin at the CENTER of the
 * `availableWidth × availableHeight` box (uikit's convention, kept so its
 * query/selection consumers port mechanically). `x`/`y`/`width` describe the
 * ink box; `penX` is the pen position before the left side bearing —
 * pair it with the line's `baselineY` to place a Slug glyph instance.
 */
export type PositionedGlyphLayoutEntry =
  | {
      type: 'glyph'
      charIndex: number
      char: string
      glyphId: number
      metrics: SlugGlyphMetrics
      /** Ink left edge (`penX + bounds.xMin * fontSize`). */
      x: number
      /** Ink top edge, y-up. */
      y: number
      /** Ink width. */
      width: number
      /** Pen x before bearing — glyph instance origin. */
      penX: number
    }
  | {
      type: 'whitespace'
      charIndex: number
      x: number
      /** The space glyph's advance width. */
      width: number
      penX: number
    }

export interface PositionedGlyphLayoutLine extends GlyphLayoutLine {
  entries: Array<PositionedGlyphLayoutEntry>
  /** Line box top edge, y-up. */
  y: number
  /** Alphabetic baseline, y-up. Spacing between consecutive baselines is exactly `lineHeight`. */
  baselineY: number
}

export interface PositionedGlyphLayout extends GlyphLayout {
  lines: Array<PositionedGlyphLayoutLine>
  textAlign: TextAlign
  verticalAlign: VerticalAlign
}

/** Caret geometry: `position` is the caret's center, y-up box-center origin. */
export interface CaretTransformation {
  position: [x: number, y: number]
  height: number
}

/** Selection rect: `position` is the rect's center, y-up box-center origin. */
export interface SelectionTransformation {
  position: [x: number, y: number]
  size: [width: number, height: number]
}
