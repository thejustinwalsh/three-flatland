import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import type { Vector2 } from 'three'
import { cubicToQuadraticsAdaptive, lineToQuadratic } from '../pipeline/fontParser'
import type { QuadContour, QuadCurve } from '../types'
import type { SlugBatchColor } from '../SlugBatch'

/**
 * Default adaptive-subdivision tolerance: 0.25% of the (normalized)
 * viewBox diagonal. `parseSVG` normalizes shapes so the viewBox's longer
 * side maps to 1, making the normalized diagonal `√(w² + h²) / max(w, h)`.
 */
export const DEFAULT_CURVE_TOLERANCE_RATIO = 0.0025

/** Resolved default tolerance for a square viewBox (diagonal = √2). */
export const DEFAULT_CURVE_TOLERANCE = DEFAULT_CURVE_TOLERANCE_RATIO * Math.SQRT2

/**
 * Bowing-epsilon scale for `lineToQuadratic` in normalized shape space —
 * equivalent in magnitude to a font's `1 / unitsPerEm`.
 */
const LINE_EPSILON_SCALE = 1 / 1024

/** Curves within this distance close a contour without an extra segment. */
const CLOSE_EPSILON = 1e-6

/** SVG viewBox rectangle (SVG coordinates, y-down). */
export interface SVGViewBox {
  minX: number
  minY: number
  width: number
  height: number
}

/** Per-path fill info captured from the SVG. */
export interface ParsedSVGFill {
  /**
   * Fill color with `fillOpacity` folded into alpha. White when the path's
   * `fill` resolves to `none` (see module doc — matches upstream uikit, so
   * consumer tints keep working on stroke-to-fill icon pipelines).
   */
  color: SlugBatchColor
  /** The path's declared fill rule. Applied batch-level in v1. */
  rule: 'nonzero' | 'evenodd'
}

/** Output of `parseSVG` — parallel `shapes` / `fills` arrays, per painted path. */
export interface ParsedSVG {
  /**
   * One entry per SVG path: its closed contours in normalized shape space —
   * the viewBox mapped into `[0, w·s] × [0, h·s]` with `s = 1/max(w, h)`
   * (longer side = 1, aspect preserved) and **y flipped to point up**.
   */
  shapes: QuadContour[][]
  /** Fill color + rule for each entry of `shapes`. */
  fills: ParsedSVGFill[]
  viewBox: SVGViewBox
}

export interface ParseSVGOptions {
  /**
   * Adaptive cubic→quadratic tolerance in NORMALIZED shape space.
   * Default: 0.25% of the normalized viewBox diagonal.
   */
  tolerance?: number
  /** Adaptive recursion depth cap. Default 10 (≤ 1024 quads per cubic). */
  maxDepth?: number
}

/**
 * Structural slice of a three `Curve<Vector2>` — everything
 * `quadraticsFromCurve` reads. Lets tests build curves without DOM.
 */
export interface CurveLike {
  isLineCurve?: boolean
  isQuadraticBezierCurve?: boolean
  isCubicBezierCurve?: boolean
  isEllipseCurve?: boolean
  v0?: Vector2
  v1?: Vector2
  v2?: Vector2
  v3?: Vector2
  aStartAngle?: number
  aEndAngle?: number
  getPoint(t: number): Vector2
}

/** Structural slice of a three `ShapePath` — what `contoursFromShapePath` reads. */
export interface ShapePathLike {
  subPaths: Array<{ curves: CurveLike[] }>
  color?: { r: number; g: number; b: number }
  userData?: { style?: { fill?: string; fillOpacity?: number; fillRule?: string } } | null
}

/** Affine point map applied to every emitted coordinate. */
type PointMap = (x: number, y: number) => [number, number]

const IDENTITY_MAP: PointMap = (x, y) => [x, y]

interface Cubic {
  x0: number
  y0: number
  c1x: number
  c1y: number
  c2x: number
  c2y: number
  x3: number
  y3: number
}

