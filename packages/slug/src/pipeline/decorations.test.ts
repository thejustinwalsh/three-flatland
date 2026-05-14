import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { parseFont } from './fontParser'
import { shapeText } from './textShaper'
import { emitDecorations } from './decorations'
import type { SlugGlyphData } from '../types'

const FONT_PATH = resolve(
  __dirname,
  '../../../../examples/three/slug-text/public/Inter-Regular.ttf'
)
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

let glyphs: Map<number, SlugGlyphData>
let font: opentype.Font
let advances: Map<number, number>
let metrics: {
  underlinePosition: number
  underlineThickness: number
  strikethroughPosition: number
  strikethroughThickness: number
}

beforeAll(() => {
  const parsed = parseFont(arrayBuffer)
  glyphs = parsed.glyphs
  font = opentype.parse(arrayBuffer)
  advances = new Map()
  for (const [id, g] of glyphs) advances.set(id, g.advanceWidth)
  metrics = {
    underlinePosition: parsed.underlinePosition,
    underlineThickness: parsed.underlineThickness,
    strikethroughPosition: parsed.strikethroughPosition,
    strikethroughThickness: parsed.strikethroughThickness,
  }
})

describe('emitDecorations', () => {
  it('returns empty when no spans are passed', () => {
    const positioned = shapeText(font, 'Hello', 48)
    expect(emitDecorations('Hello', positioned, [], 48, metrics, advances)).toEqual([])
  })

  it('returns empty when no positioned glyphs', () => {
    expect(
      emitDecorations('', [], [{ start: 0, end: 1, underline: true }], 48, metrics, advances)
    ).toEqual([])
  })

  it('emits one underline rect for a single styled run on one line', () => {
    const positioned = shapeText(font, 'Hello', 48)
    const rects = emitDecorations(
      'Hello',
      positioned,
      [{ start: 0, end: 5, underline: true }],
      48,
      metrics,
      advances
    )
    expect(rects).toHaveLength(1)
    const r = rects[0]!
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeCloseTo(metrics.underlineThickness * 48, 3)
    // Underline position is below baseline (negative em); rect center = pos + thickness/2 → still negative.
    expect(r.y).toBeLessThan(0)
  })

  it('emits one strike rect with correct vertical placement', () => {
    const positioned = shapeText(font, 'Hello', 48)
    const rects = emitDecorations(
      'Hello',
      positioned,
      [{ start: 0, end: 5, strike: true }],
      48,
      metrics,
      advances
    )
    expect(rects).toHaveLength(1)
    expect(rects[0]!.height).toBeCloseTo(metrics.strikethroughThickness * 48, 3)
    expect(rects[0]!.y).toBeGreaterThan(0)
  })

  it('emits separate rects for non-contiguous spans', () => {
    const positioned = shapeText(font, 'Foo bar baz', 48)
    const rects = emitDecorations(
      'Foo bar baz',
      positioned,
      [
        { start: 0, end: 3, underline: true },
        { start: 8, end: 11, underline: true },
      ],
      48,
      metrics,
      advances
    )
    expect(rects).toHaveLength(2)
    // Rects must be ordered left-to-right by x.
    expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x)
  })

  it('combines underline and strike on the same span as two separate rects', () => {
    const positioned = shapeText(font, 'X', 48)
    const rects = emitDecorations(
      'X',
      positioned,
      [{ start: 0, end: 1, underline: true, strike: true }],
      48,
      metrics,
      advances
    )
    expect(rects).toHaveLength(2)
  })

  it('emits one rect per line for a run that wraps', () => {
    const positioned = shapeText(font, 'Lorem ipsum dolor sit amet', 48, { maxWidth: 200 })
    // Get how many lines were produced
    const lineYs = new Set(positioned.map((p) => p.y))
    expect(lineYs.size).toBeGreaterThan(1)
    const rects = emitDecorations(
      'Lorem ipsum dolor sit amet',
      positioned,
      [{ start: 0, end: 26, underline: true }],
      48,
      metrics,
      advances
    )
    // One rect per line containing styled glyphs.
    expect(rects.length).toBe(lineYs.size)
  })
})
