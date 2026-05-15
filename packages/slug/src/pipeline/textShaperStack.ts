import type { PositionedGlyph, SlugGlyphData } from '../types'
import type { SlugFont } from '../SlugFont'
import type { SlugFontStack } from '../SlugFontStack'
import { cmapLookup, kernLookup } from '../baked'

/**
 * Output of `shapeStackText` — positioned glyphs grouped by which font
 * in the stack they belong to. The renderer creates one InstancedMesh
 * per font and writes each group's glyphs into its mesh.
 */
export interface StackShapeResult {
  /** Map from font-index (into `stack.fonts`) to that font's positioned glyphs. */
  byFont: Map<number, PositionedGlyph[]>
}

interface CharResolution {
  fontIdx: number
  glyphId: number
  glyphData: SlugGlyphData | undefined
  advanceEm: number
}

function resolveChar(stack: SlugFontStack, code: number): CharResolution {
  const fontIdx = stack.resolveCodepoint(code)
  const font = stack.fonts[fontIdx]!
  const glyphId = lookupGlyphId(font, code)
  const glyphData = font.glyphs.get(glyphId)
  const advanceEm = glyphData?.advanceWidth ?? 0
  return { fontIdx, glyphId, glyphData, advanceEm }
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

/**
 * Shape `text` against an ordered font stack, producing per-font
 * positioned-glyph groups. Honours Slug's shaper wrap policy — break at
 * last space when a glyph would exceed `maxWidth`; hard-break when no
 * space is available. Wraps and aligns the way the single-font shapers
 * do, with a single global cursor that advances regardless of which
 * font in the stack each glyph came from.
 *
 * Cross-run kerning is intentionally dropped (each kerning pair must
 * come from the same font; this matches typical browser behavior at
 * run boundaries).
 */
export function shapeStackText(
  stack: SlugFontStack,
  text: string,
  fontSize: number,
  options: {
    align?: 'left' | 'center' | 'right'
    lineHeight?: number
    maxWidth?: number
  } = {}
): StackShapeResult {
  const { align = 'left', lineHeight = 1.2, maxWidth } = options
  const lineHeightPx = fontSize * lineHeight

  // Per-glyph entry within a line. Tracks font for ordering & to compute
  // the trailing advance when measuring line width.
  type LineGlyph = {
    fontIdx: number
    glyphId: number
    advanceWidth: number
    srcCharIndex: number
    x: number
    /** Em-space scale for this glyph (depends on its source font). */
    scale: number
    /** True when the glyph contributes ink (skip space, control chars). */
    visible: boolean
  }

  const lines: LineGlyph[][] = [[]]
  let currentLine = lines[0]!
  let cursorX = 0

  let lastSpaceIdx = -1 // text index of the last space
  let lastSpaceLineLen = 0 // currentLine.length when the space was seen
  let lastSpaceCursorX = 0 // cursorX after the space's advance

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)

    // Explicit line break.
    if (code === 10) {
      lines.push([])
      currentLine = lines[lines.length - 1]!
      cursorX = 0
      lastSpaceIdx = -1
      continue
    }

    const { fontIdx, glyphId, glyphData, advanceEm } = resolveChar(stack, code)
    const font = stack.fonts[fontIdx]!
    const advanceWidth = advanceEm * fontSize

    // Track word boundaries.
    if (code === 32) {
      lastSpaceIdx = i
      lastSpaceLineLen = currentLine.length
      lastSpaceCursorX = cursorX + advanceWidth
    }

    // Wrap on overflow.
    if (maxWidth !== undefined && cursorX + advanceWidth > maxWidth && cursorX > 0) {
      if (lastSpaceIdx >= 0 && lastSpaceLineLen > 0) {
        const overflow = currentLine.splice(lastSpaceLineLen)
        const baseX = lastSpaceCursorX
        for (const g of overflow) g.x -= baseX
        lines.push(overflow)
        currentLine = lines[lines.length - 1]!
        cursorX = cursorX - baseX
      } else {
        lines.push([])
        currentLine = lines[lines.length - 1]!
        cursorX = 0
      }
      lastSpaceIdx = -1
    }

    // Kerning with the next char if same font (otherwise drop kerning at boundary).
    let kerning = 0
    if (i < text.length - 1) {
      const nextCode = text.charCodeAt(i + 1)
      const nextRes = resolveChar(stack, nextCode)
      if (nextRes.fontIdx === fontIdx) {
        kerning = kerningEm(font, glyphId, nextRes.glyphId) * fontSize
      }
    }

    const visible =
      glyphData != null && glyphId !== 0 && glyphData.bounds.xMax > glyphData.bounds.xMin

    if (visible) {
      currentLine.push({
        fontIdx,
        glyphId,
        advanceWidth,
        srcCharIndex: i,
        x: cursorX,
        scale: fontSize / font.unitsPerEm,
        visible: true,
      })
    }

    cursorX += advanceWidth + kerning
  }

  // Vertical centering matches the single-font shapers — block centered
  // on y=0, line 0 baseline at +yOffset, descending by lineHeight.
  const totalBlockHeight = (lines.length - 1) * lineHeightPx
  const yOffset = totalBlockHeight / 2

  const byFont = new Map<number, PositionedGlyph[]>()
  for (const f of stack.fonts.keys()) byFont.set(f, [])

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!
    const y = yOffset - lineIdx * lineHeightPx

    let lineWidth = 0
    if (line.length > 0) {
      const last = line[line.length - 1]!
      lineWidth = last.x + last.advanceWidth
    }

    let offsetX = 0
    if (align === 'center') offsetX = -lineWidth * 0.5
    else if (align === 'right') offsetX = -lineWidth

    for (const g of line) {
      const arr = byFont.get(g.fontIdx)!
      arr.push({
        glyphId: g.glyphId,
        srcCharIndex: g.srcCharIndex,
        x: g.x + offsetX,
        y,
        scale: g.scale,
      })
    }
  }

  return { byFont }
}
