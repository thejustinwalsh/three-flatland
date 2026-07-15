// Geometric queries over a SlugParagraph — Slug's LocateSlug (caret),
// TestSlug (hit-test), and a span-based selection built on both. Pure
// functions of the paragraph; no rendering.
//
// D6: inputs AND outputs are paragraph space — origin at the block's
// top-left, +y down. No center-origin, no y-up, no asymmetry between
// hit-test input and caret output.

import type {
  SlugCaret,
  SlugCharacter,
  SlugHit,
  SlugLine,
  SlugParagraph,
  SlugSpan,
} from './types.js'

/** Visible (advance > 0) entries of one line, source order, plus truncation extras. */
function visibleEntries(p: SlugParagraph, line: SlugLine): SlugCharacter[] {
  const out: SlugCharacter[] = []
  for (let i = line.charStart; i < line.charEnd; i++) {
    const entry = p.characters[i]!
    if (entry.advance > 0) out.push(entry)
  }
  // Truncation ellipsis entries live past the source range.
  const textLength = sourceLength(p)
  for (let i = textLength; i < p.characters.length; i++) {
    const entry = p.characters[i]!
    if (entry.lineIndex === line.index && entry.advance > 0) out.push(entry)
  }
  return out
}

/** Source char count — `characters[i].charIndex === i` for i below this. */
function sourceLength(p: SlugParagraph): number {
  const lastLine = p.lines[p.lines.length - 1]
  return lastLine === undefined ? 0 : lastLine.charEnd
}

function lineAt(p: SlugParagraph, y: number): SlugLine {
  const lines = p.lines
  const first = lines[0]!
  if (y < first.y) return first
  for (const line of lines) {
    if (y < line.y + line.height) return line
  }
  return lines[lines.length - 1]!
}

/**
 * Which character sits under a paragraph-space point (TestSlug). Points
 * above/left of the block clamp to the first character, below/right to
 * the last with `trailing: true` — the derived caret index is always
 * `charIndex + (trailing ? 1 : 0)`.
 *
 * The trailing rule is the manual's (p241): `trailing` flips past the
 * glyph's midpoint (half its OWN advance), while empty spacing from
 * positive tracking or kerning extends the trailing side without moving
 * that midpoint.
 */
export function hitTest(p: SlugParagraph, x: number, y: number): SlugHit {
  const line = lineAt(p, y)
  const entries = visibleEntries(p, line)
  if (entries.length === 0) {
    return { charIndex: line.charStart, lineIndex: line.index, trailing: false }
  }
  const last = entries[entries.length - 1]!
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    // The cell extends to the next visible entry's pen — trailing
    // tracking/kerning spacing belongs to THIS glyph's trailing side.
    const cellEnd = i + 1 < entries.length ? entries[i + 1]!.x : entry.x + entry.advance
    if (x < entry.x + entry.advance / 2) {
      return { charIndex: entry.charIndex, lineIndex: line.index, trailing: false }
    }
    if (x < cellEnd) {
      return { charIndex: entry.charIndex, lineIndex: line.index, trailing: true }
    }
  }
  return { charIndex: last.charIndex, lineIndex: line.index, trailing: true }
}

/**
 * Caret geometry before the character at `charIndex` (LocateSlug);
 * `charIndex === text.length` is the end-of-text caret. Per the manual,
 * a caret after a glyph sits before any trailing tracking/kerning
 * spacing. Ascent/descent are the line's.
 */
export function locateCaret(p: SlugParagraph, charIndex: number): SlugCaret {
  const textLength = sourceLength(p)
  const clamped = Math.max(0, Math.min(Math.trunc(charIndex), textLength))
  let x: number
  let line: SlugLine
  const lastLine = p.lines[p.lines.length - 1]!
  if (textLength === 0) {
    line = p.lines[0]!
    x = line.x
  } else if (clamped >= textLength) {
    if (lastLine.charStart === lastLine.charEnd) {
      // Trailing hard break: the end-of-text caret starts the empty line.
      line = lastLine
      x = line.x
    } else {
      const entry = p.characters[textLength - 1]!
      line = p.lines[entry.lineIndex]!
      x = entry.x + entry.advance
    }
  } else {
    const entry = p.characters[clamped]!
    line = p.lines[entry.lineIndex]!
    x = entry.x
    // p241: a caret placed after a glyph sits BEFORE any empty spacing
    // from positive tracking/kerning — i.e. at the previous glyph's
    // advance end when that lies left of this entry's pen.
    const prev = clamped > 0 ? p.characters[clamped - 1] : undefined
    if (prev !== undefined && prev.lineIndex === entry.lineIndex) {
      x = Math.min(x, prev.x + prev.advance)
    }
  }
  return {
    x,
    baselineY: line.baselineY,
    ascent: line.ascent,
    descent: line.descent,
    lineIndex: line.index,
  }
}

/**
 * Selection geometry for the half-open char range `[start, end)` — one
 * span per touched line, x1 placed before trailing spacing. A collapsed
 * or empty range yields no spans (use `locateCaret` for the caret).
 * Spans say WHERE; what to draw there is the consumer's decision.
 */
export function selectRange(p: SlugParagraph, start: number, end: number): readonly SlugSpan[] {
  const textLength = sourceLength(p)
  const s0 = Math.max(0, Math.min(Math.trunc(start), textLength))
  const e0 = Math.max(0, Math.min(Math.trunc(end), textLength))
  if (e0 <= s0) return []

  const spans: SlugSpan[] = []
  for (const line of p.lines) {
    const s = Math.max(s0, line.charStart)
    const e = Math.min(e0, line.charEnd)
    if (e <= s) continue
    const first = p.characters[s]!
    const lastEntry = p.characters[e - 1]!
    spans.push({
      lineIndex: line.index,
      x0: first.x,
      x1: lastEntry.x + lastEntry.advance,
      baselineY: line.baselineY,
      ascent: line.ascent,
      descent: line.descent,
    })
  }
  return spans
}
