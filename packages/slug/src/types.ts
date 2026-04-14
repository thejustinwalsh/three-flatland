import type { Color, DataTexture, Vector2 } from 'three'

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
  /** Start index of each contour in the curves array (for endpoint sharing) */
  contourStarts: number[]
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
  /**
   * Index of the source character (UTF-16 code unit in the original text)
   * this glyph was shaped from. Used by decoration / rich-text passes to
   * map back to per-character style spans without having to re-derive the
   * mapping from char-walk + filter.
   */
  srcCharIndex: number
}

/**
 * Character range with style applied. Ranges are half-open: `[start, end)`
 * in code-point offsets. When ranges overlap, decoration booleans OR
 * together; for `scriptLevel` the most recent matching span wins (matches
 * Slug's `script(n)` directive semantics where each call replaces state).
 *
 * - `underline` / `strike` draw a filled horizontal stroke through/below
 *   the run, positioned per the font's declared `underlinePosition` /
 *   `strikethroughPosition` (see `SlugFont`).
 * - `scriptLevel` follows Slug's manual §2.7 `script(n)` rule: positive =
 *   superscript, negative = subscript, magnitude in `[1, 3]` is the depth
 *   (transform applied n times). 0 / undefined = none.
 */
export interface StyleSpan {
  start: number
  end: number
  underline?: boolean
  strike?: boolean
  /** Slug's script(n) level: positive = super, negative = sub. Clamped to [-3, 3]. */
  scriptLevel?: number
}

/**
 * Rectangle primitive emitted by the shaper for underline / strike
 * decorations. Positioned in object-space like a glyph; the renderer
 * draws it as a solid-fill rect via the shader's rect-sentinel path.
 */
export interface DecorationRect {
  /** Center x, y in object space */
  x: number
  y: number
  /** Rectangle width and height in object space */
  width: number
  height: number
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
  /** Stem darkening strength. 0 = off, ~0.4 = subtle. Boosts thin strokes at small sizes. */
  stemDarken?: number
  /** Thickening strength. 0 = off, ~1.5 = default. Widens coverage at low ppem. */
  thicken?: number
  /** Enable 2x2 supersampling (expensive). */
  supersample?: boolean
  /** Snap glyph positions to pixel grid. Default true. */
  pixelSnap?: boolean
  /** Style spans (underline / strike / sub-super) applied to character ranges. */
  styles?: readonly StyleSpan[]
  /**
   * Optional outline. Renders a child stroke mesh behind the fill with
   * runtime-uniform half-width. Pass `{ width: 0.025, color: 0x000000 }`
   * for a thin black outline. Phase 5 extends this with `join` and
   * `miterLimit` for explicit miter geometry; until then, exterior
   * corners render as bevels via `min(distance)` — crisp for text at
   * typical sizes and widths.
   */
  outline?: SlugOutlineOptions
}

export interface SlugOutlineOptions {
  /** Stroke half-width in em-space. Default 0.025 (≈5% em total width). */
  width?: number
  /**
   * Stroke color. Accepts anything three.js's `Color` ingests: number
   * (hex), CSS string (`'#ff0000'`, `'red'`), or a `Color` instance.
   * Default 0x000000.
   */
  color?: number | string | Color
}

/**
 * Text metrics for a single, unwrapped line. Shape mirrors the subset of the
 * browser's `CanvasRenderingContext2D` `TextMetrics` interface that can be
 * computed cheaply from font outlines plus glyph bounds.
 *
 * Units are in the same object-space the caller supplies `fontSize` in —
 * typically pixels at `fontSize` px.
 */
export interface TextMetrics {
  /** Horizontal advance of the shaped line. */
  width: number
  /** Tight inked bounds, measured from the starting pen position. */
  actualBoundingBoxLeft: number
  actualBoundingBoxRight: number
  actualBoundingBoxAscent: number
  actualBoundingBoxDescent: number
  /** Font-level ascent/descent for `fontSize`, independent of the glyphs present. */
  fontBoundingBoxAscent: number
  fontBoundingBoxDescent: number
}

export interface MeasureParagraphOptions {
  /** Max width before word-wrap kicks in. Omit for no wrapping. */
  maxWidth?: number
  /** Line-height multiplier of fontSize. Defaults to 1.2 — matches SlugText's default so measured height aligns with what the shaper renders. */
  lineHeight?: number
}

export interface ParagraphLineMetrics {
  /** The shaped line text (as produced by the wrap policy). */
  text: string
  /** Line's advance width. */
  width: number
}

/**
 * Metrics for a wrapped block of text. Accepts the same wrap/line-height
 * semantics as `SlugText` so `measureParagraph` results agree with rendering
 * by construction.
 */
export interface ParagraphMetrics {
  /** Widest line's advance width. Never greater than `maxWidth`. */
  width: number
  /** Total block height = `lines.length * fontSize * lineHeight`. */
  height: number
  lines: ParagraphLineMetrics[]
  /** Font-level ascent/descent for `fontSize` — useful for positioning the first baseline. */
  fontBoundingBoxAscent: number
  fontBoundingBoxDescent: number
}
