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
import { getEmBoxTopOffset, getGlyphTopOffset, getLineBaselineOffset } from './baseline'
import { buildPositionedGlyphLayout } from './positioned'
import { getCaretTransformation } from '../query/index'
import type { SlugLayoutFont } from './types'

// R4 guard suite: the MSDF-baseline → Slug-ascender conversion, asserted
// against HAND-COMPUTED values for Inter-Regular.ttf. Inter's raw numbers
// (from its hhea/glyf tables): unitsPerEm 2048, ascender 1984,
// descender -494, 'H' ink box y ∈ [0, 1490]. If any assertion here moves
// by a constant, every line of rendered text has shifted vertically —
// fix `layout/baseline.ts`, nothing else.

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

describe('SlugFont satisfies the layout font contract', () => {
  it('is assignable to SlugLayoutFont', () => {
    const layoutFont: SlugLayoutFont = font
    expect(layoutFont.ascender).toBeGreaterThan(0)
    expect(layoutFont.descender).toBeLessThan(0)
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

  it("a single line's first-baseline offset matches fontBoundingBoxAscent", () => {
    const fontSize = 48
    const metrics = font.measureText('Hello', fontSize)
    const layout = buildPositionedGlyphLayout(
      { text: 'Hello', font, fontSize, lineHeight: '100%' },
      { availableWidth: 400, availableHeight: 100 }
    )
    const line = layout.lines[0]!
    // distance from the box top (y-up 50) down to the baseline
    expect(50 - line.baselineY).toBeCloseTo(metrics.fontBoundingBoxAscent, 12)
    expect(50 - line.baselineY).toBe(46.5)
  })

  it('line-box geometry at the default lineHeight (hand-computed)', () => {
    // default lineHeight = (asc - desc) * fontSize = 1.2099609375 * 48 = 58.078125
    // baseline offset = (lh - fs)/2 + asc*fs = 5.0390625 + 46.5 = 51.5390625
    const fontSize = 48
    const lineHeight = (font.ascender - font.descender) * fontSize
    expect(lineHeight).toBe(58.078125)
    expect(getEmBoxTopOffset(fontSize, lineHeight)).toBe(5.0390625)
    expect(getLineBaselineOffset(font.ascender, fontSize, lineHeight)).toBe(51.5390625)

    const layout = buildPositionedGlyphLayout(
      { text: 'Hello', font, fontSize },
      { availableWidth: 400, availableHeight: 200 }
    )
    const line = layout.lines[0]!
    expect(line.y).toBe(100)
    expect(line.y - line.baselineY).toBe(51.5390625)
  })

  it("glyph ink top: 'H' sits (ascender - yMax) * fontSize below the em-box top (hand-computed)", () => {
    // Inter 'H': yMax = 1490/2048 = 0.7275390625
    // top offset at lh == fs: (1984 - 1490)/2048 * 48 = 11.578125
    const h = font.getGlyphMetricsForChar('H')!
    expect(h.bounds.yMax).toBe(1490 / 2048)
    expect(getGlyphTopOffset(font.ascender, h.bounds.yMax, 48, 48)).toBe(11.578125)

    const layout = buildPositionedGlyphLayout(
      { text: 'H', font, fontSize: 48, lineHeight: '100%' },
      { availableWidth: 100, availableHeight: 100 }
    )
    const entry = layout.lines[0]!.entries[0]!
    expect(entry.type).toBe('glyph')
    expect((entry as { y: number }).y).toBe(50 - 11.578125)
  })

  it('multi-line spacing is exactly fontSize * lineHeight-multiplier', () => {
    const layout = buildPositionedGlyphLayout(
      { text: 'one\ntwo\nthree', font, fontSize: 48, lineHeight: '150%', whiteSpace: 'pre' },
      { availableWidth: 400, availableHeight: 300 }
    )
    expect(layout.lines).toHaveLength(3)
    const [l0, l1, l2] = layout.lines
    expect(l0!.baselineY - l1!.baselineY).toBe(48 * 1.5)
    expect(l1!.baselineY - l2!.baselineY).toBe(48 * 1.5)
    // and the same must hold for caret line placement (query path)
    const c0 = getCaretTransformation(layout, 0)!
    const c1 = getCaretTransformation(layout, 4)!
    expect(c0.position[1] - c1.position[1]).toBe(48 * 1.5)
  })

  it('whitespace has metrics — caret placement after a space works on a real font', () => {
    const space = font.getGlyphMetricsForChar(' ')!
    expect(space.hasOutline).toBe(false)
    expect(space.advanceWidth).toBe(576 / 2048) // hand-computed from hmtx

    const layout = buildPositionedGlyphLayout(
      { text: 'a b', font, fontSize: 48, lineHeight: '100%' },
      { availableWidth: 400, availableHeight: 100 }
    )
    const entries = layout.lines[0]!.entries
    expect(entries[1]!.type).toBe('whitespace')
    const caretAfterSpace = getCaretTransformation(layout, 2)
    expect(caretAfterSpace).toBeDefined()
    const a = entries[0]!
    expect(caretAfterSpace!.position[0]).toBeGreaterThan(a.penX)
  })
})
