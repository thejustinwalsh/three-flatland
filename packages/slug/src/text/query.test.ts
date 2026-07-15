import { describe, it, expect } from 'vitest'
import { paragraphYToWorldY } from '../layout/worldSpace'
import { layoutParagraph } from './layout'
import { hitTest, locateCaret, selectRange } from './query'
import { createStubTypeface } from './stubTypeface.fixture'
import type { SlugParagraph, SlugParagraphStyle } from './types'

// Stub typeface: 0.5 em advance → 5 units/char at fontSize 10,
// lineSpacing 1 → line box 10. All coordinates are paragraph space
// (D6: top-left origin, +y down) for inputs AND outputs — the old
// engine's input/output asymmetry is gone.
const typeface = createStubTypeface()

function paragraphOf(text: string, extra: Partial<SlugParagraphStyle> = {}): SlugParagraph {
  return layoutParagraph(text, {
    typeface,
    fontSize: 10,
    lineSpacing: 1,
    collapseSpaces: false,
    maxWidth: 40,
    ...extra,
  })
}

describe('hitTest', () => {
  it('flips trailing past the glyph midpoint (left half → false, right half → true)', () => {
    const p = paragraphOf('abcd')
    // chars occupy x [0,5) [5,10) [10,15) [15,20)
    expect(hitTest(p, 1, 5)).toMatchObject({ charIndex: 0, trailing: false })
    expect(hitTest(p, 4, 5)).toMatchObject({ charIndex: 0, trailing: true })
    expect(hitTest(p, 11, 5)).toMatchObject({ charIndex: 2, trailing: false })
    expect(hitTest(p, 14, 5)).toMatchObject({ charIndex: 2, trailing: true })
  })

  it('derives the caret index as charIndex + trailing', () => {
    const p = paragraphOf('abcd')
    const hit = hitTest(p, 4, 5) // right half of 'a'
    expect(hit.charIndex + (hit.trailing ? 1 : 0)).toBe(1)
  })

  it('resolves the line from y (D6: +y down)', () => {
    const p = paragraphOf('ab\ncd')
    expect(hitTest(p, 1, 5)).toMatchObject({ charIndex: 0, lineIndex: 0 })
    expect(hitTest(p, 1, 15)).toMatchObject({ charIndex: 3, lineIndex: 1 })
  })

  it('clamps: above the block → line 0, below → the last line (x still resolves)', () => {
    const p = paragraphOf('ab\ncd')
    expect(hitTest(p, 1, -5)).toMatchObject({ charIndex: 0, lineIndex: 0, trailing: false })
    // below the block the point clamps to the LAST LINE and x resolves
    // normally (editors place the caret under the pointer x) — the old
    // engine's unconditional past-the-end result is gone on purpose
    expect(hitTest(p, 1, 35)).toMatchObject({ charIndex: 3, lineIndex: 1, trailing: false })
    const belowRight = hitTest(p, 39, 35)
    expect(belowRight).toMatchObject({ charIndex: 4, lineIndex: 1, trailing: true })
    expect(belowRight.charIndex + 1).toBe(5) // caret clamps to text end
  })

  it('past the line end hits the last char with trailing set', () => {
    const p = paragraphOf('ab')
    expect(hitTest(p, 39, 5)).toMatchObject({ charIndex: 1, trailing: true })
  })

  it('an empty line reports its charStart with trailing false', () => {
    const p = paragraphOf('ab\n')
    expect(hitTest(p, 3, 15)).toMatchObject({ charIndex: 3, lineIndex: 1, trailing: false })
  })
})

describe('hitTest — the p241 trailing-spacing rule', () => {
  // tracking 0.4 em → +4 after each 5-wide glyph: 'a' pen [0,5), spacing
  // [5,9), 'b' pen [9,14).
  const tracked = () => paragraphOf('ab', { tracking: 0.4 })

  it('positive tracking spacing belongs to the trailing side of the glyph', () => {
    const p = tracked()
    expect(hitTest(p, 7, 5)).toMatchObject({ charIndex: 0, trailing: true })
    expect(hitTest(p, 8.9, 5)).toMatchObject({ charIndex: 0, trailing: true })
    expect(hitTest(p, 9.5, 5)).toMatchObject({ charIndex: 1, trailing: false })
  })

  it('the spacing does NOT move the midpoint between leading and trailing halves', () => {
    const p = tracked()
    // midpoint of 'a' stays at advance/2 = 2.5, not (advance+tracking)/2
    expect(hitTest(p, 2.4, 5)).toMatchObject({ charIndex: 0, trailing: false })
    expect(hitTest(p, 2.6, 5)).toMatchObject({ charIndex: 0, trailing: true })
  })

  it('positive kerning spacing behaves the same way', () => {
    const spread = createStubTypeface({ kerning: { 'a/b': 0.3 } }) // +3 at fontSize 10
    const p = layoutParagraph('ab', {
      typeface: spread,
      fontSize: 10,
      lineSpacing: 1,
      maxWidth: 40,
    })
    // 'a' [0,5), kern gap [5,8), 'b' [8,13)
    expect(hitTest(p, 6, 5)).toMatchObject({ charIndex: 0, trailing: true })
    expect(hitTest(p, 8.5, 5)).toMatchObject({ charIndex: 1, trailing: false })
  })

  it('a caret placed after the glyph sits BEFORE the empty spacing', () => {
    const p = tracked()
    expect(locateCaret(p, 1).x).toBeCloseTo(5, 12) // not 9
  })
})

