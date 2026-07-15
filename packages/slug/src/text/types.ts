// Slug's run-based text engine — public types.
//
// Vocabulary follows the Slug User Manual v7.5 (Eric Lengyel): runs and
// multi-font text are the core model (§4.6/§4.7), tracking is the word for
// letter-spacing, tab spacing is tab STOPS (§2.12), scripts are
// transform-based (§2.7), and caret/hit-test are first-class (LocateSlug /
// TestSlug). No CSS enums live here.
//
// D6 (ORCHESTRATOR RULING): Slug paragraph space has its origin at the
// block's TOP-LEFT, +x right, +y DOWN — the way typography works. Every
// coordinate in these types, input and output alike, uses that convention.
// Convert to three.js y-up exactly once, via `paragraphYToWorldY` in
// `../layout/worldSpace.ts`.

import type { Color } from 'three'
import type { SlugGlyphMetrics } from '../types.js'

/**
 * The metrics surface the text engine consumes. Structural — `SlugFont`
 * and `SlugFontStack` both satisfy it, and tests can stub it.
 */
export interface SlugTypeface {
  unitsPerEm: number
  /** Em-space, positive (above the baseline). */
  ascender: number
  /** Em-space, negative (below the baseline). */
  descender: number
  getGlyphMetrics(codePoint: number): SlugGlyphMetrics | undefined
  /** Em-normalized kerning between two glyph ids; negative tightens. */
  getKerning(a: number, b: number): number
}

/** A contiguous span of text sharing a typeface and typographic style. */
export interface SlugRun {
  text: string
  /** Inherits the paragraph's typeface when omitted. */
  typeface?: SlugTypeface
  fontSize?: number
  /** Em-space extra advance per glyph (Slug's word for letter-spacing). */
  tracking?: number
  color?: number | string | Color
  underline?: boolean
  strike?: boolean
  /**
   * Transform-based script level (§2.7): positive = superscript,
   * negative = subscript, |n| in [1, 3]. The script transform is applied
   * |n| times. Affects advances here; renderers apply the baseline shift
   * via `getScriptTransform`.
   */
  scriptLevel?: number
  /** Optical weight boost (§4.9) — a render hint, ignored by layout. */
  weightBoost?: number
}

export interface SlugParagraphStyle {
  typeface: SlugTypeface
  fontSize: number
  /** Baseline-to-baseline distance as a multiple of fontSize. Default 1.2. */
  lineSpacing?: number
  /** Em-space tracking applied to every run that doesn't override it. */
  tracking?: number
  /**
   * Distance between consecutive tab stops (§2.12), in the same units as
   * `fontSize`. Tabs advance the pen to the next stop. Default: 8 space
   * advances of the paragraph typeface. Only meaningful when
   * `collapseSpaces` is false — collapsed tabs behave like spaces.
   */
  tabWidth?: number
  alignment?: 'left' | 'center' | 'right'
  /**
   * Full justification (§2.11) — independent of `alignment`, like Slug's
   * kLayoutFullJustification: expands spaces so each line fills `maxWidth`.
   * The last line of a paragraph (and lines ending in a hard break) get
   * `alignment` instead. Default false.
   */
  justify?: boolean
  /** Wrap constraint and alignment extent. Omit = never wrap. */
  maxWidth?: number
  /** 'word' breaks at spaces, 'anywhere' at any glyph, 'none' only at `\n`. Default 'word'. */
  wrap?: 'word' | 'anywhere' | 'none'
  /**
   * Collapse runs of spaces/tabs to a single space advance and trim them
   * at line boundaries. Collapsed characters keep their entries (advance
   * 0) so `charIndex` always refers to the source text. Default true.
   */
  collapseSpaces?: boolean
  /** Treat `\n` as a hard line break; false folds it into a space. Default true. */
  preserveNewlines?: boolean
  /**
   * Truncate lines that exceed `maxWidth` under `wrap: 'none'` (the
   * manual's BuildTruncatableSlug): trailing characters are replaced by
   * `ellipsis` (default `'…'`) so the line fits.
   */
  truncate?: { ellipsis?: string }
}

/**
 * One positioned character — including whitespace, so caret and hit-test
 * work after a space. Renderers skip entries with `hasOutline: false`.
 *
 * For every source char `i`, `paragraph.characters[i].charIndex === i`;
 * truncation ellipsis entries (which have no source char) are appended
 * after all source entries, carrying the `charIndex` of the first
 * truncated-away character.
 */
export interface SlugCharacter {
  /** UTF-16 index into the concatenated source text. */
  charIndex: number
  glyphId: number
  /** Index into the caller's run array — groups per-material batches. */
  runIndex: number
  lineIndex: number
  /** Pen x (the glyph origin on the baseline), paragraph space. */
  x: number
  /**
   * The glyph's own advance (advanceWidth × size), EXCLUDING tracking and
   * kerning — Slug's TestData.advanceWidth. The gap up to the next
   * character's `x` is trailing spacing, which hit-testing assigns to this
   * character's trailing side (manual p241). Collapsed whitespace has 0.
   */
  advance: number
  hasOutline: boolean
}

/** One laid-out line; `charStart`/`charEnd` are half-open source indices. */
export interface SlugLine {
  index: number
  /** Left edge of the line's content after alignment, paragraph space. */
  x: number
  /** Top edge of the line box, paragraph space. */
  y: number
  /** Line box height (baseline-to-baseline distance to the next line). */
  height: number
  /** Alphabetic baseline, paragraph space (+y down — grows with `index`). */
  baselineY: number
  /** Visible width (trailing whitespace excluded). */
  width: number
  /** Max ascent of the line's runs — positive distance above the baseline. */
  ascent: number
  /** Max descent of the line's runs — positive distance below the baseline. */
  descent: number
  charStart: number
  charEnd: number
}

export interface SlugParagraph {
  style: SlugParagraphStyle
  /** Alignment extent: `style.maxWidth`, or the widest line without one. */
  width: number
  /** Block height: the sum of line heights. */
  height: number
  lines: readonly SlugLine[]
  characters: readonly SlugCharacter[]
}

/**
 * Hit-test result (TestSlug/TestData). `trailing` is true when the point
 * is past the glyph's midpoint — the caret an editor derives is
 * `charIndex + (trailing ? 1 : 0)`. `trailing`/`lineIndex` are the hooks
 * bidi dual carets and ligature sub-glyph carets extend without breakage.
 */
export interface SlugHit {
  charIndex: number
  lineIndex: number
  trailing: boolean
}

/** Caret geometry (LocateSlug/LocationData); ascent/descent are positive distances from the baseline. */
export interface SlugCaret {
  x: number
  baselineY: number
  ascent: number
  descent: number
  lineIndex: number
}

/** Selection geometry for one line — where, not how; panels are the consumer's job. */
export interface SlugSpan {
  lineIndex: number
  x0: number
  x1: number
  baselineY: number
  /** Positive distance above the baseline. */
  ascent: number
  /** Positive distance below the baseline. */
  descent: number
}
