// The run-based paragraph engine: wrap, position, align, truncate.
//
// Ports the behavioural core of the previous `src/layout/` CSS-model
// engine (itself ported from @pmndrs/uikit) onto Slug's vocabulary and
// run model. Upstream quirks preserved on purpose: wrap widths use
// advances + tracking only (kerning applies at positioning time), a word
// longer than `maxWidth` overflows rather than splitting under
// `wrap: 'word'`, missing glyphs measure 0.6 em, and `\n`/`\t` fall back
// to space metrics.
//
// D6: all coordinates are paragraph space — origin at the block's
// top-left, +y down. See `../layout/worldSpace.ts` for the world-space
// conversion and `../layout/baseline.ts` for the ONLY copy of the
// baseline math.

import { getLineBaselineOffset } from '../layout/baseline.js'
import type { SlugGlyphMetrics } from '../types.js'
import type { ResolvedParagraph, ResolvedRun } from './resolve.js'
import { getMetricsWithFallback, resolveContent } from './resolve.js'
import type {
  SlugCharacter,
  SlugLine,
  SlugParagraph,
  SlugParagraphStyle,
  SlugRun,
} from './types.js'

const TAB_EPSILON = 1e-6

/** One broken line before positioning; indices are into the source text. */
interface LineBreak {
  start: number
  /** Exclusive; includes trailing whitespace and a terminating `\n`. */
  end: number
  /** Exclusive; up to and including the last visible (non-whitespace) char. */
  visibleEnd: number
  /** Advance width up to `visibleEnd` (kerning excluded — upstream parity). */
  width: number
  /** Visible space count inside the content — the justify denominator. */
  spaces: number
  hard: boolean
}

/** Per-char walk record, parallel to `[start, end)` of a LineBreak. */
interface WalkRecord {
  adv: number[]
  glyphAdv: number[]
  metrics: SlugGlyphMetrics[]
  spaceLike: boolean[]
}

function isHardBreak(rp: ResolvedParagraph, char: string): boolean {
  return char === '\n' && rp.preserveNewlines
}

function isSpaceLike(rp: ResolvedParagraph, char: string): boolean {
  return char === ' ' || char === '\t' || (char === '\n' && !rp.preserveNewlines)
}

/**
 * Consume one line from `startIndex`, recording per-char advances into
 * `rec` (shared by the positioning pass so collapse/tab decisions can
 * never diverge between measuring and positioning).
 */
function walkLine(rp: ResolvedParagraph, startIndex: number, rec?: WalkRecord): LineBreak {
  const { text, runs, runIndexByChar, maxWidth, wrap, collapseSpaces } = rp
  const out: LineBreak = {
    start: startIndex,
    end: startIndex,
    visibleEnd: startIndex,
    width: 0,
    spaces: 0,
    hard: false,
  }
  if (rec) {
    rec.adv.length = 0
    rec.glyphAdv.length = 0
    rec.metrics.length = 0
    rec.spaceLike.length = 0
  }

  let pen = 0
  let spaces = 0
  let hasVisible = false
  let prevSpaceLike = false
  let i = startIndex

  for (; i < text.length; i++) {
    const char = text[i]!
    const run = runs[runIndexByChar[i]!]!
    const metrics = getMetricsWithFallback(run.typeface, char)

    if (isHardBreak(rp, char)) {
      out.end = i + 1
      out.hard = true
      if (rec) record(rec, 0, 0, metrics, false)
      return out
    }

    const spaceLike = isSpaceLike(rp, char)
    let adv: number
    let glyphAdv: number
    if (char === '\t' && !collapseSpaces) {
      // §2.12 tab stops: advance to the next multiple of tabWidth. Stops
      // are measured from the line's content start, before justification
      // and kerning adjustments.
      adv = rp.tabWidth - (pen % rp.tabWidth)
      if (adv <= TAB_EPSILON) adv = rp.tabWidth
      glyphAdv = adv
    } else if (spaceLike && collapseSpaces && (prevSpaceLike || !hasVisible)) {
      // Collapsed: the char keeps its entry (charIndex stays a source
      // index) but contributes no width. Leading whitespace of a line
      // collapses entirely.
      adv = 0
      glyphAdv = 0
    } else {
      const size = run.fontSize * run.scaleX
      glyphAdv = metrics.advanceWidth * size
      adv = glyphAdv + run.tracking * size
    }
    pen += adv
    if (rec) record(rec, adv, glyphAdv, metrics, spaceLike)

    if (spaceLike) {
      if (adv > 0) spaces += 1
      prevSpaceLike = true
      // 'word' keeps trailing spaces on the line; 'anywhere'/'none' do too,
      // but only 'word' extends `end` through them eagerly (upstream parity).
      if (wrap === 'word') out.end = i + 1
      continue
    }
    prevSpaceLike = false

    if (wrap !== 'none' && out.width > 0 && maxWidth !== undefined && pen > maxWidth) {
      break
    }
    hasVisible = true

    if (wrap === 'word') {
      const next = text[i + 1]
      if (next === undefined || isSpaceLike(rp, next) || isHardBreak(rp, next)) {
        // Save point: the word fits.
        out.end = i + 1
        out.visibleEnd = i + 1
        out.width = pen
        out.spaces = spaces
      }
    } else {
      out.end = i + 1
      out.visibleEnd = i + 1
      out.width = pen
      out.spaces = spaces
    }
  }

  if (wrap !== 'word') {
    // Everything consumed before the overflow char (or the text end)
    // belongs to this line — including trailing whitespace.
    out.end = i
  }
  if (rec) {
    // Drop records past the break point (the overflowing lookahead chars).
    const keep = out.end - out.start
    rec.adv.length = keep
    rec.glyphAdv.length = keep
    rec.metrics.length = keep
    rec.spaceLike.length = keep
  }
  return out
}

