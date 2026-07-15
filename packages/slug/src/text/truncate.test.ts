// Truncation — the manual's BuildTruncatableSlug: under wrap 'none' a
// line that exceeds maxWidth swaps its tail for an ellipsis that fits.

import { describe, it, expect } from 'vitest'
import { layoutParagraph } from './layout'
import { hitTest } from './query'
import { createStubTypeface } from './stubTypeface.fixture'
import type { SlugParagraphStyle } from './types'

// '…' and '.' get explicit stub advances (0.5 em → 5 units) so ellipsis
// widths stay hand-computable.
const typeface = createStubTypeface({ advances: { '…': 0.5, '.': 0.5 } })

function style(extra: Partial<SlugParagraphStyle> = {}): SlugParagraphStyle {
  return {
    typeface,
    fontSize: 10,
    lineSpacing: 1,
    collapseSpaces: false,
    wrap: 'none',
    ...extra,
  }
}

describe('truncate', () => {
  it('replaces the overflowing tail with the default ellipsis so the line fits', () => {
    const p = layoutParagraph('aaaa', style({ maxWidth: 12, truncate: {} }))
    // one 'a' (5) + '…' (5) = 10 ≤ 12; a second 'a' would need 15
    expect(p.lines[0]!.width).toBe(10)
    // dropped source chars stay as zero-advance, outline-less entries
    expect(p.characters[0]).toMatchObject({ charIndex: 0, x: 0, advance: 5, hasOutline: true })
    for (const i of [1, 2, 3]) {
      expect(p.characters[i]).toMatchObject({ charIndex: i, x: 5, advance: 0, hasOutline: false })
    }
    // the ellipsis rides after every source entry, tagged with the first
    // dropped char's index
    const extra = p.characters[4]!
    expect(extra).toMatchObject({ charIndex: 1, x: 5, advance: 5, hasOutline: true })
    expect(p.characters).toHaveLength(5)
  })

  it('supports a custom multi-character ellipsis', () => {
    const p = layoutParagraph('aaaa', style({ maxWidth: 12, truncate: { ellipsis: '..' } }))
    // '..' is 10 wide: no 'a' fits → both dots start at x 0
    expect(p.characters[4]).toMatchObject({ charIndex: 0, x: 0, advance: 5 })
    expect(p.characters[5]).toMatchObject({ charIndex: 0, x: 5, advance: 5 })
    expect(p.lines[0]!.width).toBe(10)
  })

  it('does nothing when the line fits', () => {
    const p = layoutParagraph('aa', style({ maxWidth: 12, truncate: {} }))
    expect(p.characters).toHaveLength(2)
    expect(p.characters[1]).toMatchObject({ advance: 5, hasOutline: true })
  })

  it('trims whitespace before the ellipsis so it hugs the kept text', () => {
    const p = layoutParagraph('a aa', style({ maxWidth: 16, truncate: {} }))
    // 'a' (5) + '…' (5) = 10 fits; keeping 'a ' + next 'a' would need 20
    const extra = p.characters[4]!
    expect(extra).toMatchObject({ x: 5, advance: 5, hasOutline: true })
    expect(p.lines[0]!.width).toBe(10)
  })

  it('truncates each hard-broken line independently', () => {
    const p = layoutParagraph('aaaa\nb', style({ maxWidth: 12, truncate: {} }))
    expect(p.lines).toHaveLength(2)
    expect(p.lines[0]!.width).toBe(10)
    expect(p.lines[1]!.width).toBe(5)
    // line 1 is untouched
    expect(p.characters[5]).toMatchObject({ charIndex: 5, advance: 5, hasOutline: true })
  })

  it('hit-testing the ellipsis resolves to the first truncated char', () => {
    const p = layoutParagraph('aaaa', style({ maxWidth: 12, truncate: {} }))
    expect(hitTest(p, 7, 5).charIndex).toBe(1)
  })
})
