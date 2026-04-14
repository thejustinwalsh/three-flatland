import { buildBands } from './bandBuilder.js'
import type { QuadCurve, GlyphBands, GlyphBounds, SlugGlyphData } from '../types.js'

/**
 * Shared curves → GPU-glyph pipeline. Takes em-space quadratic Beziers
 * + contour-start indices and produces a `SlugGlyphData`-shaped record
 * with computed bounds and spatial bands ready for texture packing.
 *
 * Used by:
 *  - `fontParser` (closed font contours, input from opentype.js)
 *  - `SlugShape.fromSvg` (closed or open SVG contours — Task 21)
 *  - `strokeOffsetter` output (baked stroke contours — Task 16)
 *
 * Factoring this out centralizes the "what's a GPU-ready glyph?"
 * contract so Phase 5's new producers don't each reinvent the bounds
 * + band computation + endpoint invariants. `glyphId`, `advanceWidth`,
 * and `lsb` are font-specific and left for the caller to fill in.
 */
export function buildGpuGlyphFromCurves(
  curves: QuadCurve[],
  contourStarts: number[],
): { curves: QuadCurve[]; contourStarts: number[]; bands: GlyphBands; bounds: GlyphBounds } {
  const bounds = computeBounds(curves)
  const bands = buildBands(curves, bounds)
  return { curves, contourStarts, bands, bounds }
}

/**
 * Build a full `SlugGlyphData` record for glyphs that *do* have outline
 * curves. Callers still fill in `glyphId`, `advanceWidth`, `lsb`, and
 * `bandLocation`/`curveLocation` (which get populated by the texture
 * packer after all glyphs have been collected).
 */
export function buildGpuGlyphData(
  glyphId: number,
  curves: QuadCurve[],
  contourStarts: number[],
  advanceWidthEm: number,
  lsbEm: number,
): SlugGlyphData {
  const gpu = buildGpuGlyphFromCurves(curves, contourStarts)
  return {
    glyphId,
    curves: gpu.curves,
    contourStarts: gpu.contourStarts,
    bands: gpu.bands,
    bounds: gpu.bounds,
    advanceWidth: advanceWidthEm,
    lsb: lsbEm,
    bandLocation: { x: 0, y: 0 },
    curveLocation: { x: 0, y: 0 },
  }
}

/**
 * Advance-only entry for cmap'd glyphs with no outline (space, tab,
 * zero-width controls). These must exist in the glyphs map so advance-
 * width lookups via `glyphs.get(id)` resolve — notably `shapeStackText`
 * uses this path for every char.
 */
export function buildAdvanceOnlyGlyph(
  glyphId: number,
  advanceWidthEm: number,
  lsbEm: number,
): SlugGlyphData {
  return {
    glyphId,
    curves: [],
    contourStarts: [],
    bands: { hBands: [], vBands: [] },
    bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
    bandLocation: { x: 0, y: 0 },
    curveLocation: { x: 0, y: 0 },
    advanceWidth: advanceWidthEm,
    lsb: lsbEm,
  }
}

/**
 * Bounding box of a set of quadratic Beziers. Includes all three
 * control points per curve — p1 can extend past the hull of p0/p2 when
 * the curve bulges outward. Tight bounds would require evaluating the
 * derivative-zero point per axis; this is correct-but-loose and matches
 * what the fill shader's band math already assumes.
 */
function computeBounds(curves: QuadCurve[]): GlyphBounds {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity
  for (const c of curves) {
    if (c.p0x < xMin) xMin = c.p0x
    if (c.p1x < xMin) xMin = c.p1x
    if (c.p2x < xMin) xMin = c.p2x
    if (c.p0x > xMax) xMax = c.p0x
    if (c.p1x > xMax) xMax = c.p1x
    if (c.p2x > xMax) xMax = c.p2x
    if (c.p0y < yMin) yMin = c.p0y
    if (c.p1y < yMin) yMin = c.p1y
    if (c.p2y < yMin) yMin = c.p2y
    if (c.p0y > yMax) yMax = c.p0y
    if (c.p1y > yMax) yMax = c.p1y
    if (c.p2y > yMax) yMax = c.p2y
  }
  return { xMin, yMin, xMax, yMax }
}
