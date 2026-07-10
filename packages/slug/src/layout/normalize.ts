import type {
  ResolvedGlyphLayoutProperties,
  SlugGlyphLayoutProperties,
  WhiteSpace,
} from './types.js'

const collapseRegex = /[\t\n ]+/gm
const preLineCollapseNonLinefeedWhitespaceRegex = /[\t ]+/g
const preLineCollapseLinefeedRegex = /[\t ]*\n[\t ]*/gm
const preLineTrimNonLinefeedWhitespaceRegex = /^[ \t]+|[ \t]+$/g

/**
 * CSS-style whitespace normalization, applied to text before wrapping
 * (port of uikit `text/layout/normalize.ts`):
 * - `'pre'` — keep everything; tabs expand to `tabSize` spaces
 * - `'pre-line'` — collapse runs of spaces/tabs to one space, keep `\n`,
 *   trim spaces around line boundaries
 * - `'normal'` / `'collapse'` — collapse all whitespace (incl. `\n`) to
 *   single spaces and trim
 */
export function normalizeWhitespace(
  text: string,
  whiteSpace: WhiteSpace = 'normal',
  tabSize = 8
): string {
  switch (whiteSpace) {
    case 'pre':
      return text.replaceAll('\t', ' '.repeat(tabSize))
    case 'pre-line':
      return text
        .replaceAll(preLineCollapseNonLinefeedWhitespaceRegex, ' ')
        .replaceAll(preLineCollapseLinefeedRegex, '\n')
        .replaceAll(preLineTrimNonLinefeedWhitespaceRegex, '')
    default:
      return text.replaceAll(collapseRegex, ' ').trim()
  }
}

/**
 * Fill defaults, resolve `lineHeight` to absolute units, and normalize
 * `text`. Idempotent — resolved properties resolve to themselves.
 *
 * Defaults: `fontSize` 16, `letterSpacing` 0, `wordBreak` `'break-word'`,
 * `whiteSpace` `'normal'`, `tabSize` 8, `lineHeight`
 * `(ascender - descender) * fontSize` (the font's natural line box).
 */
export function resolveGlyphLayoutProperties(
  properties: SlugGlyphLayoutProperties
): ResolvedGlyphLayoutProperties {
  const {
    font,
    fontSize = 16,
    letterSpacing = 0,
    wordBreak = 'break-word',
    whiteSpace = 'normal',
    tabSize = 8,
  } = properties
  let lineHeight: number
  if (typeof properties.lineHeight === 'string') {
    lineHeight = (parseFloat(properties.lineHeight) / 100) * fontSize
  } else {
    lineHeight = properties.lineHeight ?? (font.ascender - font.descender) * fontSize
  }
  return {
    text: normalizeWhitespace(properties.text, whiteSpace, tabSize),
    font,
    fontSize,
    letterSpacing,
    lineHeight,
    wordBreak,
    whiteSpace,
    tabSize,
  }
}
