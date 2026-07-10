// The run model: rich text is the core, not a phase (§4.6/§4.7).

import { describe, it, expect } from 'vitest'
import { layoutParagraph } from './layout'
import { getScriptTransform } from './script'
import { createStubTypeface } from './stubTypeface.fixture'
import type { SlugParagraphStyle } from './types'

const typeface = createStubTypeface()

function style(extra: Partial<SlugParagraphStyle> = {}): SlugParagraphStyle {
  return { typeface, fontSize: 10, lineSpacing: 1, collapseSpaces: false, ...extra }
}

describe('runs', () => {
  it('a bare string is exactly a single-run array', () => {
    const fromString = layoutParagraph('a b\ncd', style({ maxWidth: 40 }))
    const fromRuns = layoutParagraph([{ text: 'a b\ncd' }], style({ maxWidth: 40 }))
    expect(fromRuns.characters).toEqual(fromString.characters)
    expect(fromRuns.lines).toEqual(fromString.lines)
    expect(fromRuns.width).toBe(fromString.width)
    expect(fromRuns.height).toBe(fromString.height)
  })

  it('assigns runIndex per character across the concatenated text', () => {
    const p = layoutParagraph([{ text: 'ab' }, { text: 'cd' }], style())
    expect(p.characters.map((c) => c.runIndex)).toEqual([0, 0, 1, 1])
    expect(p.characters.map((c) => c.charIndex)).toEqual([0, 1, 2, 3])
  })

  it('per-run fontSize scales advances (hand-computed)', () => {
    const p = layoutParagraph([{ text: 'ab' }, { text: 'cd', fontSize: 20 }], style())
    const xs = p.characters.map((c) => c.x)
    expect(xs).toEqual([0, 5, 10, 20]) // 5-wide, 5-wide, 10-wide
    expect(p.characters[2]!.advance).toBe(10)
  })

  it('per-run fontSize changes the line height — per line, not per paragraph', () => {
    const p = layoutParagraph([{ text: 'ab\n' }, { text: 'cd', fontSize: 20 }], style())
    const [l0, l1] = p.lines
    expect(l0!.height).toBe(10)
    expect(l1!.height).toBe(20)
    // baseline centering follows the line's dominant run
    expect(l0!.baselineY).toBeCloseTo(8, 12)
    expect(l1!.baselineY).toBeCloseTo(10 + 16, 12)
  })

  it('per-run tracking applies only inside its run', () => {
    const p = layoutParagraph([{ text: 'ab', tracking: 0.2 }, { text: 'cd' }], style())
    expect(p.characters.map((c) => c.x)).toEqual([0, 7, 14, 19])
  })

  it('kerns across run boundaries when typeface and size match (color runs keep kerning)', () => {
    const kerned = createStubTypeface({ kerning: { 'a/b': -0.1 } })
    const p = layoutParagraph(
      [
        { text: 'a', color: 'red' },
        { text: 'b', color: 'blue' },
      ],
      { ...style(), typeface: kerned }
    )
    expect(p.characters[1]!.x).toBeCloseTo(4, 12)
  })

  it('does NOT kern across a fontSize change', () => {
    const kerned = createStubTypeface({ kerning: { 'a/b': -0.1 } })
    const p = layoutParagraph([{ text: 'a' }, { text: 'b', fontSize: 20 }], {
      ...style(),
      typeface: kerned,
    })
    expect(p.characters[1]!.x).toBe(5)
  })

  it('a per-run typeface overrides the paragraph typeface', () => {
    const wide = createStubTypeface({ advances: { a: 1 } })
    const p = layoutParagraph([{ text: 'a', typeface: wide }, { text: 'a' }], style())
    expect(p.characters[0]!.advance).toBe(10)
    expect(p.characters[1]!.advance).toBe(5)
  })

  it('render-only hints (color, underline, strike, weightBoost) do not move glyphs', () => {
    const plain = layoutParagraph([{ text: 'ab' }], style())
    const styled = layoutParagraph(
      [{ text: 'ab', color: 0xff0000, underline: true, strike: true, weightBoost: 0.5 }],
      style()
    )
    expect(styled.characters).toEqual(plain.characters)
  })
})

describe('transform-based scripts (§2.7)', () => {
  it('scriptLevel scales advances by the script transform', () => {
    const p = layoutParagraph([{ text: 'a' }, { text: 'a', scriptLevel: 1 }], style())
    expect(p.characters[0]!.advance).toBe(5)
    expect(p.characters[1]!.advance).toBeCloseTo(5 * 0.65, 12) // default fallback scale
  })

  it('applies the transform |level| times and caps the depth at 3', () => {
    const t1 = getScriptTransform(typeface, 1)
    const t2 = getScriptTransform(typeface, 2)
    expect(t2.scaleX).toBeCloseTo(t1.scaleX * t1.scaleX, 12)
    expect(t2.baselineShift).toBeCloseTo(0.34 + 0.34 * 0.65, 12)
    expect(getScriptTransform(typeface, 4)).toEqual(getScriptTransform(typeface, 3))
  })

  it('subscripts shift the baseline down, superscripts up', () => {
    expect(getScriptTransform(typeface, 1).baselineShift).toBeGreaterThan(0)
    expect(getScriptTransform(typeface, -1).baselineShift).toBeLessThan(0)
    expect(getScriptTransform(typeface, 0).baselineShift).toBe(0)
  })

  it('prefers the typeface-provided OS/2 script metrics when present', () => {
    const withMetrics = Object.assign(createStubTypeface(), {
      superscriptScale: { x: 0.5, y: 0.5 },
      superscriptOffset: { x: 0, y: 0.4 },
    })
    const t = getScriptTransform(withMetrics, 1)
    expect(t.scaleX).toBe(0.5)
    expect(t.baselineShift).toBe(0.4)
  })
})
