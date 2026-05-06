import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { shapeText } from './textShaper'

const FONT_PATH = resolve(
  __dirname,
  '../../../../examples/three/slug-text/public/Inter-Regular.ttf'
)
const fontBuffer = readFileSync(FONT_PATH)
const arrayBuffer = fontBuffer.buffer.slice(
  fontBuffer.byteOffset,
  fontBuffer.byteOffset + fontBuffer.byteLength
)
const font = opentype.parse(arrayBuffer)

describe('textShaper', () => {
  it('shapes single-line text with correct glyph count', () => {
    const glyphs = shapeText(font, 'Hello', 48)
    expect(glyphs.length).toBe(5)
  })

  it('positions glyphs left-to-right with increasing x', () => {
    const glyphs = shapeText(font, 'ABC', 48)
    expect(glyphs[0]!.x).toBeLessThan(glyphs[1]!.x)
    expect(glyphs[1]!.x).toBeLessThan(glyphs[2]!.x)
  })

  it('applies center alignment', () => {
    const glyphs = shapeText(font, 'Hello', 48, { align: 'center' })
    // First glyph should be at negative x (shifted left from center)
    expect(glyphs[0]!.x).toBeLessThan(0)
    // Last glyph should be at positive x
    expect(glyphs[glyphs.length - 1]!.x).toBeGreaterThan(0)
  })

  it('applies right alignment', () => {
    const glyphs = shapeText(font, 'Hello', 48, { align: 'right' })
    // All glyphs should be at negative x (shifted left)
    for (const g of glyphs) {
      expect(g.x).toBeLessThanOrEqual(0)
    }
  })

  it('breaks on newline characters', () => {
    const glyphs = shapeText(font, 'AB\nCD', 48)
    // A and B on line 0 (y=0), C and D on line 1 (y < 0)
    const lineYs = [...new Set(glyphs.map((g) => g.y))]
    expect(lineYs.length).toBe(2)
    expect(lineYs[0]).toBeGreaterThan(lineYs[1]!) // first line above second
  })

  it('word-wraps at maxWidth on word boundaries', () => {
    // Use a narrow maxWidth to force wrapping
    const glyphs = shapeText(font, 'Hello World Test', 48, { maxWidth: 200 })
    const lineYs = [...new Set(glyphs.map((g) => g.y))]
    // Should produce multiple lines
    expect(lineYs.length).toBeGreaterThan(1)
  })

  it('does not wrap when text fits within maxWidth', () => {
    const glyphs = shapeText(font, 'Hi', 48, { maxWidth: 1000 })
    const lineYs = [...new Set(glyphs.map((g) => g.y))]
    expect(lineYs.length).toBe(1)
  })

  it('skips space glyphs (no outline) but advances cursor', () => {
    const withSpace = shapeText(font, 'A B', 48)
    const noSpace = shapeText(font, 'AB', 48)
    // With space: 2 visible glyphs (A, B) but B is further right
    expect(withSpace.length).toBe(2)
    expect(noSpace.length).toBe(2)
    expect(withSpace[1]!.x).toBeGreaterThan(noSpace[1]!.x) // space adds width
  })

  it('sets consistent scale for all glyphs', () => {
    const glyphs = shapeText(font, 'Hello', 48)
    const scale = 48 / font.unitsPerEm
    for (const g of glyphs) {
      expect(g.scale).toBeCloseTo(scale, 10)
    }
  })

  it('respects lineHeight multiplier', () => {
    const tight = shapeText(font, 'A\nB', 48, { lineHeight: 1.0 })
    const loose = shapeText(font, 'A\nB', 48, { lineHeight: 2.0 })
    const tightGap = Math.abs(tight[0]!.y - tight[1]!.y)
    const looseGap = Math.abs(loose[0]!.y - loose[1]!.y)
    expect(looseGap).toBeGreaterThan(tightGap)
  })
})
