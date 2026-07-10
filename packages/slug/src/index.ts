// @three-flatland/slug
// GPU-accelerated resolution-independent font rendering via the Slug algorithm

export { SlugFont } from './SlugFont.js'
export { SlugFontLoader } from './SlugFontLoader.js'
export { SlugFontStack } from './SlugFontStack.js'
export { SlugText } from './SlugText.js'
export { SlugStackText } from './SlugStackText.js'
export type { SlugStackTextOptions } from './SlugStackText.js'
export { SlugMaterial } from './SlugMaterial.js'
export { SlugStrokeMaterial } from './SlugStrokeMaterial.js'
export type { SlugStrokeMaterialOptions } from './SlugStrokeMaterial.js'
export { SlugGeometry } from './SlugGeometry.js'
export { SlugBatch, SlugBatchGeometry } from './SlugBatch.js'
export type {
  SlugBatchOptions,
  SlugBatchColor,
  SlugBatchInstanceOptions,
  SlugBatchGlyphOptions,
} from './SlugBatch.js'

// Vector shapes (SVG) — "a font whose glyphs are SVG paths"
export { SlugShapeSet } from './SlugShapeSet.js'
export type { SlugShapeHandle } from './SlugShapeSet.js'
export { SlugShapeBatch } from './SlugShapeBatch.js'
export type { SlugShapeBatchOptions, SlugShapeBatchWriteOptions } from './SlugShapeBatch.js'
export {
  parseSVG,
  registerSVG,
  loadSVGShapes,
  contoursFromShapePath,
  quadraticsFromCurve,
  DEFAULT_CURVE_TOLERANCE,
} from './svg/index.js'
export type {
  ParsedSVG,
  ParsedSVGFill,
  ParseSVGOptions,
  SVGViewBox,
  RegisteredSVG,
  ShapePathLike,
  CurveLike,
} from './svg/index.js'

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
} from './types.js'

export type { SlugMaterialOptions } from './SlugMaterial.js'

export { bakedURLs } from './baked.js'
export type { BakedJSON } from './baked.js'

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
} from './layout/index.js'
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
} from './layout/index.js'
export { getCharIndex, getCaretTransformation, getSelectionTransformations } from './query/index.js'
