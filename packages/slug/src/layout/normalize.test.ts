import { describe, it, expect } from 'vitest'
import { normalizeWhitespace, resolveGlyphLayoutProperties } from './normalize'
import { createStubFont } from './stubFont.fixture'

describe('normalizeWhitespace', () => {
  it("'normal' collapses runs of spaces, tabs, and newlines to single spaces and trims", () => {
    expect(normalizeWhitespace('  a\t\tb \n c  ', 'normal')).toBe('a b c')
  })

  it("'collapse' behaves like 'normal' (uikit parity)", () => {
    expect(normalizeWhitespace(' a \n b ', 'collapse')).toBe('a b')
  })

  it("'pre' keeps newlines and spaces verbatim", () => {
    expect(normalizeWhitespace('a  b\n c', 'pre')).toBe('a  b\n c')
  })

  it("'pre' expands tabs to tabSize spaces", () => {
    expect(normalizeWhitespace('a\tb', 'pre', 4)).toBe('a    b')
    expect(normalizeWhitespace('a\tb', 'pre', 2)).toBe('a  b')
  })

  it("'pre' defaults tabSize to 8", () => {
    expect(normalizeWhitespace('\t', 'pre')).toBe(' '.repeat(8))
  })

  it("'pre-line' collapses spaces/tabs but keeps newlines, trimming around line boundaries", () => {
    expect(normalizeWhitespace('a  b \n\t c', 'pre-line')).toBe('a b\nc')
  })

  it("'pre-line' trims leading/trailing spaces of the whole text", () => {
    expect(normalizeWhitespace('  a\nb  ', 'pre-line')).toBe('a\nb')
  })

  it('defaults to normal mode', () => {
    expect(normalizeWhitespace('a\nb')).toBe('a b')
  })
})

describe('resolveGlyphLayoutProperties', () => {
  const font = createStubFont()

  it('fills documented defaults', () => {
    const resolved = resolveGlyphLayoutProperties({ text: 'ab', font })
    expect(resolved.fontSize).toBe(16)
    expect(resolved.letterSpacing).toBe(0)
    expect(resolved.wordBreak).toBe('break-word')
    expect(resolved.whiteSpace).toBe('normal')
    expect(resolved.tabSize).toBe(8)
  })

  it('defaults lineHeight to (ascender - descender) * fontSize', () => {
    const resolved = resolveGlyphLayoutProperties({ text: 'ab', font, fontSize: 10 })
    expect(resolved.lineHeight).toBeCloseTo((0.8 + 0.2) * 10, 12)
  })

  it('resolves percentage lineHeight against fontSize', () => {
    const resolved = resolveGlyphLayoutProperties({
      text: 'ab',
      font,
      fontSize: 20,
      lineHeight: '150%',
    })
    expect(resolved.lineHeight).toBe(30)
  })

  it('passes absolute lineHeight through', () => {
    const resolved = resolveGlyphLayoutProperties({ text: 'ab', font, lineHeight: 24 })
    expect(resolved.lineHeight).toBe(24)
  })

  it('normalizes text per the whiteSpace mode', () => {
    const resolved = resolveGlyphLayoutProperties({
      text: 'a\tb\nc',
      font,
      whiteSpace: 'pre-line',
      tabSize: 2,
    })
    expect(resolved.text).toBe('a b\nc')
  })

  it('is idempotent — resolving resolved properties changes nothing', () => {
    const once = resolveGlyphLayoutProperties({
      text: ' a  b\tc \n d ',
      font,
      fontSize: 12,
      lineHeight: '120%',
      whiteSpace: 'pre-line',
    })
    const twice = resolveGlyphLayoutProperties(once)
    expect(twice).toEqual(once)
  })
})
