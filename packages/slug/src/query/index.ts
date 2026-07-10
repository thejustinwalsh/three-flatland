// Geometric queries over a PositionedGlyphLayout: hit-test, caret,
// selection. Ports of uikit `text/layout/query.ts` — pure functions of the
// layout, no rendering. Caret/selection OUTPUTS use the layout's entry
// convention (y-up, origin at the box center). `getCharIndex` INPUT uses
// uikit's pointer convention instead: `x` from the box's left edge
// (0..availableWidth), `y` from the box's top edge going DOWN (0..-height).
// Convert center-origin points via `x + availableWidth / 2` and
// `y - availableHeight / 2`. Kept asymmetric so uikit's selection/input
// callers port without coordinate churn.

import { getEmBoxTopOffset } from '../layout/baseline'
import { getTextXOffset, getTextYOffset } from '../layout/positioned'
import type {
  CaretTransformation,
  PositionedGlyphLayout,
  PositionedGlyphLayoutEntry,
  SelectionTransformation,
} from '../layout/types'
import { getOffsetToNextLine, getWhitespaceWidth } from '../layout/utils'

const noSelectionTransformations: Array<SelectionTransformation> = []

/**
 * Char index under a point. `'between'` snaps to the nearest glyph
 * boundary (caret placement); `'on'` returns the char whose cell contains
 * the point (hit-testing). Point convention: `x` from the box's LEFT edge,
 * `y` ≤ 0 downward from the box's TOP edge (see module note).
 */
export function getCharIndex(
  layout: PositionedGlyphLayout | undefined,
  x: number,
  y: number,
  position: 'between' | 'on'
): number {
  if (layout == null) {
    return 0
  }
  y -= -getTextYOffset(layout, layout.verticalAlign)
  const lineIndex = Math.floor(y / -getOffsetToNextLine(layout.lineHeight))
  const lines = layout.lines
  if (lineIndex < 0 || lines.length === 0) {
    return 0
  }
  if (lineIndex >= lines.length) {
    const lastLine = lines[lines.length - 1]!
    return lastLine.charIndexOffset + lastLine.charLength + 1
  }

  const line = lines[lineIndex]!
  for (let i = 0; i < line.entries.length; i++) {
    const entry = line.entries[i]!
    if (x < getEntryX(entry, position === 'between' ? 0.5 : 1) + layout.availableWidth / 2) {
      return i + line.charIndexOffset
    }
  }
  return line.charIndexOffset + line.charLength + 1
}

/** Caret line geometry before the char at `charIndex` (clamped to the layout). */
export function getCaretTransformation(
  layout: PositionedGlyphLayout | undefined,
  charIndex: number
): CaretTransformation | undefined {
  if (layout == null || layout.lines.length === 0) {
    return undefined
  }
  const whitespaceWidth = getWhitespaceWidth(layout.font, layout.fontSize)
  const { lineIndex, x } = getGlyphLineAndX(layout, charIndex, true, whitespaceWidth)
  const y = -(
    getTextYOffset(layout, layout.verticalAlign) -
    layout.availableHeight / 2 +
    lineIndex * getOffsetToNextLine(layout.lineHeight) +
    getEmBoxTopOffset(layout.fontSize, layout.lineHeight)
  )
  return { position: [x, y - layout.fontSize / 2], height: layout.fontSize }
}

/**
 * Selection rects for a `[startInclusive, endExclusive)` char range — one
 * rect per touched line. A collapsed range degenerates to a caret.
 */