function record(
  rec: WalkRecord,
  adv: number,
  glyphAdv: number,
  metrics: SlugGlyphMetrics,
  spaceLike: boolean
): void {
  rec.adv.push(adv)
  rec.glyphAdv.push(glyphAdv)
  rec.metrics.push(metrics)
  rec.spaceLike.push(spaceLike)
}

/** Break the whole text into lines; a trailing `\n` (or empty text) yields an empty last line. */
function breakAll(rp: ResolvedParagraph): LineBreak[] {
  const breaks: LineBreak[] = []
  const { text } = rp
  let i = 0
  while (i < text.length) {
    const b = walkLine(rp, i)
    // Provably unreachable (spaces, hard breaks, and save points all
    // advance `end`), but an error beats an infinite loop if that ever
    // changes.
    if (b.end <= i) throw new Error('slug/text: line breaker failed to advance')
    breaks.push(b)
    i = b.end
  }
  if (breaks.length === 0 || (text[text.length - 1] === '\n' && rp.preserveNewlines)) {
    breaks.push({
      start: text.length,
      end: text.length,
      visibleEnd: text.length,
      width: 0,
      spaces: 0,
      hard: false,
    })
  }
  return breaks
}

/** Em height (fontSize × script scale) driving a line's box and baseline. */
function lineEmMetrics(
  rp: ResolvedParagraph,
  b: LineBreak
): { em: number; ascender: number; descender: number } {
  let em = 0
  let ascender = rp.style.typeface.ascender
  let descender = rp.style.typeface.descender
  for (let i = b.start; i < b.end; i++) {
    const run = rp.runs[rp.runIndexByChar[i]!]!
    const runEm = run.fontSize * run.scaleY
    if (runEm > em) {
      em = runEm
      ascender = run.typeface.ascender
      descender = run.typeface.descender
    }
  }
  if (em === 0) em = rp.style.fontSize
  return { em, ascender, descender }
}

function alignOffset(
  alignment: 'left' | 'center' | 'right',
  extent: number,
  width: number
): number {
  switch (alignment) {
    case 'right':
      return extent - width
    case 'center':
      return (extent - width) / 2
    default:
      return 0
  }
}

/**
 * Measure a paragraph without positioning: widest line and block height.
 * `style.maxWidth` is the wrap constraint; omit it for intrinsic size.
 * Stable under re-measurement at the (ceiled) returned width.
 */
export function measureParagraph(
  content: string | readonly SlugRun[],
  style: SlugParagraphStyle
): { width: number; height: number } {
  const rp = resolveContent(content, style)
  const breaks = breakAll(rp)
  let width = 0
  let height = 0
  for (const b of breaks) {
    if (b.width > width) width = b.width
    height += lineEmMetrics(rp, b).em * rp.lineSpacing
  }
  return { width, height }
}

/**
 * Lay a paragraph out into positioned lines and per-character entries —
 * whitespace included, so caret/hit-test queries work after a space.
 * A bare `string` is one implicit run. All output is paragraph space
 * (D6: top-left origin, +y down).
 */
