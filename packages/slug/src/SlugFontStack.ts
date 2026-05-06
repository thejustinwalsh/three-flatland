import { wrapLinesStack } from './pipeline/wrapLinesStack'
import { emitDecorations as emitDecorationsCore } from './pipeline/decorations'
import type { SlugFont } from './SlugFont'
import type { DecorationRect, PositionedGlyph, StyleSpan } from './types'

/**
 * Ordered chain of fonts used by `SlugText` for per-codepoint glyph
 * fallback. Mirrors Slug manual §4.6 (font-map fallback): for each
 * codepoint we walk the chain and use the first font whose cmap maps
 * it to a non-notdef glyph.
 *
 * Distinct from rich-text font runs (Phase 6): a stack is *automatic*
 * per-codepoint resolution, applied to a single logical text. Authors
 * never tag runs — the stack picks for them.
 *
 * All fonts must be explicitly loaded via `SlugFontLoader`. There is no
 * system-font access in the browser, and Slug's reference doesn't do
 * that either — fallback chains are caller-supplied.
 *
 * @example
 * ```ts
 * const inter = await SlugFontLoader.load('/fonts/Inter-Regular.ttf')
 * const emoji = await SlugFontLoader.load('/fonts/NotoEmoji-Regular.ttf')
 * const stack = new SlugFontStack([inter, emoji])
 * const text = new SlugText({ font: stack, text: 'Hi 😀' })
 * ```
 */
export class SlugFontStack {
  readonly fonts: readonly SlugFont[]

  constructor(fonts: readonly SlugFont[]) {
    if (fonts.length === 0) {
      throw new Error('SlugFontStack: at least one font is required')
    }
    this.fonts = fonts
  }

  /**
   * Return the index of the first font in the chain that has a glyph for
   * `charCode`, or 0 if no font in the chain covers it. Index 0 acts as
   * the always-present fallback because it's the primary font and its
   * notdef rectangle is the visual signal of an unmapped character.
   */
  resolveCodepoint(charCode: number): number {
    for (let i = 0; i < this.fonts.length; i++) {
      if (this.fonts[i]!.hasCharCode(charCode)) return i
    }
    return 0
  }

  /**
   * Walk a string and return per-character font assignments. Length
   * matches `text.length`. The result drives the per-font shaping pass
   * and one InstancedMesh child per font.
   */
  resolveText(text: string): Uint8Array {
    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) {
      out[i] = this.resolveCodepoint(text.charCodeAt(i))
    }
    return out
  }

  /** The primary font — used for default metrics (line-height, etc.). */
  get primary(): SlugFont {
    return this.fonts[0]!
  }

  /**
   * Wrap `text` into lines using the stack's per-codepoint font
   * resolution + advance widths. Mirrors `SlugFont.wrapText` but chooses
   * the right font per char, so breaks stay consistent with what
   * `SlugStackText` will actually render — essential for external
   * reference renderers (Canvas2D overlays) that need line-for-line
   * agreement with the shaped output.
   */
  wrapText(text: string, fontSize: number, maxWidth?: number): string[] {
    return wrapLinesStack(this, text, fontSize, maxWidth)
  }

  /**
   * Emit underline / strike decoration rects for a stack-shaped text.
   * Takes the flat combined list of positioned glyphs (sorted by
   * `srcCharIndex`) plus a per-glyph font-index lookup, and consults
   * the *primary* font's decoration metrics — line position and
   * thickness should look consistent across a styled run even when
   * individual chars come from different fonts in the stack.
   *
   * The per-glyph advance lookup picks the correct font per glyph
   * (the same glyphId can live in two fonts with different advances,
   * which a single-font Map key can't disambiguate).
   */
  emitDecorations(
    text: string,
    positioned: readonly PositionedGlyph[],
    glyphFontIdx: readonly number[],
    styles: readonly StyleSpan[],
    fontSize: number
  ): DecorationRect[] {
    const primary = this.primary
    // Build an index from each positioned glyph object to its font.
    // The array is parallel to `positioned` — same order, same length.
    const fontByGlyph = new WeakMap<PositionedGlyph, SlugFont>()
    for (let i = 0; i < positioned.length; i++) {
      fontByGlyph.set(positioned[i]!, this.fonts[glyphFontIdx[i]!]!)
    }
    return emitDecorationsCore(
      text,
      positioned,
      styles,
      fontSize,
      {
        underlinePosition: primary.underlinePosition,
        underlineThickness: primary.underlineThickness,
        strikethroughPosition: primary.strikethroughPosition,
        strikethroughThickness: primary.strikethroughThickness,
      },
      (pg) => fontByGlyph.get(pg)?.glyphs.get(pg.glyphId)?.advanceWidth ?? 0
    )
  }
}
