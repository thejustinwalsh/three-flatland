import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { parseFont } from './pipeline/fontParser'
import { packTextures } from './pipeline/texturePacker'
import { shapeText } from './pipeline/textShaper'
import { wrapLines } from './pipeline/wrapLines'
import { measureText } from './pipeline/textMeasure'
import { shapeStackText } from './pipeline/textShaperStack'
import { SlugFont } from './SlugFont'
import { SlugFontStack } from './SlugFontStack'

const FONT_PATH = resolve(__dirname, '../../../examples/three/slug-text/public/Inter-Regular.ttf')
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

let inter: SlugFont
let otFont: opentype.Font

beforeAll(() => {
  const parsed = parseFont(arrayBuffer)
  const textures = packTextures(parsed.glyphs)
  otFont = opentype.parse(arrayBuffer)
  inter = SlugFont._createRuntime(
    parsed.glyphs,
    textures,
    {
      unitsPerEm: parsed.unitsPerEm,
      ascender: parsed.ascender,
      descender: parsed.descender,
      capHeight: parsed.capHeight,
      underlinePosition: parsed.underlinePosition,
      underlineThickness: parsed.underlineThickness,
      strikethroughPosition: parsed.strikethroughPosition,
      strikethroughThickness: parsed.strikethroughThickness,
      subscriptScale: parsed.subscriptScale,
      subscriptOffset: parsed.subscriptOffset,
      superscriptScale: parsed.superscriptScale,
      superscriptOffset: parsed.superscriptOffset,
    },
    otFont,
    shapeText,
    wrapLines,
    measureText
  )
})

describe('SlugFontStack', () => {
  it('throws when constructed with an empty list', () => {
    expect(() => new SlugFontStack([])).toThrow(/at least one font/)
  })

  it('exposes primary as the first font', () => {
    const stack = new SlugFontStack([inter])
    expect(stack.primary).toBe(inter)
  })

  it('resolves a covered codepoint to its first-matching font', () => {
    const stack = new SlugFontStack([inter])
    expect(stack.resolveCodepoint(0x41)).toBe(0)
  })

  it('returns 0 (notdef-on-primary) for an unmapped codepoint', () => {
    const stack = new SlugFontStack([inter])
    expect(stack.resolveCodepoint(0x1f600)).toBe(0)
  })

  it('walks a string into per-character font assignments', () => {
    const stack = new SlugFontStack([inter])
    const out = stack.resolveText('AB')
    expect(out).toEqual(new Uint8Array([0, 0]))
  })
})

describe('shapeStackText (single-font, parity with shapeText)', () => {
  it('returns positioned glyphs grouped under the primary font index', () => {
    const stack = new SlugFontStack([inter])
    const result = shapeStackText(stack, 'Hello', 48)
    expect(result.byFont.get(0)?.length).toBeGreaterThan(0)
    expect(result.byFont.get(0)?.[0]?.glyphId).toBeGreaterThan(0)
  })

  it('preserves srcCharIndex per glyph in ascending order', () => {
    const stack = new SlugFontStack([inter])
    const result = shapeStackText(stack, 'Hello', 48)
    const glyphs = result.byFont.get(0)!
    for (let i = 1; i < glyphs.length; i++) {
      expect(glyphs[i]!.srcCharIndex).toBeGreaterThan(glyphs[i - 1]!.srcCharIndex)
    }
  })

  it('matches shapeText positions for ASCII (single-font case)', () => {
    const stack = new SlugFontStack([inter])
    const stackResult = shapeStackText(stack, 'Hello', 48, { align: 'center', lineHeight: 1.2 })
    const opentypeResult = shapeText(otFont, 'Hello', 48, { align: 'center', lineHeight: 1.2 })
    const stackGlyphs = stackResult.byFont.get(0)!
    expect(stackGlyphs).toHaveLength(opentypeResult.length)
    for (let i = 0; i < stackGlyphs.length; i++) {
      expect(stackGlyphs[i]!.x).toBeCloseTo(opentypeResult[i]!.x, 3)
      expect(stackGlyphs[i]!.y).toBeCloseTo(opentypeResult[i]!.y, 3)
      expect(stackGlyphs[i]!.glyphId).toBe(opentypeResult[i]!.glyphId)
    }
  })

  it('honours maxWidth and wraps onto multiple lines', () => {
    const stack = new SlugFontStack([inter])
    const result = shapeStackText(stack, 'Lorem ipsum dolor sit amet', 48, { maxWidth: 200 })
    const glyphs = result.byFont.get(0)!
    const uniqueYs = new Set(glyphs.map((g) => g.y))
    expect(uniqueYs.size).toBeGreaterThan(1)
  })
})
