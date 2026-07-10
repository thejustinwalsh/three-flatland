/**
 * Shared shape definitions for the S4 baked-round-trip fixture.
 *
 * Imported by BOTH `s4-bake-fixture.mts` (node, writes `public/s4-shapes.glb`
 * via `packShapeSet`) and `s4.ts` (browser, registers the same contours at
 * runtime) — the harness asserts the two render pixel-identically. Keep this
 * module pure data + slug pipeline helpers so it runs in both contexts.
 */
import { cubicToQuadraticsAdaptive, lineToQuadratic } from '@three-flatland/slug/pipeline'
import type { QuadContour } from '@three-flatland/slug'

const S = 1 / 1024

/** Closed rectangle contour (counter-clockwise in y-up space). */
export function rectContour(x0: number, y0: number, x1: number, y1: number): QuadContour {
  return [
    lineToQuadratic(x0, y0, x1, y0, S),
    lineToQuadratic(x1, y0, x1, y1, S),
    lineToQuadratic(x1, y1, x0, y1, S),
    lineToQuadratic(x0, y1, x0, y0, S),
  ]
}

/** Reversed rectangle contour — a hole under nonzero winding. */
export function rectContourReversed(x0: number, y0: number, x1: number, y1: number): QuadContour {
  return [
    lineToQuadratic(x0, y0, x0, y1, S),
    lineToQuadratic(x0, y1, x1, y1, S),
    lineToQuadratic(x1, y1, x1, y0, S),
    lineToQuadratic(x1, y0, x0, y0, S),
  ]
}

/** High-curvature closed blob: adaptive hairpin cubic + closing edge. */
export function hairpinContour(tolerance = 0.0025 * Math.SQRT2): QuadContour {
  const contour = cubicToQuadraticsAdaptive(0.1, 0.1, 1.6, 0.2, 1.6, 0.9, 0.1, 0.9, tolerance)
  contour.push(lineToQuadratic(0.1, 0.9, 0.1, 0.1, S))
  return contour
}

/** The fixture set contents, in registration order (ids 0, 1, 2). */
export function fixtureShapes(): QuadContour[][] {
  return [
    // 0: donut — square with a hole (nonzero winding)
    [rectContour(0.1, 0.1, 0.9, 0.9), rectContourReversed(0.3, 0.3, 0.7, 0.7)],
    // 1: high-curvature blob
    [hairpinContour()],
    // 2: plain bar
    [rectContour(0.05, 0.4, 0.95, 0.6)],
  ]
}
