import { resolveGlyphLayoutProperties } from './normalize'
import type {
  GlyphLayout,
  GlyphLayoutLine,
  ResolvedGlyphLayoutProperties,
  SlugGlyphLayoutProperties,
} from './types'
import { getGlyphLayoutHeight } from './utils'
import { glyphWrappers } from './wrappers'

const lineHelper = {} as GlyphLayoutLine

/**
 * Measure text without building a layout: widest line, block height, and
 * line count under an optional width constraint. Omit `availableWidth`
 * for intrinsic (unwrapped) size. Port of uikit `measureGlyphLayout`.
 */
export function measureGlyphLayout(
  properties: SlugGlyphLayoutProperties,
  availableWidth?: number
): { width: number; height: number; lineCount: number } {
  return measureResolved(resolveGlyphLayoutProperties(properties), availableWidth)
}

/** @internal — measure already-resolved properties (skips re-normalizing). */
export function measureResolved(
  properties: ResolvedGlyphLayoutProperties,
  availableWidth?: number
): { width: number; height: number; lineCount: number } {
  const wrapper = glyphWrappers[properties.wordBreak]
  const text = properties.text

  let width = 0
  let lines = 0
  let charIndex = 0

  while (charIndex < text.length) {
    wrapper(properties, availableWidth, charIndex, lineHelper)
    width = Math.max(width, lineHelper.nonWhitespaceWidth)
    lines += 1
    charIndex = lineHelper.charLength + lineHelper.charIndexOffset
  }

  if (text[text.length - 1] === '\n') {
    lines += 1
  }

  return {
    width,
    height: getGlyphLayoutHeight(lines, properties.lineHeight),
    lineCount: Math.max(lines, 1),
  }
}

/**
 * Wrap text into lines under `availableWidth` (omit for no constraint).
 * The result carries the resolved properties — including the normalized
 * `text` all `charIndexOffset` values refer to. Port of uikit
 * `buildGlyphLayout`.
 */
export function buildGlyphLayout(
  properties: SlugGlyphLayoutProperties,
  availableWidth?: number,
  availableHeight?: number
): GlyphLayout {
  return buildLayoutResolved(
    resolveGlyphLayoutProperties(properties),
    availableWidth,
    availableHeight
  )
}

/** @internal — build from already-resolved properties. */
export function buildLayoutResolved(
  properties: ResolvedGlyphLayoutProperties,
  availableWidth?: number,
  availableHeight?: number
): GlyphLayout {
  const lines: Array<GlyphLayoutLine> = []
  const wrapper = glyphWrappers[properties.wordBreak]
  const text = properties.text

  let charIndex = 0

  while (charIndex < text.length) {
    const line = {} as GlyphLayoutLine
    wrapper(properties, availableWidth, charIndex, line)
    lines.push(line)
    charIndex = line.charLength + line.charIndexOffset
  }

  if (lines.length === 0 || text[text.length - 1] === '\n') {
    lines.push({
      charLength: 0,
      nonWhitespaceWidth: 0,
      whitespacesBetween: 0,
      charIndexOffset: text.length,
      nonWhitespaceCharLength: 0,
    })
  }

  let width = availableWidth
  if (width === undefined) {
    width = 0
    for (const line of lines) width = Math.max(width, line.nonWhitespaceWidth)
  }

  return {
    lines,
    availableWidth: width,
    availableHeight: availableHeight ?? getGlyphLayoutHeight(lines.length, properties.lineHeight),
    ...properties,
  }
}
