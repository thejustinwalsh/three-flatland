import type { SlugGlyphMetrics } from '../types.js'
import type { SlugLayoutFont } from './types.js'

/**
 * Metrics used when a font's cmap has no entry for a char — mirrors
 * uikit's `MISSING_GLYPH` (0.6 em advance, no ink). `glyphId` -1 marks it
 * as unrenderable.
 */
const MISSING_GLYPH_METRICS: SlugGlyphMetrics = {
  glyphId: -1,
  advanceWidth: 0.6,
  lsb: 0,
  bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
  hasOutline: false,
}

/** Fallback space advance (em) when a font maps no space glyph. */
const FALLBACK_SPACE_ADVANCE = 0.25

/**
 * Glyph metrics with the layout engine's fallback chain: the char itself,
 * then the space glyph for `\n`/`\t` (uikit's rule — line feeds measure
 * like a space), then `MISSING_GLYPH_METRICS`. Never returns undefined,
 * so wrappers and positioning stay total over arbitrary input.
 */
export function getGlyphMetricsWithFallback(font: SlugLayoutFont, char: string): SlugGlyphMetrics {
  const metrics = font.getGlyphMetricsForChar(char)
  if (metrics !== undefined) return metrics
  if (char === '\n' || char === '\t') {
    const space = font.getGlyphMetricsForChar(' ')
    if (space !== undefined) return space
  }
  return MISSING_GLYPH_METRICS
}

/** Pen advance for one glyph: `advanceWidth * fontSize + letterSpacing`. */
export function getOffsetToNextGlyph(
  fontSize: number,
  metrics: SlugGlyphMetrics,
  letterSpacing: number
): number {
  return metrics.advanceWidth * fontSize + letterSpacing
}

/** Kerning pen adjustment between the previous glyph and this one. */
export function getKerningOffset(
  font: SlugLayoutFont,
  fontSize: number,
  prevGlyphId: number | undefined,
  glyphId: number
): number {
  if (prevGlyphId == null || prevGlyphId < 0 || glyphId < 0) return 0
  return font.getKerning(prevGlyphId, glyphId) * fontSize
}

/** Ink left edge offset from the pen position. */
export function getGlyphOffsetX(metrics: SlugGlyphMetrics, fontSize: number): number {
  return metrics.bounds.xMin * fontSize
}

/** Ink width of a glyph. */
export function getGlyphInkWidth(metrics: SlugGlyphMetrics, fontSize: number): number {
  return (metrics.bounds.xMax - metrics.bounds.xMin) * fontSize
}

/** Baseline-to-baseline distance — exactly the (absolute) line height. */
export function getOffsetToNextLine(lineHeight: number): number {
  return lineHeight
}

/** Block height for `linesAmount` lines; empty text still reserves one line. */
export function getGlyphLayoutHeight(linesAmount: number, lineHeight: number): number {
  return Math.max(linesAmount, 1) * lineHeight
}

/** The space glyph's advance at `fontSize`, with a 0.25 em fallback. */
export function getWhitespaceWidth(font: SlugLayoutFont, fontSize: number): number {
  return (font.getGlyphMetricsForChar(' ')?.advanceWidth ?? FALLBACK_SPACE_ADVANCE) * fontSize
}
