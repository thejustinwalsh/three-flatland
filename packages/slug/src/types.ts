import type { DataTexture, Vector2 } from 'three'

/** A quadratic Bezier curve defined by three control points in em-space. */
export interface QuadCurve {
  /** Start point */
  p0x: number
  p0y: number
  /** Control point */
  p1x: number
  p1y: number
  /** End point */
  p2x: number
  p2y: number
}

/** Bounding box in em-space. */
export interface GlyphBounds {
  xMin: number
  yMin: number
  xMax: number
  yMax: number
}

/** A single spatial band containing sorted curve references. */
export interface Band {
  /** Indices into the glyph's curve array, sorted by descending max coordinate. */
  curveIndices: number[]
}

/** Band acceleration structure for a single glyph. */
export interface GlyphBands {
  hBands: Band[]
  vBands: Band[]
}

/** Complete glyph data for GPU rendering. */
export interface SlugGlyphData {
  /** Glyph ID from the font */
  glyphId: number
  /** Quadratic Bezier curves defining the outline */
  curves: QuadCurve[]
  /** Spatial band acceleration structure */
  bands: GlyphBands
  /** Bounding box in em-space (normalized to unitsPerEm) */
  bounds: GlyphBounds
  /** Horizontal advance width in em-space */
  advanceWidth: number
  /** Left side bearing in em-space */
  lsb: number
  /** Location of this glyph's band data in the band texture (texel x, y) */
  bandLocation: { x: number; y: number }
  /** Location of this glyph's first curve in the curve texture (texel x, y) */
  curveLocation: { x: number; y: number }
}

/** A positioned glyph in a shaped text run. */
export interface PositionedGlyph {
  glyphId: number
  /** X position in object space */
  x: number
  /** Y position in object space */
  y: number
  /** Scale factor (fontSize / unitsPerEm) */
  scale: number
}

/** Packed GPU textures for all glyphs in a font. */
export interface SlugTextureData {
  /** RGBA32Float — Bezier control points (2 texels per curve) */
  curveTexture: DataTexture
  /** RG32Uint — Band headers + curve reference lists */
  bandTexture: DataTexture
  /** Width of the textures in texels */
  textureWidth: number
}

/** Options for SlugText construction. All optional for R3F compatibility. */
export interface SlugTextOptions {
  font?: import('./SlugFont.js').SlugFont
  text?: string
  fontSize?: number
  color?: number
  opacity?: number
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  maxWidth?: number
  evenOdd?: boolean
  weightBoost?: boolean
}