export function getSelectionTransformations(
  layout: PositionedGlyphLayout | undefined,
  range: readonly [number, number] | undefined
): {
  caret: CaretTransformation | undefined
  selections: Array<SelectionTransformation>
} {
  if (range == null || layout == null || layout.lines.length === 0) {
    return { caret: undefined, selections: noSelectionTransformations }
  }
  const whitespaceWidth = getWhitespaceWidth(layout.font, layout.fontSize)
  const [startCharIndexIncl, endCharIndexExcl] = range
  if (endCharIndexExcl <= startCharIndexIncl) {
    return {
      caret: getCaretTransformation(layout, endCharIndexExcl),
      selections: noSelectionTransformations,
    }
  }

  const start = getGlyphLineAndX(layout, startCharIndexIncl, true, whitespaceWidth)
  const end = getGlyphLineAndX(layout, endCharIndexExcl - 1, false, whitespaceWidth)
  if (start.lineIndex === end.lineIndex) {
    return {
      caret: undefined,
      selections: [
        computeSelectionTransformation(start.lineIndex, start.x, end.x, layout, whitespaceWidth),
      ],
    }
  }

  const selections: Array<SelectionTransformation> = [
    computeSelectionTransformation(start.lineIndex, start.x, undefined, layout, whitespaceWidth),
  ]
  for (let i = start.lineIndex + 1; i < end.lineIndex; i++) {
    selections.push(
      computeSelectionTransformation(i, undefined, undefined, layout, whitespaceWidth)
    )
  }
  selections.push(
    computeSelectionTransformation(end.lineIndex, undefined, end.x, layout, whitespaceWidth)
  )
  return { caret: undefined, selections }
}

function computeSelectionTransformation(
  lineIndex: number,
  startX: number | undefined,
  endX: number | undefined,
  layout: PositionedGlyphLayout,
  whitespaceWidth: number
): SelectionTransformation {
  const line = layout.lines[lineIndex]!
  const firstEntry = line.entries[0]
  const lastEntry = line.entries[line.entries.length - 1]
  if (startX == null) {
    startX =
      firstEntry == null
        ? getTextXOffset(layout.availableWidth, line.nonWhitespaceWidth, layout.textAlign) -
          layout.availableWidth / 2
        : getEntryX(firstEntry, 0)
  }
  if (endX == null) {
    endX = lastEntry == null ? startX : getEntryX(lastEntry, 1, whitespaceWidth)
  }
  const height = getOffsetToNextLine(layout.lineHeight)
  const y = -(
    getTextYOffset(layout, layout.verticalAlign) -
    layout.availableHeight / 2 +
    lineIndex * height
  )
  const width = endX - startX
  return { position: [startX + width / 2, y - height / 2], size: [width, height] }
}

function getGlyphLineAndX(
  layout: PositionedGlyphLayout,
  charIndex: number,
  start: boolean,
  whitespaceWidth: number
): { lineIndex: number; x: number } {
  const { lines, availableWidth, textAlign } = layout
  const linesLength = lines.length
  if (charIndex >= lines[0]!.charIndexOffset) {
    for (let lineIndex = 0; lineIndex < linesLength; lineIndex++) {
      const line = lines[lineIndex]!
      if (charIndex >= line.charIndexOffset + line.charLength) {
        continue
      }
      const entry = line.entries[Math.max(charIndex - line.charIndexOffset, 0)]
      if (entry != null) {
        return { lineIndex, x: getEntryX(entry, start ? 0 : 1, whitespaceWidth) }
      }
      return {
        lineIndex,
        x: getTextXOffset(availableWidth, line.nonWhitespaceWidth, textAlign) - availableWidth / 2,
      }
    }
  }
  const lastLine = lines[linesLength - 1]!
  if (lastLine.entries.length === 0 || charIndex < lastLine.charIndexOffset) {
    return {
      lineIndex: linesLength - 1,
      x:
        getTextXOffset(availableWidth, lastLine.nonWhitespaceWidth, textAlign) - availableWidth / 2,
    }
  }
  const lastEntry = lastLine.entries[lastLine.entries.length - 1]!
  return { lineIndex: linesLength - 1, x: getEntryX(lastEntry, 1, whitespaceWidth) }
}

function getEntryX(
  entry: PositionedGlyphLayoutEntry,
  widthMultiplier: number,
  fallbackWidth?: number
): number {
  return (
    entry.x +
    widthMultiplier * (entry.type === 'whitespace' ? (fallbackWidth ?? entry.width) : entry.width)
  )
}
