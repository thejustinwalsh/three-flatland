// @three-flatland/slug
// GPU-accelerated resolution-independent font rendering via the Slug algorithm

export { SlugFont } from './SlugFont.js'
export { SlugFontLoader } from './SlugFontLoader.js'
export { SlugText } from './SlugText.js'
export { SlugMaterial } from './SlugMaterial.js'
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
} from './types.js'

export type { SlugMaterialOptions } from './SlugMaterial.js'

export { bakedURLs, BAKED_VERSION } from './baked.js'
export type { BakedJSON } from './baked.js'
