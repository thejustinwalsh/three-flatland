import { describe, it, expect } from 'vitest'
import { buildPositionedGlyphLayout } from '../layout/positioned'
import { createStubFont } from '../layout/stubFont.fixture'
import type { PositionedGlyphLayout, SlugGlyphLayoutProperties } from '../layout/types'
import { getCaretTransformation, getCharIndex, getSelectionTransformations } from './index'

// Stub font: 0.5 em advance → 5 units/char at fontSize 10, lineHeight 10.
const font = createStubFont()

function layoutOf(
  text: string,
  extra: Partial<SlugGlyphLayoutProperties> = {},
  options: Parameters<typeof buildPositionedGlyphLayout>[1] = {}
): PositionedGlyphLayout {
  return buildPositionedGlyphLayout(
    {
      text,
      font,
      fontSize: 10,
      lineHeight: '100%',
      whiteSpace: 'pre',
      ...extra,
    },
    { availableWidth: 40, availableHeight: 20, ...options }
  )
}

// getCharIndex takes x from the LEFT edge and y ≤ 0 downward from the TOP
// edge; caret/selection outputs are center-origin y-up. These helpers
// convert between the two.
function toPointerX(layout: PositionedGlyphLayout, centeredX: number): number {
  return centeredX + layout.availableWidth / 2
}
function toPointerY(layout: PositionedGlyphLayout, centeredY: number): number {
  return centeredY - layout.availableHeight / 2
}

describe('getCharIndex', () => {
  it("'between' snaps to the nearest boundary (left half → this char, right half → next)", () => {
    const layout = layoutOf('abcd')
    // chars occupy pointer-x [0,5) [5,10) [10,15) [15,20)
    expect(getCharIndex(layout, 1, -5, 'between')).toBe(0)
    expect(getCharIndex(layout, 4, -5, 'between')).toBe(1) // right half of 'a'
    expect(getCharIndex(layout, 11, -5, 'between')).toBe(2)
    expect(getCharIndex(layout, 14, -5, 'between')).toBe(3)
  })

  it("'on' returns the char whose cell contains the point", () => {
    const layout = layoutOf('abcd')
    expect(getCharIndex(layout, 4, -5, 'on')).toBe(0)
    expect(getCharIndex(layout, 11, -5, 'on')).toBe(2)
  })

  it('resolves the line from y', () => {
    const layout = layoutOf('ab\ncd')
    expect(getCharIndex(layout, 1, -5, 'on')).toBe(0)
    expect(getCharIndex(layout, 1, -15, 'on')).toBe(3) // second line starts at charIndex 3
  })

  it('clamps: above the block → 0, below → past the last char', () => {
    const layout = layoutOf('ab\ncd')
    expect(getCharIndex(layout, 1, 5, 'on')).toBe(0)
    expect(getCharIndex(layout, 1, -35, 'on')).toBe(3 + 2 + 1)
  })

  it('past the line end returns charIndexOffset + charLength + 1', () => {
    const layout = layoutOf('ab')
    expect(getCharIndex(layout, 39, -5, 'on')).toBe(3)
  })

  it('undefined layout returns 0', () => {
    expect(getCharIndex(undefined, 3, -3, 'on')).toBe(0)
  })
})

describe('getCaretTransformation', () => {
  it('places the caret at the char cell start with height == fontSize', () => {
    const layout = layoutOf('abcd')
    const caret = getCaretTransformation(layout, 2)!
    expect(caret.height).toBe(10)
    expect(caret.position[0]).toBeCloseTo(-20 + 10 + 0.5, 12) // pen -10, ink left +0.5
  })

  it('caret after a space lands at the next glyph — space entries make the lookup possible', () => {
    const layout = layoutOf('a b')
    const caret = getCaretTransformation(layout, 2)!
    // entry 2 is 'b': pen -10, ink left -9.5
    expect(caret.position[0]).toBeCloseTo(-9.5, 12)
    // and the caret BEFORE the space sits at the space entry itself
    const caretAtSpace = getCaretTransformation(layout, 1)!
    expect(caretAtSpace.position[0]).toBeCloseTo(-15, 12)
  })

  it('caret at text end clamps to the last entry edge', () => {
    const layout = layoutOf('ab')
    const caret = getCaretTransformation(layout, 5)!
    // last glyph ink: pen -15, x -14.5, width 4 → right edge -10.5
    expect(caret.position[0]).toBeCloseTo(-10.5, 12)
  })

  it('vertically centers the caret in the em box of the right line', () => {
    const layout = layoutOf('ab\ncd')
    const caretLine0 = getCaretTransformation(layout, 0)!
    const caretLine1 = getCaretTransformation(layout, 3)!
    expect(caretLine0.position[1]).toBeCloseTo(10 - 5, 12) // top line, em box top 10
    expect(caretLine0.position[1] - caretLine1.position[1]).toBe(10)
  })

  it('returns undefined for undefined layout', () => {
    expect(getCaretTransformation(undefined, 0)).toBeUndefined()
  })
})

