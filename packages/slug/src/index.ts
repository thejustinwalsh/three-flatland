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

export type {
  QuadCurve,
  GlyphBounds,
  GlyphBands,
  Band,
  SlugGlyphData,
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
