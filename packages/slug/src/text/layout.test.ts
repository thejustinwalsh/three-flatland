import { describe, it, expect } from 'vitest'
import { layoutParagraph, measureParagraph } from './layout'
import { createStubTypeface } from './stubTypeface.fixture'
import type { SlugParagraphStyle } from './types'

// Stub typeface: 0.5 em advance per lowercase char and space, asc 0.8,
// desc -0.2. fontSize 10, lineSpacing 1 → char cell 5 wide, line box 10
// tall. Hand-computed expectations throughout; coordinates are paragraph
// space (D6: top-left origin, +y down).
const typeface = createStubTypeface()

function style(extra: Partial<SlugParagraphStyle> = {}): SlugParagraphStyle {
  return {
    typeface,
    fontSize: 10,
    lineSpacing: 1,
    collapseSpaces: false, // ≙ the old engine's whiteSpace: 'pre' baseline
    ...extra,
  }
}

describe('measureParagraph', () => {
  it('unconstrained single line: width = sum of advances, one line of height', () => {
    const m = measureParagraph('abc', style())
    expect(m.width).toBe(15)
    expect(m.height).toBe(10)
  })

  it('wraps under maxWidth and reports the widest line', () => {
    const m = measureParagraph('aa bb cc', style({ maxWidth: 14 }))
    expect(m.width).toBe(10)
    expect(m.height).toBe(30) // 3 lines
  })

  it('a trailing newline adds a line', () => {
    const m = measureParagraph('ab\n', style())
    expect(m.height).toBe(20)
  })

  it('empty text still reserves one line of height', () => {
    const m = measureParagraph('', style())
    expect(m.width).toBe(0)
    expect(m.height).toBe(10)
  })

  it('height = lineCount * lineSpacing * fontSize', () => {
    const m = measureParagraph('a\nb\nc', style({ lineSpacing: 1.5 }))
    expect(m.height).toBe(3 * 15)
  })

  it('defaults lineSpacing to 1.2', () => {
    const m = measureParagraph('a', { typeface, fontSize: 10 })
    expect(m.height).toBe(12)
  })

  it('collapses whitespace before measuring (collapse + folded newlines)', () => {
    const m = measureParagraph('a \n b', {
      typeface,
      fontSize: 10,
      lineSpacing: 1,
      collapseSpaces: true,
      preserveNewlines: false,
    })
    expect(m.height).toBe(10) // one line
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
        for (const maxWidth of [80, 95.3, 120.21, 200]) {
          const s = style({ fontSize: 13.7, maxWidth })
          const first = measureParagraph(text, s)
          const ceiled = Math.ceil(first.width * pointScaleFactor) / pointScaleFactor
          const second = measureParagraph(text, { ...s, maxWidth: ceiled })
          expect(second.width).toBe(first.width)
          expect(second.height).toBe(first.height)
        }
      })
    }
  })
})

describe('layoutParagraph — lines', () => {
  it('line char ranges tile the source text exactly', () => {
    const p = layoutParagraph('aa bb cc', style({ maxWidth: 14 }))
    expect(p.lines).toHaveLength(3)
    let cursor = 0
    for (const line of p.lines) {
      expect(line.charStart).toBe(cursor)
      cursor = line.charEnd
    }
    expect(cursor).toBe(8)
  })

  it('empty text produces a single empty line', () => {
    const p = layoutParagraph('', style())
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]).toMatchObject({ charStart: 0, charEnd: 0, width: 0 })
    expect(p.characters).toHaveLength(0)
  })

  it('trailing newline appends an empty line at text end', () => {
    const p = layoutParagraph('ab\n', style())
    expect(p.lines).toHaveLength(2)
    expect(p.lines[1]).toMatchObject({ charStart: 3, charEnd: 3 })
  })

  it('defaults the paragraph width to the widest line without maxWidth', () => {
    const p = layoutParagraph('aa\nb', style())
    expect(p.width).toBe(10)
    expect(p.height).toBe(20)
  })

  it('keeps an explicit maxWidth as the paragraph width', () => {
    const p = layoutParagraph('ab', style({ maxWidth: 100 }))
    expect(p.width).toBe(100)
  })
})

