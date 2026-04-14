import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { parseFont } from './pipeline/fontParser.js'
import { packTextures } from './pipeline/texturePacker.js'
import { shapeText } from './pipeline/textShaper.js'
import { wrapLines } from './pipeline/wrapLines.js'
import { measureText } from './pipeline/textMeasure.js'
import { SlugFont } from './SlugFont.js'

const FONT_PATH = resolve(__dirname, '../../../examples/three/slug-text/public/Inter-Regular.ttf')
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

let font: SlugFont

beforeAll(() => {
  const parsed = parseFont(arrayBuffer)
  const textures = packTextures(parsed.glyphs)
  const otFont = opentype.parse(arrayBuffer)
  font = SlugFont._createRuntime(
    parsed.glyphs,
    textures,
    {
      unitsPerEm: parsed.unitsPerEm,
      ascender: parsed.ascender,
      descender: parsed.descender,
      capHeight: parsed.capHeight,
    },
    otFont,
    shapeText,
    wrapLines,
    measureText,
  )
})

describe('SlugFont.measureParagraph', () => {
  it('single-line text → one-line result with matching width', () => {
    const single = font.measureText('Hello', 48)
    const para = font.measureParagraph('Hello', 48)
    expect(para.lines).toHaveLength(1)
    expect(para.lines[0]!.text).toBe('Hello')
    expect(para.lines[0]!.width).toBeCloseTo(single.width, 3)
    expect(para.width).toBeCloseTo(single.width, 3)
  })

  it('height = lines × fontSize × lineHeight', () => {
    const para = font.measureParagraph('Hello', 48, { lineHeight: 1.5 })
    expect(para.height).toBeCloseTo(1 * 48 * 1.5, 3)
  })

  it('default lineHeight is 1.2 (matches SlugText default)', () => {
    const para = font.measureParagraph('a\nb\nc', 48)
    expect(para.lines).toHaveLength(3)
    expect(para.height).toBeCloseTo(3 * 48 * 1.2, 3)
  })

  it('respects maxWidth and returns widest-line width', () => {
    // Inter "Lorem ipsum" at 48 is ~280px; forcing 200 wraps it.
    const para = font.measureParagraph('Lorem ipsum dolor sit amet', 48, { maxWidth: 200 })
    expect(para.lines.length).toBeGreaterThan(1)
    for (const line of para.lines) {
      expect(line.width).toBeLessThanOrEqual(200 + 0.01)
    }
    expect(para.width).toBeLessThanOrEqual(200)
  })

  it('empty string → one empty line with zero width but nonzero font-level ascent/descent', () => {
    const para = font.measureParagraph('', 48)
    expect(para.lines).toHaveLength(1)
    expect(para.lines[0]!.text).toBe('')
    expect(para.width).toBe(0)
    // height still reserves one line regardless of emptiness
    expect(para.height).toBeCloseTo(48 * 1.2, 3)
    expect(para.fontBoundingBoxAscent).toBeGreaterThan(0)
    expect(para.fontBoundingBoxDescent).toBeGreaterThan(0)
  })

  it('preserves explicit newlines as line breaks', () => {
    const para = font.measureParagraph('foo\nbar', 48)
    expect(para.lines.map(l => l.text)).toEqual(['foo', 'bar'])
  })
})