describe('locateCaret', () => {
  it('places the caret at the char pen with the line metrics', () => {
    const p = paragraphOf('abcd')
    const caret = locateCaret(p, 2)
    expect(caret.x).toBeCloseTo(10, 12)
    expect(caret.baselineY).toBeCloseTo(8, 12)
    expect(caret.ascent).toBeCloseTo(8, 12)
    expect(caret.descent).toBeCloseTo(2, 12)
    expect(caret.lineIndex).toBe(0)
  })

  it('caret after a space lands at the next glyph — space entries make the lookup possible', () => {
    const p = paragraphOf('a b')
    expect(locateCaret(p, 2).x).toBeCloseTo(10, 12)
    // and the caret BEFORE the space sits at the space entry itself
    expect(locateCaret(p, 1).x).toBeCloseTo(5, 12)
  })

  it('caret past the text end clamps to the last entry edge', () => {
    const p = paragraphOf('ab')
    expect(locateCaret(p, 5).x).toBeCloseTo(10, 12)
  })

  it('after a trailing hard break the caret starts the empty line', () => {
    const p = paragraphOf('ab\n')
    const caret = locateCaret(p, 3)
    expect(caret.lineIndex).toBe(1)
    expect(caret.x).toBe(0)
  })

  it('D6: baselineY grows downward as lineIndex grows', () => {
    const p = paragraphOf('ab\ncd')
    const caretLine0 = locateCaret(p, 0)
    const caretLine1 = locateCaret(p, 3)
    expect(caretLine0.baselineY).toBeCloseTo(8, 12)
    expect(caretLine1.baselineY - caretLine0.baselineY).toBe(10)
    expect(caretLine1.lineIndex).toBeGreaterThan(caretLine0.lineIndex)
    // and the world-space conversion is the single flip
    expect(paragraphYToWorldY(caretLine1.baselineY)).toBe(-caretLine1.baselineY)
  })

  it('empty text yields a caret at the line origin', () => {
    const p = paragraphOf('')
    expect(locateCaret(p, 0)).toMatchObject({ x: 0, lineIndex: 0 })
  })
})

describe('selectRange', () => {
  it('a collapsed range yields no spans', () => {
    const p = paragraphOf('abcd')
    expect(selectRange(p, 2, 2)).toHaveLength(0)
  })

  it('single-line range spans the selected cells', () => {
    const p = paragraphOf('abcd')
    const spans = selectRange(p, 1, 3)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ lineIndex: 0, x0: 5, x1: 15 })
    expect(spans[0]!.baselineY).toBeCloseTo(8, 12)
    expect(spans[0]!.ascent + spans[0]!.descent).toBeCloseTo(10, 12)
  })

  it('multi-line range emits one span per line, middle lines fully covered', () => {
    const p = paragraphOf('ab\ncd\nef')
    const spans = selectRange(p, 1, 7)
    expect(spans).toHaveLength(3)
    expect(spans[1]).toMatchObject({ lineIndex: 1, x0: 0, x1: 10 })
    expect(spans[2]!.baselineY - spans[1]!.baselineY).toBe(10)
  })

  it('x1 sits before trailing tracking spacing (p241)', () => {
    const p = paragraphOf('ab', { tracking: 0.4 })
    const spans = selectRange(p, 0, 1)
    expect(spans[0]!.x1).toBeCloseTo(5, 12)
  })

  it('out-of-range inputs clamp to the text', () => {
    const p = paragraphOf('ab')
    const spans = selectRange(p, -3, 99)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ x0: 0, x1: 10 })
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

  it('locateCaret(hitTest(p).charIndex + trailing) lands within one advance of the point', () => {
    for (let run = 0; run < 50; run++) {
      const length = 1 + Math.floor(rand() * 24)
      let text = ''
      for (let i = 0; i < length; i++) {
        text += alphabet[Math.floor(rand() * alphabet.length)]
      }
      const alignment = (['left', 'center', 'right'] as const)[Math.floor(rand() * 3)]!
      const maxWidth = 20 + rand() * 60
      const p = layoutParagraph(text, {
        typeface,
        fontSize: 10,
        lineSpacing: 1,
        collapseSpaces: false,
        maxWidth,
        alignment,
      })
      const maxAdvance = 6 // stub advances: 5, missing-glyph 6

      for (const entry of p.characters) {
        if (entry.advance === 0) continue
        const line = p.lines[entry.lineIndex]!
        // sample a point inside this entry's cell
        const px = entry.x + rand() * entry.advance
        const py = line.y + rand() * line.height
        const hit = hitTest(p, px, py)
        expect(hit.lineIndex).toBe(entry.lineIndex)
        const caretIndex = hit.charIndex + (hit.trailing ? 1 : 0)
        const caret = locateCaret(p, caretIndex)
        if (caret.lineIndex === entry.lineIndex) {
          expect(Math.abs(caret.x - px)).toBeLessThanOrEqual(maxAdvance + 0.001)
        } else {
          // the caret rolled over only because the hit was the line's very
          // last cell — its index starts the next line
          expect(caretIndex).toBe(line.charEnd)
          expect(caret.lineIndex).toBe(entry.lineIndex + 1)
        }
      }
    }
  })
})
