import { cmapLookup, kernLookup } from '../baked'
import type { BakedFontData } from '../baked'
import type { SlugGlyphData, PositionedGlyph } from '../types'

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
  } = {}
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

  // Track word boundaries for wrap-back
  let lastSpaceIdx = -1
  let lastSpaceGlyphCount = 0
  let lastSpaceCursorX = 0

  for (let i = 0; i < glyphIds.length; i++) {
    let glyphId = glyphIds[i]!
    let glyphData = glyphs.get(glyphId)

    // Fallback to notdef if glyph was filtered out during baking
    if (!glyphData && glyphId !== 0 && notdefGlyph) {
      glyphData = notdefGlyph
      glyphId = 0
    }

    const advanceWidth = (glyphData?.advanceWidth ?? 0) * unitsPerEm * scale

    // Explicit line break
    if (text.charCodeAt(i) === 10) {
      lines.push([])
      currentLine = lines[lines.length - 1]!
      cursorX = 0
      lastSpaceIdx = -1
      continue
    }

    // Track word boundaries
    if (text.charCodeAt(i) === 32) {
      lastSpaceIdx = i
      lastSpaceGlyphCount = currentLine.length
      lastSpaceCursorX = cursorX + advanceWidth
    }

    // Word wrap: break at last space
    if (maxWidth !== undefined && cursorX + advanceWidth > maxWidth && cursorX > 0) {
      if (lastSpaceIdx >= 0 && lastSpaceGlyphCount > 0) {
        const overflow = currentLine.splice(lastSpaceGlyphCount)
        const baseX = lastSpaceCursorX
        lines.push(overflow.map((g) => ({ ...g, x: g.x - baseX })))
        currentLine = lines[lines.length - 1]!
        cursorX = cursorX - baseX
      } else {
        lines.push([])
        currentLine = lines[lines.length - 1]!
        cursorX = 0
      }
      lastSpaceIdx = -1
    }

    // Apply kerning with next glyph
    let kerning = 0
    if (i < glyphIds.length - 1) {
      kerning = kernLookup(glyphId, glyphIds[i + 1]!, kernData, kernCount) * scale
    }

    // Skip glyphs with no outline (spaces, control chars)
    if (glyphId !== 0 && glyphData && glyphData.bounds.xMax - glyphData.bounds.xMin > 0) {
      currentLine.push({
        glyphId,
        srcCharIndex: i,
        x: cursorX,
        y: 0,
        scale,
      })
    }

    cursorX += advanceWidth + kerning
  }

  // Apply alignment and compute Y positions.
  // Vertically center the text block around y=0.
  const totalBlockHeight = (lines.length - 1) * lineHeightPx
  const yOffset = totalBlockHeight / 2

  const positioned: PositionedGlyph[] = []
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!
    const y = yOffset - lineIdx * lineHeightPx

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
