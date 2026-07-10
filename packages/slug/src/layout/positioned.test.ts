import { describe, it, expect } from 'vitest'
import { buildPositionedGlyphLayout } from './positioned'
import { createStubFont } from './stubFont.fixture'
import type { SlugGlyphLayoutProperties } from './types'

// Stub font: 0.5 em advance, ink [0.05, adv-0.05]×[0, 0.7], asc 0.8, desc -0.2.
// fontSize 10, lineHeight '100%' → char cell 5 wide, line box 10 tall.
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

describe('buildPositionedGlyphLayout', () => {
  it('positions glyphs left-to-right with pen and ink x (hand-computed)', () => {
    const layout = buildPositionedGlyphLayout(props('ab'), {
      availableWidth: 20,
      availableHeight: 20,
    })
    const [a, b] = layout.lines[0]!.entries
    expect(a).toMatchObject({
      type: 'glyph',
      char: 'a',
      charIndex: 0,
      penX: -10,
      x: -9.5,
      width: 4,
    })
    expect(b).toMatchObject({ type: 'glyph', char: 'b', charIndex: 1, penX: -5, x: -4.5 })
  })

  it('emits whitespace entries — caret after a space is possible', () => {
    const layout = buildPositionedGlyphLayout(props('a b'))
    const entries = layout.lines[0]!.entries
    expect(entries).toHaveLength(3)
    expect(entries[1]).toMatchObject({ type: 'whitespace', charIndex: 1, width: 5 })
  })

  it('emits one entry per char including trailing whitespace and \\n', () => {
    const layout = buildPositionedGlyphLayout(props('ab \ncd'))
    expect(layout.lines[0]!.entries).toHaveLength(layout.lines[0]!.charLength)
    expect(layout.lines[1]!.entries).toHaveLength(2)
  })

  it('computes glyph ink top y from bounds.yMax (hand-computed)', () => {
    // top-aligned, availH 20: line top (y-up) = 10; ink top offset =
    // (lh-fs)/2 + (asc - yMax)*fs = 0 + (0.8-0.7)*10 = 1 → y = 9
    const layout = buildPositionedGlyphLayout(props('a'), {
      availableWidth: 20,
      availableHeight: 20,
    })
    const [a] = layout.lines[0]!.entries
    expect(a!.type).toBe('glyph')
    expect((a as { y: number }).y).toBeCloseTo(9, 12)
  })

  it('line baselineY sits ascender*fontSize below the line top for 100% lineHeight', () => {
    const layout = buildPositionedGlyphLayout(props('a'), {
      availableWidth: 20,
      availableHeight: 20,
    })
    const line = layout.lines[0]!
    expect(line.y).toBe(10)
    expect(line.baselineY).toBeCloseTo(10 - 8, 12)
  })

  it('textAlign center/right shift lines by the free width (hand-computed)', () => {
    const centered = buildPositionedGlyphLayout(props('ab'), {
      availableWidth: 20,
      textAlign: 'center',
    })
    expect(centered.lines[0]!.entries[0]).toMatchObject({ penX: -5 })
    const right = buildPositionedGlyphLayout(props('ab'), {
      availableWidth: 20,
      textAlign: 'right',
    })
    expect(right.lines[0]!.entries[0]).toMatchObject({ penX: 0 })
  })

  it('justify distributes the free width across whitespacesBetween', () => {
    // 'a b': nonWhitespaceWidth 15, 1 whitespace, width 20 → +5 on the space
    const layout = buildPositionedGlyphLayout(props('a b'), {
      availableWidth: 20,
      textAlign: 'justify',
    })
    const [a, space, b] = layout.lines[0]!.entries
    expect(a).toMatchObject({ penX: -10 })
    expect(space).toMatchObject({ type: 'whitespace', penX: -5 })
    expect(b).toMatchObject({ penX: 5 }) // -5 + 5 (advance) + 5 (justify)
  })

  it('verticalAlign center and bottom shift the block (hand-computed)', () => {
    const center = buildPositionedGlyphLayout(props('a'), {
      availableWidth: 20,
      availableHeight: 40,
      verticalAlign: 'center',
    })
    expect(center.lines[0]!.y).toBeCloseTo(5, 12) // (40-10)/2 = 15 below top
    const bottom = buildPositionedGlyphLayout(props('a'), {
      availableWidth: 20,
      availableHeight: 40,
      verticalAlign: 'bottom',
    })
    expect(bottom.lines[0]!.y).toBeCloseTo(-10, 12)
  })

  it('applies kerning between glyph pairs at positioning time', () => {
    const kernedFont = createStubFont({ kerning: { 'a/b': -0.1 } })
    const layout = buildPositionedGlyphLayout(
      { ...props('ab'), font: kernedFont },
      { availableWidth: 20 }
    )
    const [, b] = layout.lines[0]!.entries
    expect(b).toMatchObject({ penX: -10 + 5 - 1 })
  })

  it('consecutive baselines are exactly lineHeight apart', () => {
    const layout = buildPositionedGlyphLayout(props('a\nb\nc', { lineHeight: 15 }))
    const [l0, l1, l2] = layout.lines
    expect(l0!.baselineY - l1!.baselineY).toBe(15)
    expect(l1!.baselineY - l2!.baselineY).toBe(15)
  })

  it('defaults to intrinsic size when no available box is given', () => {
    const layout = buildPositionedGlyphLayout(props('aa\nb'))
    expect(layout.availableWidth).toBe(10)
    expect(layout.availableHeight).toBe(20)
    expect(layout.textAlign).toBe('left')
    expect(layout.verticalAlign).toBe('top')
  })

  it('wraps against availableWidth like buildGlyphLayout', () => {
    const layout = buildPositionedGlyphLayout(props('aa bb cc'), { availableWidth: 14 })
    expect(layout.lines).toHaveLength(3)
  })
})
