// Slug layout engine — measure, wrap, and position text from SlugFont
// metrics alone. Ported from @pmndrs/uikit's text layout onto Slug's
// em-space, baseline-relative font contract. No uikit imports; usable by
// any consumer with a SlugFont (or a stubbed SlugLayoutFont).

export { normalizeWhitespace, resolveGlyphLayoutProperties } from './normalize.js'
export { measureGlyphLayout, buildGlyphLayout } from './measure.js'
export { buildPositionedGlyphLayout, getTextXOffset, getTextYOffset } from './positioned.js'
export type { BuildPositionedGlyphLayoutOptions } from './positioned.js'
export { getEmBoxTopOffset, getLineBaselineOffset, getGlyphTopOffset } from './baseline.js'
export {
  getGlyphMetricsWithFallback,
  getOffsetToNextGlyph,
  getKerningOffset,
  getGlyphOffsetX,
  getGlyphInkWidth,
  getOffsetToNextLine,
  getGlyphLayoutHeight,
  getWhitespaceWidth,
} from './utils.js'
export { WordWrapper, BreakallWrapper, NowrapWrapper, glyphWrappers } from './wrappers.js'
export type { GlyphWrapper } from './wrappers.js'
export type {
  WhiteSpace,
  WordBreak,
  TextAlign,
  VerticalAlign,
  SlugLayoutFont,
  SlugGlyphLayoutProperties,
  ResolvedGlyphLayoutProperties,
  GlyphLayoutLine,
  GlyphLayout,
  PositionedGlyphLayoutEntry,
  PositionedGlyphLayoutLine,
  PositionedGlyphLayout,
  CaretTransformation,
  SelectionTransformation,
} from './types.js'
