import { cmapLookup, kernLookup } from '../baked.js'
import type { BakedFontData } from '../baked.js'
import type { SlugGlyphData } from '../types.js'

/**
 * Wrap a string into lines using the same word-boundary + hard-break-fallback
 * policy as `shapeTextBaked`. No opentype.js dependency — uses the baked
 * cmap/kern tables. Line strings match the text that would appear on each
 * shaped line, so external reference renderers can stay line-for-line with
 * Slug's shaped output.
 */
export function wrapLinesBaked(
  bakedData: BakedFontData,
  glyphs: Map<number, SlugGlyphData>,
  unitsPerEm: number,
  text: string,
  fontSize: number,
  maxWidth: number | undefined,
): string[] {
  const scale = fontSize / unitsPerEm
  const { cmapCodes, cmapGlyphs, kernData, kernCount } = bakedData

  const glyphIds: number[] = []
  for (let i = 0; i < text.length; i++) {
    glyphIds.push(cmapLookup(text.charCodeAt(i), cmapCodes, cmapGlyphs))
  }

  const notdefGlyph = glyphs.get(0)
  const lines: string[] = []
  let lineStart = 0
  let cursorX = 0

  let lastSpaceIdx = -1
  let lastSpaceCursorX = 0

  const flushLine = (end: number) => {
    lines.push(text.slice(lineStart, end))
  }

  for (let i = 0; i < glyphIds.length; i++) {
    let glyphId = glyphIds[i]!
    let glyphData = glyphs.get(glyphId)
    if (!glyphData && glyphId !== 0 && notdefGlyph) {
      glyphData = notdefGlyph
      glyphId = 0
    }

    const advanceWidth = (glyphData?.advanceWidth ?? 0) * unitsPerEm * scale

    if (text.charCodeAt(i) === 10 /* \n */) {
      flushLine(i)
      lineStart = i + 1
      cursorX = 0
      lastSpaceIdx = -1
      continue
    }

    if (text.charCodeAt(i) === 32 /* space */) {
      lastSpaceIdx = i
      lastSpaceCursorX = cursorX + advanceWidth
    }

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

    let kerning = 0
    if (i < glyphIds.length - 1) {
      kerning = kernLookup(glyphId, glyphIds[i + 1]!, kernData, kernCount) * scale
    }

    cursorX += advanceWidth + kerning
  }

  flushLine(text.length)
  return lines
}
