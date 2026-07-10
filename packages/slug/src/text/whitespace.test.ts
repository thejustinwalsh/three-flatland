// Whitespace behavior — the collapseSpaces / preserveNewlines / tab-stop
// model that replaced the CSS whiteSpace enum. Collapsed characters keep
// their entries (charIndex is ALWAYS a source-text index) but contribute
// no advance, so these tests assert widths, line counts, and pen
// positions instead of normalized strings.

import { describe, it, expect } from 'vitest'
import { layoutParagraph, measureParagraph } from './layout'
import { createStubTypeface } from './stubTypeface.fixture'
import type { SlugParagraphStyle } from './types'

const typeface = createStubTypeface()

function style(extra: Partial<SlugParagraphStyle> = {}): SlugParagraphStyle {
  return { typeface, fontSize: 10, lineSpacing: 1, ...extra }
}

describe('collapseSpaces + folded newlines (the old "normal" mode)', () => {
  const mode = { collapseSpaces: true, preserveNewlines: false }

  it('collapses runs of spaces, tabs, and newlines to single spaces and trims', () => {
    const collapsed = measureParagraph('  a\t\tb \n c  ', style(mode))
    const plain = measureParagraph('a b c', style(mode))
    expect(collapsed.width).toBe(plain.width) // 25
    expect(collapsed.width).toBe(25)
    expect(collapsed.height).toBe(10) // one line — '\n' folded into the space
  })

  it('collapsed characters keep zero-advance entries at source indices', () => {
    const p = layoutParagraph('a  b', style(mode))
    expect(p.characters).toHaveLength(4)
    expect(p.characters[1]).toMatchObject({ charIndex: 1, advance: 5 })
    expect(p.characters[2]).toMatchObject({ charIndex: 2, advance: 0, hasOutline: false })
    expect(p.characters[3]!.x).toBe(10) // 'b' lands right after ONE space
  })

  it('leading whitespace collapses entirely (trim parity)', () => {
    const p = layoutParagraph('  a', style(mode))
    expect(p.characters[0]).toMatchObject({ advance: 0 })
    expect(p.characters[1]).toMatchObject({ advance: 0 })
    expect(p.characters[2]!.x).toBe(0)
  })
})

describe('collapseSpaces + preserved newlines (the old "pre-line" mode)', () => {
  const mode = { collapseSpaces: true, preserveNewlines: true }

  it('collapses spaces/tabs but keeps hard breaks, trimming around line starts', () => {
    const p = layoutParagraph('a  b \n\t c', style(mode))
    expect(p.lines).toHaveLength(2)
    expect(p.lines[0]!.width).toBe(15) // 'a b'
    expect(p.lines[1]!.width).toBe(5) // 'c' — leading '\t ' collapsed to nothing
    const c = p.characters[8]!
    expect(c.charIndex).toBe(8)
    expect(c.x).toBe(0)
  })

  it('trims leading whitespace of the whole text', () => {
    const p = layoutParagraph('  a\nb  ', style(mode))
    expect(p.lines[0]!.width).toBe(5)
    expect(p.lines[1]!.width).toBe(5)
    expect(p.characters[2]!.x).toBe(0) // 'a'
  })
})

describe('verbatim whitespace (collapseSpaces: false — the old "pre" mode)', () => {
  const mode = { collapseSpaces: false }

  it('keeps newlines and every space', () => {
    const p = layoutParagraph('a  b\n c', style(mode))
    expect(p.lines).toHaveLength(2)
    expect(p.lines[0]!.width).toBe(20) // 'a␣␣b'
    expect(p.lines[1]!.width).toBe(10) // '␣c' — leading space kept
  })

  it('advances tabs to the next tab stop (§2.12), not a fixed expansion', () => {
    const p = layoutParagraph('a\tb', style({ ...mode, tabWidth: 20 }))
    // pen after 'a' = 5 → next stop at 20
    expect(p.characters[1]).toMatchObject({ charIndex: 1, advance: 15, hasOutline: false })
    expect(p.characters[2]!.x).toBe(20)
    expect(p.lines[0]!.width).toBe(25)
  })

  it('a tab exactly on a stop advances a full tabWidth', () => {
    const p = layoutParagraph('aa\tb', style({ ...mode, tabWidth: 10 }))
    expect(p.characters[3]!.x).toBe(20)
  })

  it('defaults tabWidth to 8 space advances', () => {
    const p = layoutParagraph('a\tb', style(mode))
    // spaceWidth 5 → tabWidth 40; pen 5 → stop at 40
    expect(p.characters[2]!.x).toBe(40)
  })
})

describe('defaults', () => {
  it('collapseSpaces and preserveNewlines default on', () => {
    const p = layoutParagraph('a  b\nc', { typeface, fontSize: 10, lineSpacing: 1 })
    expect(p.lines).toHaveLength(2)
    expect(p.lines[0]!.width).toBe(15) // spaces collapsed
  })
})
