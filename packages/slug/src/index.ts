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
export { SlugShapeSetLoader } from './SlugShapeSetLoader.js'
export {
  parseSVG,
  registerSVG,
  loadSVGShapes,
  contoursFromShapePath,
  quadraticsFromCurve,
  DEFAULT_CURVE_TOLERANCE,
  iconFromBaked,
  iconNamesFromBaked,
} from './svg/index.js'
export type {
  ParsedSVG,
  ParsedSVGFill,
  ParseSVGOptions,
  SVGViewBox,
  RegisteredSVG,
  ShapePathLike,
  CurveLike,
  BakedIconEntry,
  BakedIconsMeta,
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

// Baseline conversion — CSS's line-box model over Slug's baseline-relative
// metrics, the package's single copy (see layout/baseline.ts).
// Consumed by @three-flatland/uikit (getGlyphTopOffset, getHalfLeading)
// and by the `slug/text` engine. The full run-based text engine lives at
// the './text' subpath, not here — Slug's rendering surface and its text
// engine are separate domains.
export { getHalfLeading, getLineBaselineOffset, getGlyphTopOffset } from './layout/baseline.js'
