// Slug layout engine — measure, wrap, and position text from SlugFont
// metrics alone. Ported from @pmndrs/uikit's text layout onto Slug's
// em-space, baseline-relative font contract. No uikit imports; usable by
// any consumer with a SlugFont (or a stubbed SlugLayoutFont).

export { normalizeWhitespace, resolveGlyphLayoutProperties } from './normalize'
export { measureGlyphLayout, buildGlyphLayout } from './measure'
export { buildPositionedGlyphLayout, getTextXOffset, getTextYOffset } from './positioned'
export type { BuildPositionedGlyphLayoutOptions } from './positioned'
export { getEmBoxTopOffset, getLineBaselineOffset, getGlyphTopOffset } from './baseline'
export {
  getGlyphMetricsWithFallback,
  getOffsetToNextGlyph,
  getKerningOffset,
  getGlyphOffsetX,
  getGlyphInkWidth,
  getOffsetToNextLine,
  getGlyphLayoutHeight,
  getWhitespaceWidth,
} from './utils'
export { WordWrapper, BreakallWrapper, NowrapWrapper, glyphWrappers } from './wrappers'
export type { GlyphWrapper } from './wrappers'
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
} from './types'
