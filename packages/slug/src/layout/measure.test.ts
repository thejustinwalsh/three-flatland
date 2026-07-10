import { describe, it, expect } from 'vitest'
import { buildGlyphLayout, measureGlyphLayout } from './measure'
import { createStubFont } from './stubFont.fixture'
import type { SlugGlyphLayoutProperties } from './types'

const font = createStubFont()

function props(text: string, extra: Partial<SlugGlyphLayoutProperties> = {}) {
  return {
    text,
    font,
    fontSize: 10,
    lineHeight: '100%',
    whiteSpace: 'pre',
    ...extra,
  } as SlugGlyphLayoutProperties
}

describe('measureGlyphLayout', () => {
  it('unconstrained single line: width = sum of advances, one line', () => {
    const m = measureGlyphLayout(props('abc'))
    expect(m.width).toBe(15)
    expect(m.lineCount).toBe(1)
    expect(m.height).toBe(10)
  })

  it('wraps under availableWidth and reports the widest line', () => {
    const m = measureGlyphLayout(props('aa bb cc'), 14)
    expect(m.lineCount).toBe(3)
    expect(m.width).toBe(10)
    expect(m.height).toBe(30)
  })

  it('a trailing newline adds a line', () => {
    const m = measureGlyphLayout(props('ab\n'))
    expect(m.lineCount).toBe(2)
    expect(m.height).toBe(20)
  })

  it('empty text still reserves one line of height', () => {
    const m = measureGlyphLayout(props(''))
    expect(m.width).toBe(0)
    expect(m.lineCount).toBe(1)
    expect(m.height).toBe(10)
  })

  it('height = lineCount * lineHeight for percentage lineHeight', () => {
    const m = measureGlyphLayout(props('a\nb\nc', { lineHeight: '150%' }))
    expect(m.lineCount).toBe(3)
    expect(m.height).toBe(3 * 15)
  })

  it('normalizes whitespace before measuring (normal mode collapses newlines)', () => {
    const m = measureGlyphLayout({ text: 'a \n b', font, fontSize: 10, whiteSpace: 'normal' })
    expect(m.lineCount).toBe(1)
    expect(m.width).toBe(15) // 'a b'
  })

  describe('is stable under the yoga ceil-by-PointScaleFactor contract', () => {
    // uikit's flex/node.ts ceils measured sizes to 1/PointScaleFactor before
    // feeding them back as the available size — re-measuring at the ceiled
    // width must not change the wrap.
    const text = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do'
    for (const pointScaleFactor of [1, 2]) {
      it(`at ${pointScaleFactor}x`, () => {
        // widths ≥ the widest word (75.35) so no overflow-line special case
        for (const availableWidth of [80, 95.3, 120.21, 200]) {
          const p = props(text, { fontSize: 13.7 })
          const first = measureGlyphLayout(p, availableWidth)
          const ceiled = Math.ceil(first.width * pointScaleFactor) / pointScaleFactor
          const second = measureGlyphLayout(p, ceiled)
          expect(second.lineCount).toBe(first.lineCount)
          expect(second.width).toBe(first.width)
        }
      })
    }
  })
})

describe('buildGlyphLayout', () => {
  it('line offsets/lengths tile the normalized text exactly', () => {
    const layout = buildGlyphLayout(props('aa bb cc'), 14)
    expect(layout.lines).toHaveLength(3)
    let cursor = 0
    for (const line of layout.lines) {
      expect(line.charIndexOffset).toBe(cursor)
      cursor += line.charLength
    }
    expect(cursor).toBe(layout.text.length)
  })

  it('empty text produces a single empty line', () => {
    const layout = buildGlyphLayout(props(''))
    expect(layout.lines).toHaveLength(1)
    expect(layout.lines[0]).toEqual({
      charLength: 0,
      nonWhitespaceWidth: 0,
      whitespacesBetween: 0,
      charIndexOffset: 0,
      nonWhitespaceCharLength: 0,
    })
  })

  it('trailing newline appends an empty line at text end', () => {
    const layout = buildGlyphLayout(props('ab\n'))
    expect(layout.lines).toHaveLength(2)
    expect(layout.lines[1]!.charIndexOffset).toBe(3)
    expect(layout.lines[1]!.charLength).toBe(0)
  })

  it('defaults availableWidth to the widest line and availableHeight to the block height', () => {
    const layout = buildGlyphLayout(props('aa\nb'))
    expect(layout.availableWidth).toBe(10)
    expect(layout.availableHeight).toBe(20)
  })

  it('keeps explicit available sizes', () => {
    const layout = buildGlyphLayout(props('ab'), 100, 50)
    expect(layout.availableWidth).toBe(100)
    expect(layout.availableHeight).toBe(50)
  })

  it('carries the resolved properties (normalized text, absolute lineHeight)', () => {
    const layout = buildGlyphLayout({
      text: 'a\tb',
      font,
      fontSize: 10,
      lineHeight: '120%',
      whiteSpace: 'normal',
    })
    expect(layout.text).toBe('a b')
    expect(layout.lineHeight).toBe(12)
    expect(layout.fontSize).toBe(10)
  })
})
