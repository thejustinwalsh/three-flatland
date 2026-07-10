import { getGlyphTopOffset, getLineBaselineOffset } from './baseline'
import { buildLayoutResolved } from './measure'
import { resolveGlyphLayoutProperties } from './normalize'
import type {
  GlyphLayout,
  PositionedGlyphLayout,
  PositionedGlyphLayoutEntry,
  PositionedGlyphLayoutLine,
  SlugGlyphLayoutProperties,
  TextAlign,
  VerticalAlign,
} from './types'
import {
  getGlyphInkWidth,
  getGlyphLayoutHeight,
  getGlyphMetricsWithFallback,
  getGlyphOffsetX,
  getKerningOffset,
  getOffsetToNextGlyph,
  getOffsetToNextLine,
  getWhitespaceWidth,
} from './utils'

export interface BuildPositionedGlyphLayoutOptions {
  /** Wrap constraint and alignment extent. Omit for intrinsic width. */
  availableWidth?: number
  /** Vertical alignment extent. Omit for intrinsic height. */
  availableHeight?: number
  /** Default `'left'`. */
  textAlign?: TextAlign
  /** Default `'top'`. */
  verticalAlign?: VerticalAlign
}

/**
 * Wrap, position, and align text into per-line entries with x/y/width for
 * every char — including whitespace, so caret and hit-test queries work
 * after a space. Port of uikit `buildPositionedGlyphLayout` onto Slug
 * metrics; coordinates are y-up, origin at the box center (see
 * `PositionedGlyphLayoutEntry`).
 */
export function buildPositionedGlyphLayout(
  properties: SlugGlyphLayoutProperties,
  options: BuildPositionedGlyphLayoutOptions = {}
): PositionedGlyphLayout {
  const resolved = resolveGlyphLayoutProperties(properties)
  const layout = buildLayoutResolved(resolved, options.availableWidth, options.availableHeight)
  const textAlign = options.textAlign ?? 'left'
  const verticalAlign = options.verticalAlign ?? 'top'

  const positionedLines: Array<PositionedGlyphLayoutLine> = []
  const { font, fontSize, letterSpacing, lineHeight, text, availableWidth, availableHeight } =
    layout
  const whitespaceWidth = getWhitespaceWidth(font, fontSize)
  const baselineOffset = getLineBaselineOffset(font.ascender, fontSize, lineHeight)
  let y = getTextYOffset(layout, verticalAlign) - availableHeight / 2

  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex++) {
    const line = layout.lines[lineIndex]!
    const entries: Array<PositionedGlyphLayoutEntry> = []
    const offsetPerWhitespace =
      textAlign === 'justify' && line.whitespacesBetween > 0
        ? (availableWidth - line.nonWhitespaceWidth) / line.whitespacesBetween
        : 0
    let x = getTextXOffset(availableWidth, line.nonWhitespaceWidth, textAlign) - availableWidth / 2
    let prevGlyphId: number | undefined

    for (
      let charIndex = line.charIndexOffset;
      charIndex < line.charIndexOffset + line.charLength;
      charIndex++
    ) {
      const char = text[charIndex]!
      const metrics = getGlyphMetricsWithFallback(font, char)
      x += getKerningOffset(font, fontSize, prevGlyphId, metrics.glyphId)
      prevGlyphId = metrics.glyphId

      if (char === ' ' || charIndex > line.nonWhitespaceCharLength + line.charIndexOffset) {
        entries.push({
          type: 'whitespace',
          charIndex,
          x: x + getGlyphOffsetX(metrics, fontSize),
          width: whitespaceWidth,
          penX: x,
        })
        x += offsetPerWhitespace + getOffsetToNextGlyph(fontSize, metrics, letterSpacing)
        continue
      }

      entries.push({
        type: 'glyph',
        charIndex,
        char,
        glyphId: metrics.glyphId,
        metrics,
        x: x + getGlyphOffsetX(metrics, fontSize),
        y: -(y + getGlyphTopOffset(font.ascender, metrics.bounds.yMax, fontSize, lineHeight)),
        width: getGlyphInkWidth(metrics, fontSize),
        penX: x,
      })
      x += getOffsetToNextGlyph(fontSize, metrics, letterSpacing)
    }

    positionedLines.push({ ...line, entries, y: -y, baselineY: -(y + baselineOffset) })
    y += getOffsetToNextLine(lineHeight)
  }

  return {
    ...layout,
    lines: positionedLines,
    textAlign,
    verticalAlign,
  }
}

/** Line x offset (from the box's left edge) for a text alignment. */
export function getTextXOffset(
  availableWidth: number,
  nonWhitespaceWidth: number,
  textAlign: TextAlign
): number {
  switch (textAlign) {
    case 'right':
      return availableWidth - nonWhitespaceWidth
    case 'center':
      return (availableWidth - nonWhitespaceWidth) / 2
    default:
      return 0
  }
}

/** Block y offset (from the box's top edge) for a vertical alignment. */
export function getTextYOffset(
  layout: Pick<GlyphLayout, 'availableHeight' | 'lines' | 'lineHeight'>,
  verticalAlign: VerticalAlign
): number {
  switch (verticalAlign) {
    case 'center':
    case 'middle':
      return (
        (layout.availableHeight - getGlyphLayoutHeight(layout.lines.length, layout.lineHeight)) / 2
      )
    case 'bottom':
      return layout.availableHeight - getGlyphLayoutHeight(layout.lines.length, layout.lineHeight)
    default:
      return 0
  }
}
