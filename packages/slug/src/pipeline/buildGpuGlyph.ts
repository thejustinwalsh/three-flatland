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
  contourStarts: number[]
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
  lsbEm: number
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
  lsbEm: number
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
 * Tight bounding box of a set of quadratic Beziers — the exact ink
 * extent, not the p0/p1/p2 control hull.
 *
 * A quadratic B(t) = (1-t)²·p0 + 2(1-t)t·p1 + t²·p2 never reaches its
 * control point p1, so folding p1 into the bounds over-sizes the glyph
 * quad and rasterizes empty fragments (overdraw). Per axis the curve's
 * extremum sits where B'(t) = 0, i.e. t* = (p0-p1)/(p0-2p1+p2); the
 * bound is the min/max over {p0, p2, and B(t*) when t* ∈ (0,1)}. Because
 * B(t*) always lies between the p0/p2 hull and the p1-inclusive hull,
 * this is a strictly VALID bound (it still contains every point of the
 * curve, never clips ink) that is never larger than the old p1 bound.
 *
 * The half-pixel AA skirt is added on top of this in the vertex shader
 * (`slugDilate`, screen-space), so tightening here shrinks only the
 * empty margin — the rendered ink + AA is unchanged.
 */
function computeBounds(curves: QuadCurve[]): GlyphBounds {
  const x = { min: Infinity, max: -Infinity }
  const y = { min: Infinity, max: -Infinity }
  for (const c of curves) {
    extendAxisBounds(c.p0x, c.p1x, c.p2x, x)
    extendAxisBounds(c.p0y, c.p1y, c.p2y, y)
  }
  return { xMin: x.min, yMin: y.min, xMax: x.max, yMax: y.max }
}

/**
 * Fold one quadratic segment's exact per-axis extent into `acc`. The
 * endpoints p0/p2 are always on the curve; the interior extremum at
 * t* = (p0-p1)/(p0-2p1+p2) is included only when it lands in the open
 * interval (0,1) — otherwise the curve is monotone on this axis and the
 * endpoints already bound it. A zero denominator means the axis is
 * linear (p1 is the p0/p2 midpoint), so there is no interior extremum.
 */
function extendAxisBounds(
  p0: number,
  p1: number,
  p2: number,
  acc: { min: number; max: number }
): void {
  if (p0 < acc.min) acc.min = p0
  if (p0 > acc.max) acc.max = p0
  if (p2 < acc.min) acc.min = p2
  if (p2 > acc.max) acc.max = p2

  const denom = p0 - 2 * p1 + p2
  if (denom !== 0) {
    const t = (p0 - p1) / denom
    if (t > 0 && t < 1) {
      const mt = 1 - t
      const ext = mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
      if (ext < acc.min) acc.min = ext
      if (ext > acc.max) acc.max = ext
    }
  }
}
