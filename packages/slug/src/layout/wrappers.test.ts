import { describe, it, expect } from 'vitest'
import { resolveGlyphLayoutProperties } from './normalize'
import { createStubFont } from './stubFont.fixture'
import type { GlyphLayoutLine, ResolvedGlyphLayoutProperties } from './types'
import { BreakallWrapper, NowrapWrapper, WordWrapper, type GlyphWrapper } from './wrappers'

// Stub font: every lowercase char and space advances 0.5 em.
// fontSize 10 → 5 units per char; hand-computed expectations throughout.
const font = createStubFont()

function props(text: string, letterSpacing = 0): ResolvedGlyphLayoutProperties {
  return resolveGlyphLayoutProperties({
    text,
    font,
    fontSize: 10,
    letterSpacing,
    whiteSpace: 'pre', // keep text verbatim so char indices are the input's
  })
}

function wrapAll(
  wrapper: GlyphWrapper,
  properties: ResolvedGlyphLayoutProperties,
  availableWidth: number | undefined
): GlyphLayoutLine[] {
  const lines: GlyphLayoutLine[] = []
  let charIndex = 0
  while (charIndex < properties.text.length) {
    const line = {} as GlyphLayoutLine
    wrapper(properties, availableWidth, charIndex, line)
    lines.push(line)
    charIndex = line.charIndexOffset + line.charLength
  }
  return lines
}

describe('WordWrapper (break-word)', () => {
  it('breaks at spaces when a word would overflow', () => {
    // "aa bb cc" at width 14: each line holds one 10-wide word
    const lines = wrapAll(WordWrapper, props('aa bb cc'), 14)
    expect(lines.map((l) => l.charIndexOffset)).toEqual([0, 3, 6])
    expect(lines.map((l) => l.charLength)).toEqual([3, 3, 2])
    expect(lines.map((l) => l.nonWhitespaceWidth)).toEqual([10, 10, 10])
    expect(lines.map((l) => l.nonWhitespaceCharLength)).toEqual([2, 2, 2])
  })

  it('lets a word longer than availableWidth overflow instead of splitting it', () => {
    const lines = wrapAll(WordWrapper, props('aaaa bb'), 12)
    expect(lines.map((l) => l.charLength)).toEqual([5, 2])
    expect(lines[0]!.nonWhitespaceWidth).toBe(20) // overflows 12
  })

  it('honors explicit newlines, including the \\n in charLength', () => {
    const lines = wrapAll(WordWrapper, props('a\nb'), undefined)
    expect(lines.map((l) => l.charLength)).toEqual([2, 1])
    expect(lines[0]!.nonWhitespaceWidth).toBe(5)
    expect(lines[0]!.nonWhitespaceCharLength).toBe(1)
  })

  it('counts whitespacesBetween for justify (spaces between words only)', () => {
    const [line] = wrapAll(WordWrapper, props('a b c'), undefined)
    expect(line!.whitespacesBetween).toBe(2)
    expect(line!.nonWhitespaceWidth).toBe(25)
    expect(line!.nonWhitespaceCharLength).toBe(5)
  })

  it('keeps trailing spaces in charLength but not in nonWhitespace measures', () => {
    const [line] = wrapAll(WordWrapper, props('ab  '), undefined)
    expect(line!.charLength).toBe(4)
    expect(line!.nonWhitespaceCharLength).toBe(2)
    expect(line!.nonWhitespaceWidth).toBe(10)
    expect(line!.whitespacesBetween).toBe(0)
  })

  it('letterSpacing widens advances and changes break points', () => {
    // spacing 2 → 7 per char; "aa bb" at width 14: "aa" = 14, fits exactly
    const lines = wrapAll(WordWrapper, props('aa bb', 2), 14)
    expect(lines.map((l) => l.charLength)).toEqual([3, 2])
    expect(lines[0]!.nonWhitespaceWidth).toBe(14)
  })
})

describe('BreakallWrapper (break-all)', () => {
  it('breaks mid-word at the width limit', () => {
    const lines = wrapAll(BreakallWrapper, props('aaaa'), 12)
    expect(lines.map((l) => l.charLength)).toEqual([2, 2])
    expect(lines.map((l) => l.nonWhitespaceWidth)).toEqual([10, 10])
  })

  it('never emits a zero-glyph line even when one char exceeds the width', () => {
    const lines = wrapAll(BreakallWrapper, props('aaa'), 3)
    expect(lines.map((l) => l.charLength)).toEqual([1, 1, 1])
  })

  it('honors explicit newlines', () => {
    const lines = wrapAll(BreakallWrapper, props('ab\ncd'), undefined)
    expect(lines.map((l) => l.charIndexOffset)).toEqual([0, 3])
    expect(lines.map((l) => l.charLength)).toEqual([3, 2])
  })
})

describe('NowrapWrapper (keep-all)', () => {
  it('ignores availableWidth entirely', () => {
    const [line] = wrapAll(NowrapWrapper, props('aaaa bb'), 10)
    expect(line!.charLength).toBe(7)
    expect(line!.nonWhitespaceWidth).toBe(35)
    expect(line!.whitespacesBetween).toBe(1)
  })

  it('still breaks at explicit newlines', () => {
    const lines = wrapAll(NowrapWrapper, props('aa\nbb'), 5)
    expect(lines.map((l) => l.charLength)).toEqual([3, 2])
  })
})

describe('unmapped chars', () => {
  it('fall back to a 0.6 em advance (uikit MISSING_GLYPH parity)', () => {
    const [line] = wrapAll(WordWrapper, props('aZ'), undefined) // 'Z' unmapped in stub
    expect(line!.nonWhitespaceWidth).toBeCloseTo(5 + 6, 12)
  })
})
