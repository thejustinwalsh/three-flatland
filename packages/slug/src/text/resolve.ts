// Internal: resolve paragraph content + style into concrete runs and
// per-character lookup tables the layout walker consumes. Not exported
// from the package.

import type { SlugGlyphMetrics } from '../types.js'
import { getScriptTransform } from './script.js'
import type { SlugParagraphStyle, SlugRun, SlugTypeface } from './types.js'

/**
 * Metrics used when a typeface's cmap has no entry for a char — 0.6 em
 * advance, no ink, `glyphId` -1 marks it unrenderable (upstream
 * MISSING_GLYPH parity).
 */
const MISSING_GLYPH_METRICS: SlugGlyphMetrics = {
  glyphId: -1,
  advanceWidth: 0.6,
  lsb: 0,
  bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
  hasOutline: false,
}

/** Fallback space advance (em) when a typeface maps no space glyph. */
const FALLBACK_SPACE_ADVANCE = 0.25

/** A run with every inheritable field resolved against the paragraph style. */
export interface ResolvedRun {
  readonly source: SlugRun
  readonly typeface: SlugTypeface
  /** Unscripted size, `style.fontSize` units. */
  readonly fontSize: number
  /** Em-space tracking. */
  readonly tracking: number
  /** Script horizontal advance scale. */
  readonly scaleX: number
  /** Script vertical scale — the run's effective em height is `fontSize * scaleY`. */
  readonly scaleY: number
  /** First char (inclusive) in the concatenated text. */
  readonly start: number
  /** Past-the-last char in the concatenated text. */
  readonly end: number
}

export interface ResolvedParagraph {
  readonly text: string
  readonly runs: readonly ResolvedRun[]
  /** Per-char run index, parallel to `text`. */
  readonly runIndexByChar: Uint32Array
  readonly style: SlugParagraphStyle
  readonly lineSpacing: number
  readonly alignment: 'left' | 'center' | 'right'
  readonly justify: boolean
  readonly wrap: 'word' | 'anywhere' | 'none'
  readonly collapseSpaces: boolean
  readonly preserveNewlines: boolean
  readonly maxWidth: number | undefined
  /** Absolute distance between tab stops. */
  readonly tabWidth: number
  /** The paragraph typeface's space advance at `style.fontSize`. */
  readonly spaceWidth: number
}

/**
 * Glyph metrics with the engine's fallback chain: the char itself, then
 * the space glyph for `\n`/`\t` (line feeds measure like a space), then
 * `MISSING_GLYPH_METRICS`. Total over arbitrary input.
 */
export function getMetricsWithFallback(typeface: SlugTypeface, char: string): SlugGlyphMetrics {
  const metrics = typeface.getGlyphMetrics(char.charCodeAt(0))
  if (metrics !== undefined) return metrics
  if (char === '\n' || char === '\t') {
    const space = typeface.getGlyphMetrics(0x20)
    if (space !== undefined) return space
  }
  return MISSING_GLYPH_METRICS
}

/** The space glyph's advance at `fontSize`, with a 0.25 em fallback. */
export function getSpaceWidth(typeface: SlugTypeface, fontSize: number): number {
  return (typeface.getGlyphMetrics(0x20)?.advanceWidth ?? FALLBACK_SPACE_ADVANCE) * fontSize
}

/**
 * Normalize `string | SlugRun[]` content into resolved runs over one
 * concatenated text. A bare string is exactly one implicit run.
 */
export function resolveContent(
  content: string | readonly SlugRun[],
  style: SlugParagraphStyle
): ResolvedParagraph {
  const sourceRuns: readonly SlugRun[] = typeof content === 'string' ? [{ text: content }] : content

  const runs: ResolvedRun[] = []
  let text = ''
  for (const run of sourceRuns) {
    const typeface = run.typeface ?? style.typeface
    const { scaleX, scaleY } = getScriptTransform(typeface, run.scriptLevel ?? 0)
    const start = text.length
    text += run.text
    runs.push({
      source: run,
      typeface,
      fontSize: run.fontSize ?? style.fontSize,
      tracking: run.tracking ?? style.tracking ?? 0,
      scaleX,
      scaleY,
      start,
      end: text.length,
    })
  }

  const runIndexByChar = new Uint32Array(text.length)
  for (let i = 0; i < runs.length; i++) {
    runIndexByChar.fill(i, runs[i]!.start, runs[i]!.end)
  }

  const spaceWidth = getSpaceWidth(style.typeface, style.fontSize)
  return {
    text,
    runs,
    runIndexByChar,
    style,
    lineSpacing: style.lineSpacing ?? 1.2,
    alignment: style.alignment ?? 'left',
    justify: style.justify ?? false,
    wrap: style.wrap ?? 'word',
    collapseSpaces: style.collapseSpaces ?? true,
    preserveNewlines: style.preserveNewlines ?? true,
    maxWidth: style.maxWidth,
    tabWidth: style.tabWidth ?? 8 * spaceWidth,
    spaceWidth,
  }
}
