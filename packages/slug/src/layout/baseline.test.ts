import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { parseFont } from '../pipeline/fontParser'
import { packTextures } from '../pipeline/texturePacker'
import { shapeText } from '../pipeline/textShaper'
import { wrapLines } from '../pipeline/wrapLines'
import { measureText } from '../pipeline/textMeasure'
import { SlugFont } from '../SlugFont'
import { layoutParagraph } from '../text/layout'
import { locateCaret } from '../text/query'
import type { SlugTypeface } from '../text/types'
import { getEmBoxTopOffset, getGlyphTopOffset, getLineBaselineOffset } from './baseline'

// R4 guard suite: the MSDF-baseline → Slug-ascender conversion, asserted
// against HAND-COMPUTED values for Inter-Regular.ttf. Inter's raw numbers
// (from its hhea/glyf tables): unitsPerEm 2048, ascender 1984,
// descender -494, 'H' ink box y ∈ [0, 1490]. If any assertion here moves
// by a constant, every line of rendered text has shifted vertically —
// fix `layout/baseline.ts`, nothing else.
//
// Layout coordinates are paragraph space (D6): top-left origin, +y down.

const FONT_PATH = resolve(
  __dirname,
  '../../../../examples/three/slug-text/public/Inter-Regular.ttf'
)
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
    parsed,
    otFont,
    shapeText,
    wrapLines,
    measureText
  )
})

describe('SlugFont satisfies the typeface contract', () => {
  it('is assignable to SlugTypeface', () => {
    const typeface: SlugTypeface = font
    expect(typeface.ascender).toBeGreaterThan(0)
    expect(typeface.descender).toBeLessThan(0)
    expect(typeface.unitsPerEm).toBe(2048)
  })
})

describe('R4: baseline conversion against hand-computed Inter metrics', () => {
  it('Inter em-space metrics are the hand-computed table values', () => {
    expect(font.unitsPerEm).toBe(2048)
    expect(font.ascender).toBe(1984 / 2048) // 0.96875
    expect(font.descender).toBe(-494 / 2048) // -0.2412109375
  })

  it('baseline offset with lineHeight == fontSize is exactly ascender * fontSize', () => {
    expect(getLineBaselineOffset(font.ascender, 48, 48)).toBe(46.5) // 0.96875 * 48
  })

  it("a single line's first baseline matches fontBoundingBoxAscent", () => {
    const fontSize = 48
    const metrics = font.measureText('Hello', fontSize)
    const p = layoutParagraph('Hello', {
      typeface: font,
      fontSize,
      lineSpacing: 1,
      maxWidth: 400,
    })
    const line = p.lines[0]!
    // D6: baselineY is the distance DOWN from the block top
    expect(line.baselineY).toBeCloseTo(metrics.fontBoundingBoxAscent, 12)
    expect(line.baselineY).toBe(46.5)
  })

  it('line-box geometry at the font-native line height (hand-computed)', () => {
    // lineSpacing (asc - desc) = 1.2099609375 → lineHeight 58.078125
    // baseline offset = (lh - fs)/2 + asc*fs = 5.0390625 + 46.5 = 51.5390625
    const fontSize = 48
    const lineSpacing = font.ascender - font.descender
    const lineHeight = lineSpacing * fontSize
    expect(lineHeight).toBe(58.078125)
    expect(getEmBoxTopOffset(fontSize, lineHeight)).toBe(5.0390625)
    expect(getLineBaselineOffset(font.ascender, fontSize, lineHeight)).toBe(51.5390625)

    const p = layoutParagraph('Hello', {
      typeface: font,
      fontSize,
      lineSpacing,
      maxWidth: 400,
    })
    const line = p.lines[0]!
    expect(line.y).toBe(0)
    expect(line.height).toBe(58.078125)
    expect(line.baselineY).toBe(51.5390625)
  })

  it("glyph ink top: 'H' sits (ascender - yMax) * fontSize below the em-box top (hand-computed)", () => {
    // Inter 'H': yMax = 1490/2048 = 0.7275390625
    // top offset at lh == fs: (1984 - 1490)/2048 * 48 = 11.578125
    const h = font.getGlyphMetricsForChar('H')!
    expect(h.bounds.yMax).toBe(1490 / 2048)
    expect(getGlyphTopOffset(font.ascender, h.bounds.yMax, 48, 48)).toBe(11.578125)

    const p = layoutParagraph('H', {
      typeface: font,
      fontSize: 48,
      lineSpacing: 1,
      maxWidth: 100,
    })
    // renderers derive ink top as baselineY - yMax * fontSize
    const line = p.lines[0]!
    expect(line.baselineY - h.bounds.yMax * 48).toBe(11.578125)
  })

  it('multi-line spacing is exactly fontSize * lineSpacing', () => {
    const p = layoutParagraph('one\ntwo\nthree', {
      typeface: font,
      fontSize: 48,
      lineSpacing: 1.5,
      collapseSpaces: false,
      maxWidth: 400,
    })
    expect(p.lines).toHaveLength(3)
    const [l0, l1, l2] = p.lines
    expect(l1!.baselineY - l0!.baselineY).toBe(48 * 1.5)
    expect(l2!.baselineY - l1!.baselineY).toBe(48 * 1.5)
    // and the same must hold for caret line placement (query path) —
    // D6: baselineY grows with lineIndex
    const c0 = locateCaret(p, 0)
    const c1 = locateCaret(p, 4)
    expect(c1.baselineY - c0.baselineY).toBe(48 * 1.5)
  })

  it('whitespace has metrics — caret placement after a space works on a real font', () => {
    const space = font.getGlyphMetricsForChar(' ')!
    expect(space.hasOutline).toBe(false)
    expect(space.advanceWidth).toBe(576 / 2048) // hand-computed from hmtx

    const p = layoutParagraph('a b', {
      typeface: font,
      fontSize: 48,
      lineSpacing: 1,
      maxWidth: 400,
    })
    expect(p.characters[1]!.hasOutline).toBe(false)
    expect(p.characters[1]!.advance).toBeCloseTo((576 / 2048) * 48, 12)
    const caretAfterSpace = locateCaret(p, 2)
    expect(caretAfterSpace.x).toBeGreaterThan(p.characters[0]!.x)
  })
})