describe('getSelectionTransformations', () => {
  it('collapsed range degenerates to a caret', () => {
    const layout = layoutOf('abcd')
    const { caret, selections } = getSelectionTransformations(layout, [2, 2])
    expect(caret).toBeDefined()
    expect(selections).toHaveLength(0)
  })

  it('single-line range spans the selected cells', () => {
    const layout = layoutOf('abcd')
    const { caret, selections } = getSelectionTransformations(layout, [1, 3])
    expect(caret).toBeUndefined()
    expect(selections).toHaveLength(1)
    const [sel] = selections
    // ink from 'b' start (-14.5) to 'c' ink end (-5.5): width 9
    expect(sel!.size[0]).toBeCloseTo(9, 12)
    expect(sel!.size[1]).toBe(10)
    expect(sel!.position[0]).toBeCloseTo((-14.5 + -5.5) / 2, 12)
  })

  it('multi-line range emits one rect per line', () => {
    const layout = layoutOf('ab\ncd\nef')
    const { selections } = getSelectionTransformations(layout, [1, 7])
    expect(selections).toHaveLength(3)
    // middle line is fully covered
    expect(selections[1]!.size[1]).toBe(10)
  })

  it('empty/undefined inputs produce no selections', () => {
    expect(getSelectionTransformations(undefined, [0, 2]).selections).toHaveLength(0)
    expect(getSelectionTransformations(layoutOf('ab'), undefined).selections).toHaveLength(0)
  })
})

describe('caret/hit-test round trip (randomized layouts)', () => {
  // seeded LCG so failures reproduce
  let seed = 0xdecafbad
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const alphabet = 'ab cd\nefg '

  it("getCaretTransformation(getCharIndex(p, 'between')) lands within one advance of p", () => {
    for (let run = 0; run < 50; run++) {
      const length = 1 + Math.floor(rand() * 24)
      let text = ''
      for (let i = 0; i < length; i++) {
        text += alphabet[Math.floor(rand() * alphabet.length)]
      }
      const textAlign = (['left', 'center', 'right'] as const)[Math.floor(rand() * 3)]!
      const availableWidth = 20 + rand() * 60
      const layout = buildPositionedGlyphLayout(
        { text, font, fontSize: 10, lineHeight: '100%', whiteSpace: 'pre' },
        { availableWidth, availableHeight: 80, textAlign }
      )
      const maxAdvance = 6 // stub advances: 5, missing-glyph 6

      for (const line of layout.lines) {
        for (const entry of line.entries) {
          // trailing-whitespace cells route past the line end (upstream's
          // `charLength + 1` clamp) — sample the non-whitespace region only
          if (entry.charIndex >= line.charIndexOffset + line.nonWhitespaceCharLength) continue
          // sample a point inside this entry's cell
          const px = entry.x + rand() * Math.max(entry.width, 0.001)
          const py = line.y - rand() * 10
          const charIndex = getCharIndex(
            layout,
            toPointerX(layout, px),
            toPointerY(layout, py),
            'between'
          )
          const caret = getCaretTransformation(layout, charIndex)
          expect(caret).toBeDefined()
          expect(Math.abs(caret!.position[0] - px)).toBeLessThanOrEqual(maxAdvance + 0.001)
          // caret must land on the line that was clicked
          const caretTopY = caret!.position[1] + caret!.height / 2
          expect(Math.abs(caretTopY - line.y)).toBeLessThanOrEqual(0.001)
        }
      }
    }
  })
})
