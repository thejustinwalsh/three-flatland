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
import { getHalfLeading, getGlyphTopOffset, getLineBaselineOffset } from './baseline'

// R4 guard suite: CSS's line-box model over Slug's baseline-relative
// metrics, asserted against HAND-COMPUTED values for Inter-Regular.ttf.
// Inter's raw numbers (from its hhea/glyf tables): unitsPerEm 2048,
// ascender 1984, descender -494, 'H' ink box y ∈ [0, 1490]. Derived:
//
//   ascender      = 1984 / 2048          = 0.96875
//   descender     = -494 / 2048          = -0.2412109375
//   contentHeight = (1984 + 494) / 2048  = 1.2099609375 em  (NOT 1 em)
//   halfLeading   = (lineHeight - contentHeight*fontSize) / 2
//   baseline      = halfLeading + ascender * fontSize
//
// If any assertion here moves by a constant, every line of rendered text
// has shifted vertically — fix `layout/baseline.ts`, nothing else.
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

  it('half-leading is NEGATIVE for Inter at lineHeight = 1.2 * fontSize', () => {
    // Inter's content box (1.2099609375 em) is taller than a 1.2 em line
    // box, so glyphs overflow the line box by a hair — exactly what a
    // browser does with Inter at `line-height: 1.2`.
    // fs 14: (16.8  - 14 * 1.2099609375)/2 = (16.8  - 16.939453125)/2 = -0.0697265625
    // fs 16: (19.2  - 16 * 1.2099609375)/2 = (19.2  - 19.359375   )/2 = -0.0796875
    // fs 24: (28.8  - 24 * 1.2099609375)/2 = (28.8  - 29.0390625  )/2 = -0.11953125
    // fs 48: (57.6  - 48 * 1.2099609375)/2 = (57.6  - 58.078125   )/2 = -0.2390625
    const { ascender, descender } = font
    expect(getHalfLeading(ascender, descender, 14, 14 * 1.2)).toBeCloseTo(-0.0697265625, 12)
    expect(getHalfLeading(ascender, descender, 16, 16 * 1.2)).toBeCloseTo(-0.0796875, 12)
    expect(getHalfLeading(ascender, descender, 24, 24 * 1.2)).toBeCloseTo(-0.11953125, 12)
    expect(getHalfLeading(ascender, descender, 48, 48 * 1.2)).toBeCloseTo(-0.2390625, 12)
  })

  it('the old em-box centering sat every baseline 0.105 * fontSize too low (regression pin)', () => {
    // Old (wrong): (lineHeight - fontSize)/2 + ascender*fontSize.
    // Shift = old - new = ((asc - desc) - 1)/2 * fontSize = 0.10498046875 * fs
    // fs 14 → 1.4697265625, fs 16 → 1.6796875, fs 24 → 2.51953125 — the
    // exact pixel errors measured against Canvas2D before the fix.
    const { ascender, descender } = font
    for (const fs of [14, 16, 24]) {
      const lh = fs * 1.2
      const old = (lh - fs) / 2 + ascender * fs
      const corrected = getLineBaselineOffset(ascender, descender, fs, lh)
      expect(old - corrected).toBeCloseTo(0.10498046875 * fs, 12)
    }
  })

  it('baseline offset equals halfLeading + ascender * fontSize (several fontSize/lineHeight pairs)', () => {
    const { ascender, descender } = font
    const pairs: Array<[number, number]> = [
      [48, 48], // lineSpacing 1
      [48, 57.6], // lineSpacing 1.2
      [48, 72], // lineSpacing 1.5
      [16, 19.2],
      [24, 24],
    ]
    for (const [fs, lh] of pairs) {
      expect(getLineBaselineOffset(ascender, descender, fs, lh)).toBeCloseTo(
        getHalfLeading(ascender, descender, fs, lh) + ascender * fs,
        12
      )
    }
    // And one fully hand-computed anchor, fs 48 / lh 48:
    // halfLeading = (48 - 58.078125)/2 = -5.0390625
    // baseline    = -5.0390625 + 0.96875*48 = -5.0390625 + 46.5 = 41.4609375
    expect(getLineBaselineOffset(ascender, descender, 48, 48)).toBe(41.4609375)
  })

  it("a single line's first baseline is fontBoundingBoxAscent plus the half-leading", () => {
    const fontSize = 48
    const metrics = font.measureText('Hello', fontSize)
    const p = layoutParagraph('Hello', {
      typeface: font,
      fontSize,
      lineSpacing: 1,
      maxWidth: 400,
    })
    const line = p.lines[0]!
    // D6: baselineY is the distance DOWN from the block top.
    // fontBoundingBoxAscent = 46.5; halfLeading(48, 48) = -5.0390625
    expect(line.baselineY).toBeCloseTo(
      metrics.fontBoundingBoxAscent + getHalfLeading(font.ascender, font.descender, 48, 48),
      12
    )
    expect(line.baselineY).toBe(41.4609375)
  })

  it('zero leading at the font-native line height: baseline is exactly fontBoundingBoxAscent', () => {
    // lineSpacing (asc - desc) = 1.2099609375 → lineHeight 58.078125 equals
    // the content height, so halfLeading = 0 and
    // baseline = 0 + 0.96875*48 = 46.5 = fontBoundingBoxAscent.
    const fontSize = 48
    const lineSpacing = font.ascender - font.descender
    const lineHeight = lineSpacing * fontSize
    expect(lineHeight).toBe(58.078125)
    expect(getHalfLeading(font.ascender, font.descender, fontSize, lineHeight)).toBe(0)
    expect(getLineBaselineOffset(font.ascender, font.descender, fontSize, lineHeight)).toBe(46.5)

    const p = layoutParagraph('Hello', {
      typeface: font,
      fontSize,
      lineSpacing,
      maxWidth: 400,
    })
    const line = p.lines[0]!
    expect(line.y).toBe(0)
    expect(line.height).toBe(58.078125)
    expect(line.baselineY).toBe(46.5)
  })

  it("glyph ink top: 'H' sits halfLeading + (ascender - yMax) * fontSize below the line top (hand-computed)", () => {
    // Inter 'H': yMax = 1490/2048 = 0.7275390625
    // (asc - yMax)*fs = (1984 - 1490)/2048 * 48 = 11.578125
    // at lh == fs: halfLeading = -5.0390625 → top offset = 6.5390625
    const h = font.getGlyphMetricsForChar('H')!
    expect(h.bounds.yMax).toBe(1490 / 2048)
    expect(getGlyphTopOffset(font.ascender, font.descender, h.bounds.yMax, 48, 48)).toBe(6.5390625)

    const p = layoutParagraph('H', {
      typeface: font,
      fontSize: 48,
      lineSpacing: 1,
      maxWidth: 100,
    })
    // renderers derive ink top as baselineY - yMax * fontSize
    const line = p.lines[0]!
    expect(line.baselineY - h.bounds.yMax * 48).toBe(6.5390625)
  })

  it("a caret's y and height still bracket the glyph ink", () => {
    // 'H' at fs 48, lineSpacing 1: baseline 41.4609375 (above).
    // caret top    = baselineY - ascent  = 41.4609375 - 46.5       = -5.0390625
    // caret bottom = baselineY + descent = 41.4609375 + 11.578125  = 53.0390625
    // ink top      = baselineY - yMax*48 = 41.4609375 - 34.921875  = 6.5390625
    // ink bottom   = baselineY - yMin*48 = 41.4609375 - 0          = 41.4609375
    const h = font.getGlyphMetricsForChar('H')!
    const p = layoutParagraph('H', {
      typeface: font,
      fontSize: 48,
      lineSpacing: 1,
      maxWidth: 100,
    })
    const caret = locateCaret(p, 0)
    const caretTop = caret.baselineY - caret.ascent
    const caretBottom = caret.baselineY + caret.descent
    const inkTop = caret.baselineY - h.bounds.yMax * 48
    const inkBottom = caret.baselineY - h.bounds.yMin * 48
    expect(caretTop).toBe(-5.0390625) // negative half-leading: overflows the line box
    expect(caretBottom).toBe(53.0390625)
    expect(caretTop).toBeLessThanOrEqual(inkTop)
    expect(caretBottom).toBeGreaterThanOrEqual(inkBottom)
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
