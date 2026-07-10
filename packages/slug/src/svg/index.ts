/**
 * `slug/svg` — SVG path data → `SlugShapeSet` shapes.
 *
 * Uses three's `SVGLoader.parse` **as a parser only** (no `createShapes`
 * tessellation): transforms are already flattened by the loader, each
 * subpath's curves are converted to quadratics through the shared
 * converter core (`cubicToQuadraticsAdaptive` — the same De Casteljau +
 * best-fit-quadratic math the font parser uses, wrapped in adaptive
 * recursion for arbitrary-curvature SVG cubics), and contours are handed
 * to the existing band builder via `SlugShapeSet.registerShape`.
 *
 * v1 supports fills only. The lucide pipeline runs `oslllo-svg-fixer` at
 * build time, converting all strokes to closed filled outlines, so icons
 * are pure fills by construction. Matching upstream uikit's `Svg`
 * behavior, paths are emitted even when `fill` resolves to `none`
 * (stroke-to-fill outlines typically inherit `fill="none"` from the svg
 * root); their fill color defaults to white so a consumer tint works.
 * Fill-rule is captured per path but applied batch-level v1
 * (`material: { evenOdd }` on `SlugShapeBatch`).
 */

export {
  parseSVG,
  contoursFromShapePath,
  quadraticsFromCurve,
  DEFAULT_CURVE_TOLERANCE,
} from './parseSVG'
export type {
  ParsedSVG,
  ParsedSVGFill,
  ParseSVGOptions,
  SVGViewBox,
  ShapePathLike,
  CurveLike,
} from './parseSVG'
export { registerSVG, loadSVGShapes } from './loadSVG'
export type { RegisteredSVG } from './loadSVG'
