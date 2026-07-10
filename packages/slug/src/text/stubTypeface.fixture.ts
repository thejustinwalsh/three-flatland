// Test-only fixture — deliberately NOT exported from any barrel.

import type { SlugGlyphMetrics } from '../types.js'
import type { SlugTypeface } from './types.js'

export interface StubTypefaceOptions {
  /** Advance (em) per char. Chars absent from the map are unmapped. */
  advances?: Record<string, number>
  /** Kerning (em) keyed `"a/b"` by CHAR pair (glyph ids are char codes). */
  kerning?: Record<string, number>
  ascender?: number
  descender?: number
}

/**
 * Deterministic metrics-only typeface for engine tests: glyph id = char
 * code, ink box `[0.05, advance - 0.05] × [0, 0.7]`, spaces inkless.
 * Hand-computing expected positions stays trivial: advance × fontSize.
 */
export function createStubTypeface(options: StubTypefaceOptions = {}): SlugTypeface {
  const { advances = {}, kerning = {}, ascender = 0.8, descender = -0.2 } = options
  const advanceFor = (char: string): number | undefined =>
    advances[char] ?? (/^[a-z ]$/.test(char) ? 0.5 : undefined)

  return {
    unitsPerEm: 1000,
    ascender,
    descender,
    getGlyphMetrics(codePoint: number): SlugGlyphMetrics | undefined {
      const char = String.fromCharCode(codePoint)
      const advanceWidth = advanceFor(char)
      if (advanceWidth === undefined) return undefined
      const hasOutline = char !== ' '
      return {
        glyphId: codePoint,
        advanceWidth,
        lsb: hasOutline ? 0.05 : 0,
        bounds: hasOutline
          ? { xMin: 0.05, yMin: 0, xMax: advanceWidth - 0.05, yMax: 0.7 }
          : { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
        hasOutline,
      }
    },
    getKerning(a: number, b: number): number {
      return kerning[`${String.fromCharCode(a)}/${String.fromCharCode(b)}`] ?? 0
    },
  }
}
