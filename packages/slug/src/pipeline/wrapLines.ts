import type { Font } from 'opentype.js'

/**
 * Wrap a string into lines using the same word-boundary + hard-break-fallback
 * policy as the text shaper (textShaper.ts). Uses opentype.js advance widths
 * so width measurements are identical to those used by `shapeText`.
 *
 * Returned strings are the exact text that would appear on each shaped line —
 * useful for external reference renderers (e.g. Canvas2D comparison) that
 * need line-for-line agreement with Slug's shaper output.
 */
export function wrapLines(
  font: Font,
  text: string,
  fontSize: number,
  maxWidth: number | undefined,
): string[] {
  const scale = fontSize / font.unitsPerEm
  const openGlyphs = font.stringToGlyphs(text)
  const lines: string[] = []
  let lineStart = 0
  let cursorX = 0

  // Track last space within the current line for wrap-back.
  let lastSpaceIdx = -1
  let lastSpaceCursorX = 0

  const flushLine = (end: number) => {
    lines.push(text.slice(lineStart, end))
  }

  for (let i = 0; i < openGlyphs.length; i++) {
    const glyph = openGlyphs[i]!
    const advanceWidth = (glyph.advanceWidth ?? 0) * scale

    // Explicit line break.
    if (text[i] === '\n') {
      flushLine(i)
      lineStart = i + 1
      cursorX = 0
      lastSpaceIdx = -1
      continue
    }

    // Track word boundaries (reset per line).
    if (text[i] === ' ') {
      lastSpaceIdx = i
      lastSpaceCursorX = cursorX + advanceWidth
    }

    // Word wrap: if this glyph would exceed maxWidth, break at last space;
    // if no space available on this line, hard-break at the current glyph.
    if (maxWidth !== undefined && cursorX + advanceWidth > maxWidth && cursorX > 0) {
      if (lastSpaceIdx >= lineStart) {
        flushLine(lastSpaceIdx)
        lineStart = lastSpaceIdx + 1
        cursorX = cursorX - lastSpaceCursorX
      } else {
        flushLine(i)
        lineStart = i
        cursorX = 0
      }
      lastSpaceIdx = -1
    }

    // Kerning with next glyph (included in cursor advance).
    let kerning = 0
    if (i < openGlyphs.length - 1) {
      const nextGlyph = openGlyphs[i + 1]!
      kerning = font.getKerningValue(glyph, nextGlyph) * scale
    }

    cursorX += advanceWidth + kerning
  }

  flushLine(text.length)
  return lines
}
