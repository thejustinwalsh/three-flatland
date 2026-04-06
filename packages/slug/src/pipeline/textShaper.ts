import type { Font } from 'opentype.js'
import type { PositionedGlyph } from '../types.js'

/**
 * Shape a text string into positioned glyphs using an opentype.js Font.
 * Handles kerning and basic horizontal layout.
 */
export function shapeText(
  font: Font,
  text: string,
  fontSize: number,
  options: {
    align?: 'left' | 'center' | 'right'
    lineHeight?: number
    maxWidth?: number
  } = {},
): PositionedGlyph[] {
  const { align = 'left', lineHeight = 1.2, maxWidth } = options
  const scale = fontSize / font.unitsPerEm
  const lineHeightPx = fontSize * lineHeight

  const openGlyphs = font.stringToGlyphs(text)
  const positioned: PositionedGlyph[] = []

  const lines: PositionedGlyph[][] = [[]]
  let currentLine = lines[0]!
  let cursorX = 0

  for (let i = 0; i < openGlyphs.length; i++) {
    const glyph = openGlyphs[i]!
    const advanceWidth = (glyph.advanceWidth ?? 0) * scale

    // Check for line break
    if (text[i] === '\n') {
      lines.push([])
      currentLine = lines[lines.length - 1]!
      cursorX = 0
      continue
    }

    // Word wrap
    if (maxWidth !== undefined && cursorX + advanceWidth > maxWidth && cursorX > 0) {
      lines.push([])
      currentLine = lines[lines.length - 1]!
      cursorX = 0
    }

    // Apply kerning with next glyph
    let kerning = 0
    if (i < openGlyphs.length - 1) {
      const nextGlyph = openGlyphs[i + 1]!
      kerning = font.getKerningValue(glyph, nextGlyph) * scale
    }

    // Skip space/control characters that have no outline
    if (glyph.index !== 0 && glyph.path && glyph.path.commands.length > 0) {
      currentLine.push({
        glyphId: glyph.index,
        x: cursorX,
        y: 0, // Y set during alignment pass
        scale,
      })
    }

    cursorX += advanceWidth + kerning
  }

  // Apply alignment and compute Y positions
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!
    const y = -lineIdx * lineHeightPx

    // Calculate line width for alignment
    let lineWidth = 0
    if (line.length > 0) {
      const lastGlyph = line[line.length - 1]!
      const lastOpenGlyph = font.glyphs.get(lastGlyph.glyphId)
      const lastAdvance = (lastOpenGlyph?.advanceWidth ?? 0) * scale
      lineWidth = lastGlyph.x + lastAdvance
    }

    let offsetX = 0
    if (align === 'center') {
      offsetX = -lineWidth * 0.5
    } else if (align === 'right') {
      offsetX = -lineWidth
    }

    for (const glyph of line) {
      positioned.push({
        ...glyph,
        x: glyph.x + offsetX,
        y,
      })
    }
  }

  return positioned
}
