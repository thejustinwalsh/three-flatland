import type { Font } from 'opentype.js'
import type { SlugGlyphData, TextMetrics } from '../types.js'

/**
 * Measure a single unwrapped line of text via opentype.js Font.
 *
 * Spiritually aligned with `CanvasRenderingContext2D.measureText`: no
 * wrapping, single-line, same-named fields. Uses the same advance and
 * kerning source as `shapeText` so widths agree exactly.
 *
 * Glyph ink bounds come from the pre-parsed `SlugGlyphData.bounds` map
 * (computed once at font-load time in `parseFont`) rather than re-running
 * opentype's `glyph.getBoundingBox()` — which iterates all path commands
 * per call. That makes measure cost per-call constant regardless of
 * glyph complexity.
 */
export function measureText(
  font: Font,
  glyphs: Map<number, SlugGlyphData>,
  text: string,
  fontSize: number,
): TextMetrics {
  const scale = fontSize / font.unitsPerEm

  const fontBoundingBoxAscent = (font.ascender ?? 0) * scale
  const fontBoundingBoxDescent = -(font.descender ?? 0) * scale

  let cursorX = 0
  let inkLeft = Infinity
  let inkRight = -Infinity
  let inkAscent = 0
  let inkDescent = 0

  const openGlyphs = font.stringToGlyphs(text)

  for (let i = 0; i < openGlyphs.length; i++) {
    const glyph = openGlyphs[i]!

    // Skip newlines — measurement is single-line per browser contract.
    if (text[i] === '\n') continue

    const advanceWidth = (glyph.advanceWidth ?? 0) * scale

    // Pre-computed ink bounds from parseFont — absent for outline-less
    // glyphs like space, which parseFont filters out of the map.
    const slugGlyph = glyphs.get(glyph.index)
    if (slugGlyph) {
      const { bounds } = slugGlyph
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
    if (i < openGlyphs.length - 1) {
      const nextGlyph = openGlyphs[i + 1]!
      kerning = font.getKerningValue(glyph, nextGlyph) * scale
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
