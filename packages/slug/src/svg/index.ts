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
 * are pure fills by construction — with an explicit `fill="black"` on
 * every path (the fixer's stand-in for `currentColor`). Fills are
 * reported FAITHFULLY: lucide icons parse black, exactly as a browser
 * renders the files. Consumers tint by replacing the per-instance color
 * (`writeShape`'s `color`), the same way upstream uikit replaces material
 * color on icons — never by assuming icon fills are white. Matching
 * upstream uikit's `Svg` behavior, paths are still emitted when `fill`
 * resolves to `none`; only those default to white. Fill-rule is captured
 * per path but applied batch-level in v1 (`material: { evenOdd }` on
 * `SlugShapeBatch`).
 */

export {
  parseSVG,
  contoursFromShapePath,
  quadraticsFromCurve,
  DEFAULT_CURVE_TOLERANCE,
} from './parseSVG.js'
export type {
  ParsedSVG,
  ParsedSVGFill,
  ParseSVGOptions,
  SVGViewBox,
  ShapePathLike,
  CurveLike,
} from './parseSVG.js'
export { registerSVG, loadSVGShapes } from './loadSVG.js'
export type { RegisteredSVG } from './loadSVG.js'
export { iconFromBaked, iconNamesFromBaked } from './bakedIcons.js'
export type { BakedIconEntry, BakedIconsMeta } from './bakedIcons.js'
