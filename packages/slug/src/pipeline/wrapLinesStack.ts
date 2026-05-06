import { cmapLookup, kernLookup } from '../baked'
import type { SlugFont } from '../SlugFont'
import type { SlugFontStack } from '../SlugFontStack'

/**
 * Wrap text into lines using per-codepoint font resolution from a
 * `SlugFontStack`. Mirrors the wrap policy + advance calculation of
 * `shapeStackText` so the returned line strings are byte-for-byte what
 * the shaper would emit — enabling external reference renderers
 * (Canvas2D overlays, DOM mirrors) to stay line-for-line with Slug's
 * shaped output even when the text contains characters from multiple
 * fonts.
 *
 * Cross-font kerning is dropped at boundaries, matching `shapeStackText`.
 */
export function wrapLinesStack(
  stack: SlugFontStack,
  text: string,
  fontSize: number,
  maxWidth: number | undefined
): string[] {
  const lines: string[] = []
  let lineStart = 0
  let cursorX = 0

  let lastSpaceIdx = -1
  let lastSpaceCursorX = 0

  const flushLine = (end: number) => {
    lines.push(text.slice(lineStart, end))
  }

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)

    if (code === 10 /* \n */) {
      flushLine(i)
      lineStart = i + 1
      cursorX = 0
      lastSpaceIdx = -1
      continue
    }

    const fontIdx = stack.resolveCodepoint(code)
    const font = stack.fonts[fontIdx]!
    const glyphId = lookupGlyphId(font, code)
    const glyphData = font.glyphs.get(glyphId)
    const advanceEm = glyphData?.advanceWidth ?? 0
    const advanceWidth = advanceEm * fontSize

    if (code === 32 /* space */) {
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

    // Cross-font kerning is dropped — matches `shapeStackText`.
    let kerning = 0
    if (i < text.length - 1) {
      const nextCode = text.charCodeAt(i + 1)
      const nextFontIdx = stack.resolveCodepoint(nextCode)
      if (nextFontIdx === fontIdx) {
        const nextGlyphId = lookupGlyphId(font, nextCode)
        kerning = kerningEm(font, glyphId, nextGlyphId) * fontSize
      }
    }

    cursorX += advanceWidth + kerning
  }

  flushLine(text.length)
  return lines
}

function lookupGlyphId(font: SlugFont, code: number): number {
  if (font._bakedData) {
    return cmapLookup(code, font._bakedData.cmapCodes, font._bakedData.cmapGlyphs)
  }
  if (font._opentypeFont) {
    return font._opentypeFont.charToGlyph(String.fromCharCode(code)).index
  }
  return 0
}

function kerningEm(font: SlugFont, g1: number, g2: number): number {
  if (font._bakedData) {
    const k = kernLookup(g1, g2, font._bakedData.kernData, font._bakedData.kernCount)
    return k / font.unitsPerEm
  }
  if (font._opentypeFont) {
    const ot = font._opentypeFont
    const a = ot.glyphs.get(g1)
    const b = ot.glyphs.get(g2)
    if (!a || !b) return 0
    return ot.getKerningValue(a, b) / font.unitsPerEm
  }
  return 0
}
