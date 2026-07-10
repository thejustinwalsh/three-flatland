import { getHalfLeading } from '@three-flatland/slug'
import type { GlyphLayout } from './layout/index.js'
import type { Font, GlyphInfo } from './font.js'
import type { RootContext } from '../context.js'
import { parseAbsoluteNumber } from '../properties/values.js'

export function getGlyphOffsetX(glyphInfo: GlyphInfo, fontSize: number): number {
  return glyphInfo.xoffset * fontSize
}

export function getKerningOffset(
  font: Font,
  fontSize: number,
  prevGlyphId: number | undefined,
  glyphInfo: GlyphInfo
): number {
  if (prevGlyphId == null) return 0
  return font.getKerning(prevGlyphId, glyphInfo.id) * fontSize
}

export function toAbsoluteNumber(
  value: number | string,
  getRelativeValue?: () => number,
  root?: RootContext
): number {
  const [width, height] = root?.component.size.value ?? []
  return parseAbsoluteNumber(value, getRelativeValue, width, height)
}

export function getGlyphOffsetY(
  font: Font,
  fontSize: number,
  lineHeight: number,
  glyphInfo?: GlyphInfo
): number {
  if (glyphInfo == null) {
    // The caret has no ink: a fontSize-tall box centered in the line box.
    // That is also the content-box center — half-leading centers the
    // content box in the line box (see slug's layout/baseline.ts).
    return (lineHeight - fontSize) / 2
  }
  // yoffset is the baseline-relative ink-top ratio (`ascender - yMax`);
  // half-leading places the content box in the line box, CSS-style.
  return (
    glyphInfo.yoffset * fontSize +
    getHalfLeading(font.slug.ascender, font.slug.descender, fontSize, lineHeight)
  )
}

export function getOffsetToNextGlyph(
  fontSize: number,
  glyphInfo: GlyphInfo,
  letterSpacing: number
): number {
  return glyphInfo.xadvance * fontSize + letterSpacing
}

export function getOffsetToNextLine(lineHeight: number): number {
  return lineHeight
}

export function getGlyphLayoutWidth(layout: GlyphLayout): number {
  return Math.max(...layout.lines.map(({ nonWhitespaceWidth }) => nonWhitespaceWidth))
}

export function getGlyphLayoutHeight(linesAmount: number, lineHeight: number): number {
  return Math.max(linesAmount, 1) * lineHeight
}
