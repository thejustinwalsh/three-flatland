import type { SlugGlyphMetrics } from '../types'
import type { SlugLayoutFont } from './types'

export interface StubFontOptions {
  /** Advance (em) per char. Chars absent from the map are unmapped. */
  advances?: Record<string, number>
  /** Kerning (em) keyed `"a/b"` by CHAR pair (glyph ids are char codes). */
  kerning?: Record<string, number>
  ascender?: number
  descender?: number
}

/**
 * Deterministic metrics-only font for layout tests: glyph id = char code,
 * ink box `[xMin 0.05, xMax advance - 0.05] × [0, 0.7]`, spaces inkless.
 * Hand-computing expected positions stays trivial: advance × fontSize.
 */
export function createStubFont(options: StubFontOptions = {}): SlugLayoutFont {
  const { advances = {}, kerning = {}, ascender = 0.8, descender = -0.2 } = options
  const advanceFor = (char: string): number | undefined =>
    advances[char] ?? (/^[a-z ]$/.test(char) ? 0.5 : undefined)

  return {
    ascender,
    descender,
    getGlyphMetricsForChar(char: string): SlugGlyphMetrics | undefined {
      const advanceWidth = advanceFor(char)
      if (advanceWidth === undefined) return undefined
      const hasOutline = char !== ' '
      return {
        glyphId: char.charCodeAt(0),
        advanceWidth,
        lsb: hasOutline ? 0.05 : 0,
        bounds: hasOutline
          ? { xMin: 0.05, yMin: 0, xMax: advanceWidth - 0.05, yMax: 0.7 }
          : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
        hasOutline,
      }
    },
    getKerning(glyphIdA: number, glyphIdB: number): number {
      return kerning[`${String.fromCharCode(glyphIdA)}/${String.fromCharCode(glyphIdB)}`] ?? 0
    },
  }
}