export function layoutParagraph(
  content: string | readonly SlugRun[],
  style: SlugParagraphStyle
): SlugParagraph {
  const rp = resolveContent(content, style)
  const breaks = breakAll(rp)

  let widest = 0
  for (const b of breaks) if (b.width > widest) widest = b.width
  const extent = rp.maxWidth ?? widest

  const lines: SlugLine[] = []
  const characters: SlugCharacter[] = []
  const ellipsisEntries: SlugCharacter[] = []
  const rec: WalkRecord = { adv: [], glyphAdv: [], metrics: [], spaceLike: [] }

  let top = 0
  for (let lineIndex = 0; lineIndex < breaks.length; lineIndex++) {
    const b = breaks[lineIndex]!
    if (b.start < rp.text.length) walkLine(rp, b.start, rec)
    const { em, ascender, descender } = lineEmMetrics(rp, b)
    const lineHeight = em * rp.lineSpacing
    const baselineY = top + getLineBaselineOffset(ascender, em, lineHeight)

    // Truncation (BuildTruncatableSlug): only under wrap 'none' with a
    // width the line exceeds.
    let cut = -1 // line-relative index of the first dropped char
    let ellipsisWidth = 0
    let ellipsis = ''
    if (
      rp.style.truncate !== undefined &&
      rp.wrap === 'none' &&
      rp.maxWidth !== undefined &&
      b.width > rp.maxWidth
    ) {
      ellipsis = rp.style.truncate.ellipsis ?? '…'
      for (const char of ellipsis) {
        ellipsisWidth +=
          getMetricsWithFallback(rp.style.typeface, char).advanceWidth * rp.style.fontSize
      }
      // Largest kept prefix whose width + ellipsis fits; trailing
      // whitespace before the ellipsis is trimmed.
      let pen = 0
      let bestCut = 0
      let penAtCut = 0
      for (let j = 0; j < b.end - b.start; j++) {
        pen += rec.adv[j]!
        if (pen + ellipsisWidth > rp.maxWidth) break
        if (!rec.spaceLike[j]) {
          bestCut = j + 1
          penAtCut = pen
        }
      }
      cut = bestCut
      b.width = penAtCut + ellipsisWidth
    }

    const justifyActive =
      rp.justify &&
      rp.maxWidth !== undefined &&
      !b.hard &&
      lineIndex < breaks.length - 1 &&
      b.spaces > 0 &&
      cut < 0
    const extraPerSpace = justifyActive ? (extent - b.width) / b.spaces : 0

    const lineX = justifyActive ? 0 : alignOffset(rp.alignment, extent, b.width)

    lines.push({
      index: lineIndex,
      x: lineX,
      y: top,
      height: lineHeight,
      baselineY,
      width: b.width,
      charStart: b.start,
      charEnd: b.end,
      ascent: ascender * em,
      descent: -descender * em,
    })

    // Position pass — kerning applies here, not in wrapping (parity).
    let pen = 0
    let prevRun: ResolvedRun | undefined
    let prevGlyphId = -1
    let cutX = 0
    for (let j = 0; j < b.end - b.start; j++) {
      const charIndex = b.start + j
      const run = rp.runs[rp.runIndexByChar[charIndex]!]!
      const metrics = rec.metrics[j]!
      const truncated = cut >= 0 && j >= cut

      if (!truncated && prevRun !== undefined && prevGlyphId >= 0 && metrics.glyphId >= 0) {
        // Kern only within a typeface at one effective size — cross-run
        // pairs are ambiguous and intentionally unkerned.
        if (
          prevRun.typeface === run.typeface &&
          prevRun.fontSize * prevRun.scaleX === run.fontSize * run.scaleX
        ) {
          pen += run.typeface.getKerning(prevGlyphId, metrics.glyphId) * run.fontSize * run.scaleX
        }
      }
      if (truncated && j === cut) cutX = pen

      characters.push({
        charIndex,
        glyphId: metrics.glyphId,
        runIndex: rp.runIndexByChar[charIndex]!,
        lineIndex,
        x: lineX + (truncated ? cutX : pen),
        advance: truncated ? 0 : rec.glyphAdv[j]!,
        hasOutline: truncated ? false : metrics.hasOutline,
      })

      if (!truncated) {
        pen += rec.adv[j]!
        if (rec.spaceLike[j] && rec.adv[j]! > 0) pen += extraPerSpace
        prevRun = run
        prevGlyphId = metrics.glyphId
      }
    }

    // Ellipsis entries carry the first dropped char's index and ride at
    // the end of `characters`, after every source entry.
    if (cut >= 0) {
      let ex = lineX + cutX
      const lastKeptChar = b.start + Math.max(cut - 1, 0)
      const runIndex =
        rp.text.length > 0 ? rp.runIndexByChar[Math.min(lastKeptChar, rp.text.length - 1)]! : 0
      for (const char of ellipsis) {
        const metrics = getMetricsWithFallback(rp.style.typeface, char)
        const advance = metrics.advanceWidth * rp.style.fontSize
        ellipsisEntries.push({
          charIndex: b.start + cut,
          glyphId: metrics.glyphId,
          runIndex,
          lineIndex,
          x: ex,
          advance,
          hasOutline: metrics.hasOutline,
        })
        ex += advance
      }
    }

    top += lineHeight
  }

  characters.push(...ellipsisEntries)

  return {
    style,
    width: extent,
    height: top,
    lines,
    characters,
  }
}
