import { cmapLookup, kernLookup } from '../baked'
import type { BakedFontData } from '../baked'
import type { SlugGlyphData, TextMetrics } from '../types'

/**
 * Measure a single unwrapped line of text using baked font data.
 * No opentype.js dependency — uses the same cmap/kern tables as
 * `shapeTextBaked` so widths agree with shaped output exactly.
 *
 * Spiritually aligned with `CanvasRenderingContext2D.measureText`: no
 * wrapping, single-line, same-named fields.
 */
export function measureTextBaked(
  bakedData: BakedFontData,
  glyphs: Map<number, SlugGlyphData>,
  unitsPerEm: number,
  ascender: number,
  descender: number,
  text: string,
  fontSize: number
): TextMetrics {
  const scale = fontSize / unitsPerEm
  const { cmapCodes, cmapGlyphs, kernData, kernCount } = bakedData

  const notdefGlyph = glyphs.get(0)

  // Font-level bounds are glyph-independent.
  const fontBoundingBoxAscent = ascender * fontSize
  const fontBoundingBoxDescent = -descender * fontSize

  let cursorX = 0

  // Ink-bound tracking.
  let inkLeft = Infinity
  let inkRight = -Infinity
  let inkAscent = 0 // positive up
  let inkDescent = 0 // positive down

  // Resolve codepoints up front so kerning lookups see the correct pair.
  const glyphIds: number[] = []
  for (let i = 0; i < text.length; i++) {
    glyphIds.push(cmapLookup(text.charCodeAt(i), cmapCodes, cmapGlyphs))
  }

  for (let i = 0; i < glyphIds.length; i++) {
    const glyphId = glyphIds[i]!
    let glyphData = glyphs.get(glyphId)

    // Distinguish "unmapped codepoint" (fall back to notdef for a visible
    // rectangle) from "mapped but outline-less" (e.g. space — real glyph,
    // contributes advance only, no ink). The shaper filters
    // zero-command glyphs out of the map during baking, so a missing
    // `glyphData` with glyphId !== 0 means either outcome. We use the
    // original unmapped state (glyphId returned by cmapLookup as 0) as
    // the signal: only codepoints that missed the cmap entirely need
    // a notdef fallback for metrics.
    const missedCmap = glyphId === 0 && text.charCodeAt(i) !== 0
    if (missedCmap && notdefGlyph) {
      glyphData = notdefGlyph
    }

    // Skip newlines the same way the shaper does — measurement is single-line
    // per the browser contract. We flatten \n to an advance of zero.
    if (text.charCodeAt(i) === 10) continue

    const advanceEm = glyphData?.advanceWidth ?? 0
    const advanceWidth = advanceEm * unitsPerEm * scale

    // Per-glyph ink bounds. `unpackBaked` discards the curve list at runtime
    // (the curves live only in the GPU texture), so `curves.length` is not
    // a valid outline signal — use non-zero bounds area instead. Space and
    // other advance-only glyphs are stored with all-zero bounds by the CLI.
    if (glyphData && glyphData.bounds.xMax > glyphData.bounds.xMin) {
      const { bounds } = glyphData
      const glyphLeft = cursorX + bounds.xMin * fontSize
      const glyphRight = cursorX + bounds.xMax * fontSize
      if (glyphLeft < inkLeft) inkLeft = glyphLeft
      if (glyphRight > inkRight) inkRight = glyphRight
      const glyphAscent = bounds.yMax * fontSize
      const glyphDescent = -bounds.yMin * fontSize
      if (glyphAscent > inkAscent) inkAscent = glyphAscent
      if (glyphDescent > inkDescent) inkDescent = glyphDescent
    }

    let kerning = 0
    if (i < glyphIds.length - 1) {
      kerning = kernLookup(glyphId, glyphIds[i + 1]!, kernData, kernCount) * scale
    }
    cursorX += advanceWidth + kerning
  }

  const hasInk = Number.isFinite(inkLeft)

  return {
    width: cursorX,
    actualBoundingBoxLeft: hasInk ? -inkLeft : 0,
    actualBoundingBoxRight: hasInk ? inkRight : 0,
    actualBoundingBoxAscent: inkAscent,
    actualBoundingBoxDescent: inkDescent,
    fontBoundingBoxAscent,
    fontBoundingBoxDescent,
  }
}
