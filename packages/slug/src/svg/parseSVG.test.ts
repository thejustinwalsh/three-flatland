import { describe, it, expect } from 'vitest'
import {
  CubicBezierCurve,
  EllipseCurve,
  LineCurve,
  QuadraticBezierCurve,
  ShapePath,
  Vector2,
} from 'three'
import { contoursFromShapePath, quadraticsFromCurve, DEFAULT_CURVE_TOLERANCE } from './parseSVG'
import type { CurveLike, ShapePathLike } from './parseSVG'
import { refDistanceToQuadBezier } from '../shaders/distanceToQuadBezier'
import type { QuadCurve } from '../types'

function quadAt(q: QuadCurve, t: number): [number, number] {
  const u = 1 - t
  return [
    u * u * q.p0x + 2 * u * t * q.p1x + t * t * q.p2x,
    u * u * q.p0y + 2 * u * t * q.p1y + t * t * q.p2y,
  ]
}

describe('quadraticsFromCurve', () => {
  it('passes quadratic curves through untouched', () => {
    const curve = new QuadraticBezierCurve(
      new Vector2(0, 0),
      new Vector2(0.5, 1),
      new Vector2(1, 0)
    )
    const quads = quadraticsFromCurve(curve as unknown as CurveLike)
    expect(quads).toEqual([{ p0x: 0, p0y: 0, p1x: 0.5, p1y: 1, p2x: 1, p2y: 0 }])
  })

  it('converts lines to (slightly bowed) degenerate quadratics and skips zero-length lines', () => {
    const line = new LineCurve(new Vector2(0, 0), new Vector2(1, 1))
    const quads = quadraticsFromCurve(line as unknown as CurveLike)
    expect(quads).toHaveLength(1)
    expect(quads[0]!.p2x).toBe(1)

    const zero = new LineCurve(new Vector2(0.3, 0.3), new Vector2(0.3, 0.3))
    expect(quadraticsFromCurve(zero as unknown as CurveLike)).toHaveLength(0)
  })

  it('converts cubics adaptively within the default tolerance', () => {
    const curve = new CubicBezierCurve(
      new Vector2(0, 0),
      new Vector2(1.5, 0.1),
      new Vector2(1.5, 0.9),
      new Vector2(0, 1)
    )
    const quads = quadraticsFromCurve(curve as unknown as CurveLike)
    expect(quads.length).toBeGreaterThan(2) // hairpin needs more than the fixed split
    // Deviation from the source cubic stays under tolerance (exact
    // point-to-quad distance via the package's reference implementation)
    let worst = 0
    for (let i = 0; i <= 200; i++) {
      const p = curve.getPoint(i / 200)
      let best = Infinity
      for (const q of quads) {
        const { distance } = refDistanceToQuadBezier(
          p.x,
          p.y,
          q.p0x,
          q.p0y,
          q.p1x,
          q.p1y,
          q.p2x,
          q.p2y
        )
        best = Math.min(best, distance)
      }
      worst = Math.max(worst, best)
    }
    expect(worst).toBeLessThanOrEqual(DEFAULT_CURVE_TOLERANCE * 1.05)
  })

  it('converts full-circle ellipse curves (SVG circles/arcs) smoothly', () => {
    const circle = new EllipseCurve(0.5, 0.5, 0.5, 0.5, 0, Math.PI * 2)
    const quads = quadraticsFromCurve(circle as unknown as CurveLike)
    expect(quads.length).toBeGreaterThanOrEqual(8)
    // Every emitted point sits on the circle within tolerance — smooth
    // curvature, not a faceted polyline.
    let worstRadius = 0
    for (const q of quads) {
      for (let j = 0; j <= 16; j++) {
        const [x, y] = quadAt(q, j / 16)
        worstRadius = Math.max(worstRadius, Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.5))
      }
    }
    expect(worstRadius).toBeLessThanOrEqual(DEFAULT_CURVE_TOLERANCE * 1.5)
    // Closed: chain ends meet its start
    const first = quads[0]!
    const last = quads[quads.length - 1]!
    expect(last.p2x).toBeCloseTo(first.p0x, 4)
    expect(last.p2y).toBeCloseTo(first.p0y, 4)
  })

  it('applies the affine point map before fitting', () => {
    const line = new LineCurve(new Vector2(0, 0), new Vector2(24, 24))
    const quads = quadraticsFromCurve(line as unknown as CurveLike, (x, y) => [
      x / 24,
      (24 - y) / 24,
    ])
    expect(quads[0]!.p0x).toBe(0)
    expect(quads[0]!.p0y).toBe(1)
    expect(quads[0]!.p2x).toBe(1)
    expect(quads[0]!.p2y).toBe(0)
  })
})

describe('contoursFromShapePath', () => {
  it('produces one closed contour per subpath (auto-closing open ends)', () => {
    const path = new ShapePath()
    // Outer square (left open — no explicit close)
    path.moveTo(0, 0)
    path.lineTo(1, 0)
    path.lineTo(1, 1)
    path.lineTo(0, 1)
    // Inner triangle hole
    path.moveTo(0.25, 0.25)
    path.lineTo(0.75, 0.25)
    path.lineTo(0.5, 0.75)

    const contours = contoursFromShapePath(path as unknown as ShapePathLike)
    expect(contours).toHaveLength(2)
    for (const contour of contours) {
      const first = contour[0]!
      const last = contour[contour.length - 1]!
      expect(last.p2x).toBeCloseTo(first.p0x, 9)
      expect(last.p2y).toBeCloseTo(first.p0y, 9)
    }
    // Square: 3 explicit lines + 1 closing line
    expect(contours[0]).toHaveLength(4)
    expect(contours[1]).toHaveLength(3)
  })

  it('converts bezier subpaths through the adaptive pipeline', () => {
    const path = new ShapePath()
    path.moveTo(0, 0)
    path.bezierCurveTo(1.5, 0.1, 1.5, 0.9, 0, 1)
    const contours = contoursFromShapePath(path as unknown as ShapePathLike)
    expect(contours).toHaveLength(1)
    expect(contours[0]!.length).toBeGreaterThan(3) // adaptive quads + closing line
  })
})