describe('layoutParagraph — characters', () => {
  it('positions glyph pens left-to-right (hand-computed)', () => {
    const p = layoutParagraph('ab', style({ maxWidth: 20 }))
    expect(p.characters[0]).toMatchObject({ charIndex: 0, x: 0, advance: 5, lineIndex: 0 })
    expect(p.characters[1]).toMatchObject({ charIndex: 1, x: 5, advance: 5 })
  })

  it('characters[i].charIndex === i for every source char', () => {
    const p = layoutParagraph('ab \ncd', style())
    expect(p.characters).toHaveLength(6)
    p.characters.forEach((c, i) => expect(c.charIndex).toBe(i))
  })

  it('emits whitespace entries — caret after a space is possible', () => {
    const p = layoutParagraph('a b', style())
    expect(p.characters).toHaveLength(3)
    expect(p.characters[1]).toMatchObject({ charIndex: 1, advance: 5, hasOutline: false })
  })

  it('emits one entry per char including trailing whitespace and \\n', () => {
    const p = layoutParagraph('ab \ncd', style())
    const line0 = p.lines[0]!
    expect(line0.charEnd - line0.charStart).toBe(4)
    expect(p.characters.filter((c) => c.lineIndex === 0)).toHaveLength(4)
    expect(p.characters.filter((c) => c.lineIndex === 1)).toHaveLength(2)
  })

  it('the baseline sits ascender*fontSize below the line top at lineSpacing 1', () => {
    const p = layoutParagraph('a', style({ maxWidth: 20 }))
    const line = p.lines[0]!
    expect(line.y).toBe(0)
    expect(line.baselineY).toBeCloseTo(8, 12)
    expect(line.ascent).toBeCloseTo(8, 12)
    expect(line.descent).toBeCloseTo(2, 12)
  })

  it('alignment center/right shifts lines by the free width (hand-computed)', () => {
    const centered = layoutParagraph('ab', style({ maxWidth: 20, alignment: 'center' }))
    expect(centered.characters[0]!.x).toBe(5)
    expect(centered.lines[0]!.x).toBe(5)
    const right = layoutParagraph('ab', style({ maxWidth: 20, alignment: 'right' }))
    expect(right.characters[0]!.x).toBe(10)
  })

  it('justify distributes the free width across visible spaces on wrapped lines', () => {
    // 'a b dd' at width 18 wraps after the space: line 0 'a b ' has
    // visible width 15 and one space → +3 on the space. The last line is
    // NOT justified (§2.11).
    const p = layoutParagraph('a b dd', style({ maxWidth: 18, justify: true }))
    expect(p.lines).toHaveLength(2)
    const [a, space, b] = p.characters
    expect(a).toMatchObject({ x: 0 })
    expect(space).toMatchObject({ x: 5, hasOutline: false })
    expect(b).toMatchObject({ x: 13 }) // 5 + 5 (advance) + 3 (justify)
    const d = p.characters[4]!
    expect(d.x).toBe(0) // last line falls back to left alignment
  })

  it('applies kerning between glyph pairs at positioning time, not wrapping', () => {
    const kerned = createStubTypeface({ kerning: { 'a/b': -0.1 } })
    const p = layoutParagraph('ab', { ...style({ maxWidth: 20 }), typeface: kerned })
    expect(p.characters[1]!.x).toBeCloseTo(5 - 1, 12)
    // widths ignore kerning (upstream parity)
    expect(p.lines[0]!.width).toBe(10)
  })

  it('consecutive baselines are exactly lineSpacing*fontSize apart and grow downward (D6)', () => {
    const p = layoutParagraph('a\nb\nc', style({ lineSpacing: 1.5 }))
    const [l0, l1, l2] = p.lines
    expect(l1!.baselineY - l0!.baselineY).toBe(15)
    expect(l2!.baselineY - l1!.baselineY).toBe(15)
  })
})

describe('wrap modes', () => {
  it("'word' breaks at spaces when a word would overflow", () => {
    const p = layoutParagraph('aa bb cc', style({ maxWidth: 14 }))
    expect(p.lines.map((l) => l.charStart)).toEqual([0, 3, 6])
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([3, 3, 2])
    expect(p.lines.map((l) => l.width)).toEqual([10, 10, 10])
  })

  it("'word' lets a word longer than maxWidth overflow instead of splitting it", () => {
    const p = layoutParagraph('aaaa bb', style({ maxWidth: 12 }))
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([5, 2])
    expect(p.lines[0]!.width).toBe(20) // overflows 12
  })

  it("'word' honors explicit newlines, including the \\n in the line's range", () => {
    const p = layoutParagraph('a\nb', style())
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([2, 1])
    expect(p.lines[0]!.width).toBe(5)
  })

  it('keeps trailing spaces in the line range but not in its width', () => {
    const p = layoutParagraph('ab  ', style())
    const line = p.lines[0]!
    expect(line.charEnd).toBe(4)
    expect(line.width).toBe(10)
  })

  it('tracking widens advances and changes break points', () => {
    // tracking 0.2 em → 7 per char; 'aa bb' at width 14: 'aa' = 14, fits exactly
    const p = layoutParagraph('aa bb', style({ maxWidth: 14, tracking: 0.2 }))
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([3, 2])
    expect(p.lines[0]!.width).toBe(14)
  })

  it("'anywhere' breaks mid-word at the width limit", () => {
    const p = layoutParagraph('aaaa', style({ maxWidth: 12, wrap: 'anywhere' }))
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([2, 2])
    expect(p.lines.map((l) => l.width)).toEqual([10, 10])
  })

  it("'anywhere' never emits a zero-glyph line even when one char exceeds the width", () => {
    const p = layoutParagraph('aaa', style({ maxWidth: 3, wrap: 'anywhere' }))
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([1, 1, 1])
  })

  it("'anywhere' honors explicit newlines", () => {
    const p = layoutParagraph('ab\ncd', style({ wrap: 'anywhere' }))
    expect(p.lines.map((l) => l.charStart)).toEqual([0, 3])
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([3, 2])
  })

  it("'anywhere' keeps interior whitespace with the line at an overflow break", () => {
    const p = layoutParagraph('aa  bb', style({ maxWidth: 12, wrap: 'anywhere' }))
    // 'aa␣␣' stays on line 0 (spaces never start a line), 'bb' wraps
    expect(p.lines.map((l) => l.charStart)).toEqual([0, 4])
  })

  it("'none' ignores maxWidth entirely", () => {
    const p = layoutParagraph('aaaa bb', style({ maxWidth: 10, wrap: 'none' }))
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]!.width).toBe(35)
  })

  it("'none' still breaks at explicit newlines", () => {
    const p = layoutParagraph('aa\nbb', style({ maxWidth: 5, wrap: 'none' }))
    expect(p.lines.map((l) => l.charEnd - l.charStart)).toEqual([3, 2])
  })
})

describe('unmapped chars', () => {
  it('fall back to a 0.6 em advance with glyphId -1 (MISSING_GLYPH parity)', () => {
    const p = layoutParagraph('aZ', style()) // 'Z' unmapped in stub
    expect(p.lines[0]!.width).toBeCloseTo(5 + 6, 12)
    expect(p.characters[1]).toMatchObject({ glyphId: -1, hasOutline: false })
  })
})
