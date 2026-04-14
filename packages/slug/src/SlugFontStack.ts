import type { SlugFont } from './SlugFont.js'

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
}
