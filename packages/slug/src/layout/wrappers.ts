import type { GlyphLayoutLine, ResolvedGlyphLayoutProperties } from './types'
import { getGlyphMetricsWithFallback, getOffsetToNextGlyph } from './utils'

/**
 * A wrapper consumes chars from `textStartIndex` and fills `target` with
 * one line's extent. Ports of uikit `text/wrapper/*.ts` with the glyph
 * contract swapped to Slug metrics. Widths use advances + letterSpacing
 * only — kerning is applied at positioning time (upstream behavior,
 * preserved for parity).
 */
export type GlyphWrapper = (
  properties: ResolvedGlyphLayoutProperties,
  availableWidth: number | undefined,
  textStartIndex: number,
  target: GlyphLayoutLine
) => void

function resetLine(target: GlyphLayoutLine, charIndexOffset: number): void {
  target.charIndexOffset = charIndexOffset
  target.nonWhitespaceCharLength = 0
  target.charLength = 0
  target.nonWhitespaceWidth = 0
  target.whitespacesBetween = 0
}

/** Wraps between words (`wordBreak: 'break-word'`). A word longer than the line overflows rather than splitting. */
export const WordWrapper: GlyphWrapper = (
  { text, fontSize, font, letterSpacing },
  availableWidth,
  charIndex,
  target
) => {
  const firstIndex = charIndex
  resetLine(target, firstIndex)

  let position = 0
  let whitespaces = 0
  for (; charIndex < text.length; charIndex++) {
    const char = text[charIndex]!
    if (char === '\n') {
      target.charLength = charIndex - firstIndex + 1
      break
    }

    position += getOffsetToNextGlyph(
      fontSize,
      getGlyphMetricsWithFallback(font, char),
      letterSpacing
    )

    if (char === ' ') {
      whitespaces += 1
      target.charLength = charIndex - firstIndex + 1
      continue
    }

    //non whitespace
    if (target.nonWhitespaceWidth > 0 && availableWidth != null && position > availableWidth) {
      break
    }

    const nextChar = text[charIndex + 1]
    if (nextChar === ' ' || nextChar === '\n' || nextChar == null) {
      //next char is a whitespace/end of text => save point
      target.charLength = charIndex - firstIndex + 1
      target.nonWhitespaceCharLength = target.charLength
      target.nonWhitespaceWidth = position
      target.whitespacesBetween = whitespaces
    }
  }
}

/** Wraps at any glyph (`wordBreak: 'break-all'`). */
export const BreakallWrapper: GlyphWrapper = (
  { text, fontSize, font, letterSpacing },
  availableWidth,
  charIndex,
  target
) => {
  const firstIndex = charIndex
  resetLine(target, firstIndex)

  let position = 0
  let whitespaces = 0

  for (; charIndex < text.length; charIndex++) {
    const char = text[charIndex]!
    if (char === '\n') {
      target.charLength = charIndex - firstIndex + 1
      return
    }

    position += getOffsetToNextGlyph(
      fontSize,
      getGlyphMetricsWithFallback(font, char),
      letterSpacing
    )

    if (char === ' ') {
      whitespaces += 1
      continue
    }

    //non whitespace
    if (target.nonWhitespaceWidth > 0 && availableWidth != null && position > availableWidth) {
      break
    }

    target.nonWhitespaceCharLength = charIndex - firstIndex + 1
    target.nonWhitespaceWidth = position
    target.whitespacesBetween = whitespaces
  }

  //not "+1" because we break when we want to remove the last one
  target.charLength = charIndex - firstIndex
}

/** Breaks only at `\n` (`wordBreak: 'keep-all'`). */
export const NowrapWrapper: GlyphWrapper = (
  { text, fontSize, font, letterSpacing },
  _availableWidth,
  charIndex,
  target
) => {
  const firstIndex = charIndex
  resetLine(target, firstIndex)

  let position = 0
  let whitespaces = 0

  for (; charIndex < text.length; charIndex++) {
    const char = text[charIndex]!
    if (char === '\n') {
      target.charLength = charIndex - firstIndex + 1
      return
    }
    position += getOffsetToNextGlyph(
      fontSize,
      getGlyphMetricsWithFallback(font, char),
      letterSpacing
    )

    if (char === ' ') {
      whitespaces += 1
      continue
    }

    target.nonWhitespaceWidth = position
    target.whitespacesBetween = whitespaces
    target.nonWhitespaceCharLength = charIndex - firstIndex + 1
  }

  target.charLength = charIndex - firstIndex
}

export const glyphWrappers = {
  'keep-all': NowrapWrapper,
  'break-all': BreakallWrapper,
  'break-word': WordWrapper,
} satisfies Record<ResolvedGlyphLayoutProperties['wordBreak'], GlyphWrapper>
