import { cmapLookup, kernLookup } from '../baked.js'
import type { BakedFontData } from '../baked.js'
import type { SlugGlyphData, PositionedGlyph } from '../types.js'

/**
 * Shape text using baked font data — no opentype.js dependency.
 * Same layout logic as textShaper.ts but uses cmap/kern tables
 * from the baked binary instead of opentype.js Font objects.
 */
export function shapeTextBaked(
  bakedData: BakedFontData,
  glyphs: Map<number, SlugGlyphData>,
  unitsPerEm: number,
  text: string,
  fontSize: number,
  options: {
    align?: 'left' | 'center' | 'right'
    lineHeight?: number
    maxWidth?: number
  } = {},
): PositionedGlyph[] {
  const { align = 'left', lineHeight = 1.2, maxWidth } = options
  const scale = fontSize / unitsPerEm
  const lineHeightPx = fontSize * lineHeight

  const { cmapCodes, cmapGlyphs, kernData, kernCount } = bakedData

  // Convert text to glyph IDs via cmap
  const glyphIds: number[] = []
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    glyphIds.push(cmapLookup(charCode, cmapCodes, cmapGlyphs))
  }

  const lines: PositionedGlyph[][] = [[]]
  let currentLine = lines[0]!
  let cursorX = 0

  // Notdef glyph (ID 0) is used as fallback for missing/filtered glyphs
  const notdefGlyph = glyphs.get(0)

  for (let i = 0; i < glyphIds.length; i++) {
    let glyphId = glyphIds[i]!
    let glyphData = glyphs.get(glyphId)

    // Fallback to notdef if glyph was filtered out during baking
    if (!glyphData && glyphId !== 0 && notdefGlyph) {
      glyphData = notdefGlyph
      glyphId = 0
    }

    const advanceWidth = (glyphData?.advanceWidth ?? 0) * unitsPerEm * scale

    // Check for line break
    if (text.charCodeAt(i) === 10) { // '\n'
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
    if (i < glyphIds.length - 1) {
      kerning = kernLookup(glyphId, glyphIds[i + 1]!, kernData, kernCount) * scale
    }

    // Skip glyphs with no outline (spaces, control chars)
    if (glyphId !== 0 && glyphData && (glyphData.bounds.xMax - glyphData.bounds.xMin) > 0) {
      currentLine.push({
        glyphId,
        x: cursorX,
        y: 0,
        scale,
      })
    }

    cursorX += advanceWidth + kerning
  }

  // Apply alignment and compute Y positions
  const positioned: PositionedGlyph[] = []
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!
    const y = -lineIdx * lineHeightPx

    let lineWidth = 0
    if (line.length > 0) {
      const lastGlyph = line[line.length - 1]!
      const lastData = glyphs.get(lastGlyph.glyphId)
      const lastAdvance = (lastData?.advanceWidth ?? 0) * unitsPerEm * scale
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
