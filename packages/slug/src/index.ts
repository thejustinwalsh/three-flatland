// @three-flatland/slug
// GPU-accelerated resolution-independent font rendering via the Slug algorithm

export { SlugFont } from './SlugFont'
export { SlugFontLoader } from './SlugFontLoader'
export { SlugFontStack } from './SlugFontStack'
export { SlugText } from './SlugText'
export { SlugStackText } from './SlugStackText'
export type { SlugStackTextOptions } from './SlugStackText'
export { SlugMaterial } from './SlugMaterial'
export { SlugStrokeMaterial } from './SlugStrokeMaterial'
export type { SlugStrokeMaterialOptions } from './SlugStrokeMaterial'
export { SlugGeometry } from './SlugGeometry'
export { SlugBatch, SlugBatchGeometry } from './SlugBatch'
export type {
  SlugBatchOptions,
  SlugBatchColor,
  SlugBatchInstanceOptions,
  SlugBatchGlyphOptions,
} from './SlugBatch'

// Vector shapes (SVG) — "a font whose glyphs are SVG paths"
export { SlugShapeSet } from './SlugShapeSet'
export type { SlugShapeHandle } from './SlugShapeSet'
export { SlugShapeBatch } from './SlugShapeBatch'
export type { SlugShapeBatchOptions, SlugShapeBatchWriteOptions } from './SlugShapeBatch'
export {
  parseSVG,
  registerSVG,
  loadSVGShapes,
  contoursFromShapePath,
  quadraticsFromCurve,
  DEFAULT_CURVE_TOLERANCE,
} from './svg/index'
export type {
  ParsedSVG,
  ParsedSVGFill,
  ParseSVGOptions,
  SVGViewBox,
  RegisteredSVG,
  ShapePathLike,
  CurveLike,
} from './svg/index'

export type {
  QuadCurve,
  QuadContour,
  SlugCurveSource,
  SlugGlyphSource,
  GlyphBounds,
  GlyphBands,
  Band,
  SlugGlyphData,
  SlugGlyphMetrics,
  PositionedGlyph,
  SlugTextureData,
  SlugTextOptions,
  TextMetrics,
  ParagraphMetrics,
  ParagraphLineMetrics,
  MeasureParagraphOptions,
  StyleSpan,
  DecorationRect,
  SlugOutlineOptions,
} from './types'

export type { SlugMaterialOptions } from './SlugMaterial'

export { bakedURLs } from './baked'
export type { BakedJSON } from './baked'

// Layout engine (measure / wrap / position) + geometric queries
export {
  normalizeWhitespace,
  resolveGlyphLayoutProperties,
  measureGlyphLayout,
  buildGlyphLayout,
  buildPositionedGlyphLayout,
  getTextXOffset,
  getTextYOffset,
  getEmBoxTopOffset,
  getLineBaselineOffset,
  getGlyphTopOffset,
  getGlyphMetricsWithFallback,
  getOffsetToNextGlyph,
  getKerningOffset,
  getGlyphOffsetX,
  getGlyphInkWidth,
  getOffsetToNextLine,
  getGlyphLayoutHeight,
  getWhitespaceWidth,
  WordWrapper,
  BreakallWrapper,
  NowrapWrapper,
  glyphWrappers,
} from './layout/index'
export type {
  BuildPositionedGlyphLayoutOptions,
  GlyphWrapper,
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
} from './layout/index'
export { getCharIndex, getCaretTransformation, getSelectionTransformations } from './query/index'
