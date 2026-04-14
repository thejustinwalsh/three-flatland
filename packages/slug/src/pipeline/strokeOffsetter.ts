import type { QuadCurve } from '../types.js'

/**
 * Quadratic-Bezier adaptive stroke offsetter (Phase 5 Task 16).
 *
 * Offsetting a quadratic Bezier in general produces a higher-order
 * curve — the parallel curve of a quadratic isn't itself a quadratic.
 * We approximate by splitting the source curve wherever its turning
 * angle is large enough that a single-quadratic approximation of the
 * offset would exceed a user-supplied error tolerance.
 *
 * This module's Task 16.1 contribution is the *subdivision* pass —
 * given a quadratic and an offset width, returns a list of sub-
 * quadratics that are each flat enough / shallow enough for a single
 * quadratic offset to fit within `epsilon`. The per-segment offset
 * itself (Task 16.2), join insertion (16.3), cap insertion (16.4),
 * and final close (16.5) live in follow-ups.
 *
 * Tolerance reasoning. A circular arc of angle α with radius r
 * approximated by its chord Bezier has max error ~r·α²/8 at the mid-
 * point. For a stroked curve, the offset has radius ~r ± halfWidth,
 * so the acceptable turn angle is
 *
 *   α_max ≤ √(8·epsilon / halfWidth)
 *
 * With the roadmap's default tolerance `epsilon = 0.01·halfWidth`
 * that yields α_max ≈ 0.283 rad (≈16°) — coarse for display-size
 * stroking, fine for body-text stroke widths where curves are gentle.
 * Tighter `epsilon` is available per call for high-zoom cases.
 *
 * Flatness shortcut: if the curve's control point is within `epsilon`
 * of the p0→p2 chord, the curve is essentially linear and its offset
 * is trivially linear too — no subdivision needed regardless of
 * tangent-turn angle.
 *
 * Recursion is bounded by `maxDepth` (default 8 → up to 256 leaves
 * per input quad) so pathological inputs can't blow up compilation
 * time. At max depth we accept the current segment as-is; the error
 * that leaks through is capped by the subdivision budget and shows
 * up only at the pixel level on extreme magnification.
 */

/** Minimum `halfWidth` the subdivider treats as non-zero. Below this,
 *  the offset calculation is numerically unstable; callers should
 *  handle hairline strokes elsewhere. */
const MIN_HALF_WIDTH = 1e-8

export interface SubdivideOptions {
  /**
   * Max deviation (em-space) between the ideal offset curve and the
   * single-quadratic approximation of it. Drives when to split.
   * Default: `0.01 × halfWidth` (1% of the stroke half-width).
   */
  epsilon?: number
  /**
   * Maximum recursion depth. Default 8 (produces up to 256 leaves
   * per input curve). Serves as a hard upper bound so degenerate
   * inputs can't hang the offsetter.
   */
  maxDepth?: number
}

/**
 * Split a quadratic Bezier into a list of sub-quadratics, each flat
 * enough that its offset at `halfWidth` will be well-approximated by
 * a single quadratic within `epsilon`.
 *
 * For straight segments or very gentle curves, returns the input
 * unchanged (single-element array). For highly-curved inputs,
 * returns 2–N curves, never exceeding 2^maxDepth.
 */
export function subdivideForOffset(
  curve: QuadCurve,
  halfWidth: number,
  options: SubdivideOptions = {},
): QuadCurve[] {
  const hw = Math.max(halfWidth, MIN_HALF_WIDTH)
  const epsilon = options.epsilon ?? 0.01 * hw
  const maxDepth = options.maxDepth ?? 8

  // Angle threshold derived from the quadratic-fit error bound
  // r·α²/8 < epsilon → α < √(8ε/r). We conservatively use `hw` as a
  // proxy for the local offset radius; if the curve's true radius of
  // curvature is tighter, subdivision proceeds further automatically
  // because the per-split tangent change grows as curvature grows.
  const angleMax = Math.sqrt(8 * epsilon / hw)

  return subdivideRec(curve, angleMax, epsilon, 0, maxDepth)
}

function subdivideRec(
  curve: QuadCurve,
  angleMax: number,
  epsilonEm: number,
  depth: number,
  maxDepth: number,
): QuadCurve[] {
  // Flatness: perpendicular distance from p1 to the p0→p2 chord.
  // Zero (or near-zero) means the curve is essentially a line
  // segment; its offset is a single line segment and we skip splits.
  const chordDx = curve.p2x - curve.p0x
  const chordDy = curve.p2y - curve.p0y
  const chordLen = Math.hypot(chordDx, chordDy)
  if (chordLen > 0) {
    const nx = chordDx / chordLen
    const ny = chordDy / chordLen
    // 2D cross of chord-direction and (p1 - p0) gives signed perp
    // distance; magnitude is the flatness indicator.
    const p1dx = curve.p1x - curve.p0x
    const p1dy = curve.p1y - curve.p0y
    const perpDist = Math.abs(nx * p1dy - ny * p1dx)
    if (perpDist < epsilonEm) return [curve]
  } else {
    // Degenerate: p0 === p2. The quad is a spike; no useful offset.
    return [curve]
  }

  // Turning angle between the endpoint tangents.
  const t0 = unitTangentAt(curve, 0)
  const t1 = unitTangentAt(curve, 1)
  const cos = clamp(t0[0] * t1[0] + t0[1] * t1[1], -1, 1)
  const angle = Math.acos(cos)

  if (angle <= angleMax || depth >= maxDepth) {
    return [curve]
  }

  // De Casteljau split at t = 0.5.
  const m01x = (curve.p0x + curve.p1x) * 0.5
  const m01y = (curve.p0y + curve.p1y) * 0.5
  const m12x = (curve.p1x + curve.p2x) * 0.5
  const m12y = (curve.p1y + curve.p2y) * 0.5
  const midx = (m01x + m12x) * 0.5
  const midy = (m01y + m12y) * 0.5

  const left: QuadCurve = {
    p0x: curve.p0x, p0y: curve.p0y,
    p1x: m01x, p1y: m01y,
    p2x: midx, p2y: midy,
  }
  const right: QuadCurve = {
    p0x: midx, p0y: midy,
    p1x: m12x, p1y: m12y,
    p2x: curve.p2x, p2y: curve.p2y,
  }

  return [
    ...subdivideRec(left, angleMax, epsilonEm, depth + 1, maxDepth),
    ...subdivideRec(right, angleMax, epsilonEm, depth + 1, maxDepth),
  ]
}

/** Unit tangent vector B'(t)/|B'(t)| at the given curve parameter. */
export function unitTangentAt(curve: QuadCurve, t: number): [number, number] {
  // B'(t) = 2(1-t)(p1 - p0) + 2t(p2 - p1)
  const s = 1 - t
  const dx = 2 * s * (curve.p1x - curve.p0x) + 2 * t * (curve.p2x - curve.p1x)
  const dy = 2 * s * (curve.p1y - curve.p0y) + 2 * t * (curve.p2y - curve.p1y)
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) {
    // Degenerate tangent (happens when the curve is a single point
    // or cuspy). Fall back to the chord direction — callers that
    // care about accurate tangents at cusps should pre-split.
    const cx = curve.p2x - curve.p0x
    const cy = curve.p2y - curve.p0y
    const clen = Math.hypot(cx, cy)
    if (clen < 1e-12) return [1, 0]
    return [cx / clen, cy / clen]
  }
  return [dx / len, dy / len]
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
