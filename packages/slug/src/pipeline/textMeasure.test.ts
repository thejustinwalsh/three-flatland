import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { measureText } from './textMeasure.js'
import { parseFont } from './fontParser.js'

const FONT_PATH = resolve(__dirname, '../../../../examples/three/slug-text/public/Inter-Regular.ttf')
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const font = opentype.parse(arrayBuffer)
const { glyphs } = parseFont(arrayBuffer)

describe('measureText (opentype)', () => {
  it('returns positive width for non-empty text', () => {
    const m = measureText(font, glyphs,'Hello', 48)
    expect(m.width).toBeGreaterThan(0)
  })

  it('width scales with fontSize', () => {
    const a = measureText(font, glyphs,'Hello', 24)
    const b = measureText(font, glyphs,'Hello', 48)
    expect(b.width).toBeCloseTo(a.width * 2, 2)
  })

  it('fontBoundingBoxAscent + fontBoundingBoxDescent ≈ fontSize * (asc − desc)/unitsPerEm', () => {
    const m = measureText(font, glyphs,'x', 48)
    const expected = 48 * ((font.ascender ?? 0) - (font.descender ?? 0)) / font.unitsPerEm
    expect(m.fontBoundingBoxAscent + m.fontBoundingBoxDescent).toBeCloseTo(expected, 3)
  })

  it('actualBoundingBoxAscent ≤ fontBoundingBoxAscent', () => {
    const m = measureText(font, glyphs,'Hello', 48)
    expect(m.actualBoundingBoxAscent).toBeLessThanOrEqual(m.fontBoundingBoxAscent + 0.01)
  })

  it('empty string has zero width and zero ink bounds', () => {
    const m = measureText(font, glyphs,'', 48)
    expect(m.width).toBe(0)
    expect(m.actualBoundingBoxLeft).toBe(0)
    expect(m.actualBoundingBoxRight).toBe(0)
    expect(m.actualBoundingBoxAscent).toBe(0)
    expect(m.actualBoundingBoxDescent).toBe(0)
  })

  it('x-height letters have shorter ascent than capitals', () => {
    const mCap = measureText(font, glyphs,'H', 48)
    const mLow = measureText(font, glyphs,'x', 48)
    expect(mLow.actualBoundingBoxAscent).toBeLessThan(mCap.actualBoundingBoxAscent)
  })

  it('newlines do not contribute to width', () => {
    const m1 = measureText(font, glyphs,'Hello', 48)
    const m2 = measureText(font, glyphs,'He\nllo', 48)
    // Newline consumes no advance — width is the sum of the other 5 glyphs.
    expect(m2.width).toBeCloseTo(m1.width, 3)
  })
})
