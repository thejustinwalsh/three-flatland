import type { DecorationRect, PositionedGlyph, StyleSpan } from '../types'

export interface DecorationFontMetrics {
  underlinePosition: number
  underlineThickness: number
  strikethroughPosition: number
  strikethroughThickness: number
}

/**
 * Emit underline / strikethrough rectangles for a shaped text run.
 *
 * One rect per (line, decoration kind, contiguous-styled-run) triple.
 * Slug renders these as solid-fill rectangles in the same draw call as
 * glyphs via the rect-sentinel path on `SlugMaterial`. Vertical position
 * + thickness come from the font's declared `FontDecorationData`
 * (`SlugFont.{underline,strikethrough}{Position,Thickness}`).
 *
 * The `srcCharIndex` on each `PositionedGlyph` (set by the shaper) is
 * the glyph→char back-map; spans are walked in char order per line, with
 * runs flushed when the style toggles off or the line ends.
 *
 * Rect width spans from the leftmost glyph's pen position to the rightmost
 * glyph's pen + advance. Whitespace within a run is included implicitly
 * (the cursor advances through it during shaping); whitespace at the
 * boundary of a run (where the style toggles off mid-line) is excluded.
 */
/**
 * Advance lookup — used to compute the right-edge of a run. A function
 * (rather than a Map) accommodates the font-stack case, where the same
 * `glyphId` value can belong to different fonts with different advances.
 * Callers pass a closure that knows which font each positioned glyph
 * came from.
 */
export type GlyphAdvanceLookup = (glyph: PositionedGlyph) => number

export function emitDecorations(
  text: string,
  positioned: readonly PositionedGlyph[],
  styles: readonly StyleSpan[],
  fontSize: number,
  metrics: DecorationFontMetrics,
  glyphAdvances: Map<number, number> | GlyphAdvanceLookup
): DecorationRect[] {
  if (styles.length === 0 || positioned.length === 0) return []

  // Per-character style lookup. Each cell holds {underline, strike}.
  type Flags = { underline: boolean; strike: boolean }
  const flags: Flags[] = []
  for (let i = 0; i < text.length; i++) flags.push({ underline: false, strike: false })
  for (const span of styles) {
    if (!span.underline && !span.strike) continue
    const lo = Math.max(0, Math.min(text.length, span.start))
    const hi = Math.max(lo, Math.min(text.length, span.end))
    for (let i = lo; i < hi; i++) {
      if (span.underline) flags[i]!.underline = true
      if (span.strike) flags[i]!.strike = true
    }
  }

  // Group positioned glyphs by line (same y), preserving x-order within each line.
  const linesByY = new Map<number, PositionedGlyph[]>()
  for (const pg of positioned) {
    let arr = linesByY.get(pg.y)
    if (!arr) {
      arr = []
      linesByY.set(pg.y, arr)
    }
    arr.push(pg)
  }

  // Decoration metrics in object-space (em-space metric × fontSize).
  const ulY = metrics.underlinePosition * fontSize // bottom edge of underline (typically negative)
  const ulH = metrics.underlineThickness * fontSize
  const stY = metrics.strikethroughPosition * fontSize // bottom edge of strike (typically positive)
  const stH = metrics.strikethroughThickness * fontSize

  const rects: DecorationRect[] = []
  const advanceOf: GlyphAdvanceLookup =
    typeof glyphAdvances === 'function' ? glyphAdvances : (pg) => glyphAdvances.get(pg.glyphId) ?? 0

  for (const [lineY, lineGlyphs] of linesByY) {
    for (const kind of ['underline', 'strike'] as const) {
      let runStart: PositionedGlyph | null = null
      let runEnd: PositionedGlyph | null = null

      const flush = () => {
        if (!runStart || !runEnd) return
        const advanceEm = advanceOf(runEnd)
        const advancePx = advanceEm * fontSize
        const left = runStart.x
        const right = runEnd.x + advancePx
        const width = Math.max(0, right - left)
        const cx = left + width * 0.5
        const dy = kind === 'underline' ? ulY : stY
        const dh = kind === 'underline' ? ulH : stH
        const cy = lineY + dy + dh * 0.5
        rects.push({ x: cx, y: cy, width, height: dh })
        runStart = null
        runEnd = null
      }

      for (const pg of lineGlyphs) {
        const f = flags[pg.srcCharIndex]
        const on = !!f && (kind === 'underline' ? f.underline : f.strike)
        if (on) {
          if (runStart === null) runStart = pg
          runEnd = pg
        } else {
          flush()
        }
      }
      flush()
    }
  }

  return rects
}