/**
 * Convert one three.js curve to quadratics, appending to `out`. The affine
 * `map` (normalization + y-flip) is applied to control points BEFORE the
 * adaptive fit, so `tolerance` is measured in the mapped space. Ellipses
 * (SVG arcs, circles, rounded rects) and any unrecognized curve type go
 * through cubic-Hermite segmentation over `getPoint` — smooth, not
 * polyline sampling — then the same adaptive converter.
 */
export function quadraticsFromCurve(
  curve: CurveLike,
  map: PointMap = IDENTITY_MAP,
  tolerance: number = DEFAULT_CURVE_TOLERANCE,
  maxDepth = 10,
  out: QuadCurve[] = []
): QuadCurve[] {
  if (curve.isLineCurve && curve.v1 && curve.v2) {
    const [x0, y0] = map(curve.v1.x, curve.v1.y)
    const [x1, y1] = map(curve.v2.x, curve.v2.y)
    pushLine(x0, y0, x1, y1, out)
    return out
  }

  if (curve.isQuadraticBezierCurve && curve.v0 && curve.v1 && curve.v2) {
    const [p0x, p0y] = map(curve.v0.x, curve.v0.y)
    const [p1x, p1y] = map(curve.v1.x, curve.v1.y)
    const [p2x, p2y] = map(curve.v2.x, curve.v2.y)
    out.push({ p0x, p0y, p1x, p1y, p2x, p2y })
    return out
  }

  if (curve.isCubicBezierCurve && curve.v0 && curve.v1 && curve.v2 && curve.v3) {
    const [x0, y0] = map(curve.v0.x, curve.v0.y)
    const [c1x, c1y] = map(curve.v1.x, curve.v1.y)
    const [c2x, c2y] = map(curve.v2.x, curve.v2.y)
    const [x3, y3] = map(curve.v3.x, curve.v3.y)
    cubicToQuadraticsAdaptive(x0, y0, c1x, c1y, c2x, c2y, x3, y3, tolerance, maxDepth, out)
    return out
  }

  // Ellipse arcs + unknown curve types: cubic-Hermite segments over
  // getPoint with central-difference derivatives, then adaptive fit.
  let segments = 16
  if (curve.isEllipseCurve && curve.aStartAngle !== undefined && curve.aEndAngle !== undefined) {
    const sweep = Math.abs(curve.aEndAngle - curve.aStartAngle)
    segments = Math.max(2, Math.ceil(sweep / (Math.PI / 4)))
  }
  for (const cubic of hermiteCubics(curve, segments, map)) {
    cubicToQuadraticsAdaptive(
      cubic.x0,
      cubic.y0,
      cubic.c1x,
      cubic.c1y,
      cubic.c2x,
      cubic.c2y,
      cubic.x3,
      cubic.y3,
      tolerance,
      maxDepth,
      out
    )
  }
  return out
}

/** Skip zero-length segments (would NaN the bowing normal). */
function pushLine(x0: number, y0: number, x1: number, y1: number, out: QuadCurve[]): void {
  const dx = x1 - x0
  const dy = y1 - y0
  if (Math.sqrt(dx * dx + dy * dy) < CLOSE_EPSILON) return
  out.push(lineToQuadratic(x0, y0, x1, y1, LINE_EPSILON_SCALE))
}

/**
 * Cubic-Hermite segmentation of a parametric curve: for each parameter
 * span, endpoints + derivatives (central difference) define a cubic with
 * O(h⁴) error — smooth curvature, unlike polyline sampling.
 */
function* hermiteCubics(curve: CurveLike, segments: number, map: PointMap): Generator<Cubic> {
  const eps = 1e-5
  const point = (t: number): [number, number] => {
    const p = curve.getPoint(t)
    return map(p.x, p.y)
  }
  const derivative = (t: number): [number, number] => {
    const t0 = Math.max(0, t - eps)
    const t1 = Math.min(1, t + eps)
    const [ax, ay] = point(t0)
    const [bx, by] = point(t1)
    const inv = 1 / (t1 - t0)
    return [(bx - ax) * inv, (by - ay) * inv]
  }
  const h = 1 / segments
  for (let i = 0; i < segments; i++) {
    const ta = i * h
    const tb = (i + 1) * h
    const [x0, y0] = point(ta)
    const [x3, y3] = point(tb)
    const [dax, day] = derivative(ta)
    const [dbx, dby] = derivative(tb)
    // Hermite → Bezier: c1 = p0 + m0/3, c2 = p1 − m1/3, m = dP/dt · h
    yield {
      x0,
      y0,
      c1x: x0 + (dax * h) / 3,
      c1y: y0 + (day * h) / 3,
      c2x: x3 - (dbx * h) / 3,
      c2y: y3 - (dby * h) / 3,
      x3,
      y3,
    }
  }
}

