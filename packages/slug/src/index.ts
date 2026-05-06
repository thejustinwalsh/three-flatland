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
} from './types'

export type { SlugMaterialOptions } from './SlugMaterial'

export { bakedURLs } from './baked'
export type { BakedJSON } from './baked'