/**
 * Convert one `ShapePath`'s subpaths into closed contours, applying `map`
 * to every point. Contours whose ends don't meet are closed with a line —
 * Slug's winding evaluation requires closed contours.
 */
export function contoursFromShapePath(
  path: ShapePathLike,
  map: PointMap = IDENTITY_MAP,
  tolerance: number = DEFAULT_CURVE_TOLERANCE,
  maxDepth = 10
): QuadContour[] {
  const contours: QuadContour[] = []
  for (const subPath of path.subPaths) {
    const contour: QuadCurve[] = []
    for (const curve of subPath.curves) {
      quadraticsFromCurve(curve, map, tolerance, maxDepth, contour)
    }
    if (contour.length === 0) continue
    const first = contour[0]!
    const last = contour[contour.length - 1]!
    pushLine(last.p2x, last.p2y, first.p0x, first.p0y, contour)
    contours.push(contour)
  }
  return contours
}

/** Fill color + rule from a parsed path's style (see `ParsedSVGFill`). */
function fillFromPath(path: ShapePathLike): ParsedSVGFill {
  const style = path.userData?.style
  const painted = style?.fill !== undefined && style.fill !== 'none'
  const opacity = style?.fillOpacity ?? 1
  const color: SlugBatchColor =
    painted && path.color
      ? { r: path.color.r, g: path.color.g, b: path.color.b, a: opacity }
      : { r: 1, g: 1, b: 1, a: opacity }
  return { color, rule: style?.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' }
}

/** Read the viewBox (or width/height fallback) off the parsed `<svg>` root. */
function readViewBox(xml: Element): SVGViewBox {
  const vb = xml
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map((v) => Number.parseFloat(v))
    .filter((v) => !Number.isNaN(v))
  if (vb?.length === 4) {
    return { minX: vb[0]!, minY: vb[1]!, width: vb[2]!, height: vb[3]! }
  }
  const width = Number.parseFloat(xml.getAttribute('width') ?? '')
  const height = Number.parseFloat(xml.getAttribute('height') ?? '')
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { minX: 0, minY: 0, width, height }
  }
  throw new Error('parseSVG: svg has neither a usable viewBox nor width/height')
}

/**
 * Parse SVG markup into normalized shape contours + fills, ready for
 * `SlugShapeSet.registerShape` (see `registerSVG` for the one-liner).
 * Requires a DOM (`DOMParser`) — browser, or a DOM shim under Node.
 */
export function parseSVG(svgText: string, options: ParseSVGOptions = {}): ParsedSVG {
  const { paths, xml } = new SVGLoader().parse(svgText)
  // @types/three declares `xml: XMLDocument`, but the runtime value is the
  // root `<svg>` element (`xml.documentElement`) — same cast upstream uikit makes.
  const viewBox = readViewBox(xml as unknown as Element)

  const s = 1 / Math.max(viewBox.width, viewBox.height)
  const map: PointMap = (x, y) => [(x - viewBox.minX) * s, (viewBox.minY + viewBox.height - y) * s]

  const diag = Math.sqrt(viewBox.width ** 2 + viewBox.height ** 2) * s
  const tolerance = options.tolerance ?? DEFAULT_CURVE_TOLERANCE_RATIO * diag
  const maxDepth = options.maxDepth ?? 10

  const shapes: QuadContour[][] = []
  const fills: ParsedSVGFill[] = []
  for (const path of paths as unknown as ShapePathLike[]) {
    const contours = contoursFromShapePath(path, map, tolerance, maxDepth)
    if (contours.length === 0) continue
    shapes.push(contours)
    fills.push(fillFromPath(path))
  }
  return { shapes, fills, viewBox }
}
