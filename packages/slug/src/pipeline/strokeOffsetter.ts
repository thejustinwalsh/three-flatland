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

/**
 * Offset a single (already-subdivided) quadratic Bezier by a signed
 * distance. Returns the offset quadratic approximated via the
 * Tiller-Hanson construction:
 *
 *   1. Offset p0 along its unit normal → p0'
 *   2. Offset p2 along its unit normal → p2'
 *   3. Intersect the offset tangent lines through p0' and p2'
 *      to locate p1'
 *
 * Sign convention: the "left-hand" normal of tangent (tx, ty) is
 * (-ty, tx) — so a positive `offset` moves the curve to the left of
 * its direction of travel (p0 → p2). Pass a negative offset for the
 * opposite side. Callers walking a closed contour in a known winding
 * direction (font outlines: counter-clockwise = outside-on-the-left)
 * can use +halfWidth for the outer offset and -halfWidth for the
 * inner.
 *
 * Degenerate tangents (cusps, coincident control points) fall back
 * to the chord-direction tangent via `unitTangentAt`. If the two
 * offset tangents are parallel (straight segment), p1' collapses to
 * the midpoint of p0' and p2' — which for a genuinely straight
 * source curve produces the same straight offset segment.
 *
 * Caller contract: the input curve should already have been passed
 * through `subdivideForOffset` so the single-quadratic approximation
 * fits within epsilon of the true offset. Calling this directly on
 * a highly-curved source will produce visibly off offsets.
 */
export function offsetQuadraticBezier(
  curve: QuadCurve,
  offset: number,
): QuadCurve {
  // Unit tangents at both endpoints.
  const [t0x, t0y] = unitTangentAt(curve, 0)
  const [t1x, t1y] = unitTangentAt(curve, 1)

  // Left-hand unit normals. Rotating (tx, ty) by +90° gives (-ty, tx),
  // i.e. perpendicular, to the left of the direction of travel.
  const n0x = -t0y
  const n0y = t0x
  const n1x = -t1y
  const n1y = t1x

  // Offset the two anchor points.
  const p0x = curve.p0x + n0x * offset
  const p0y = curve.p0y + n0y * offset
  const p2x = curve.p2x + n1x * offset
  const p2y = curve.p2y + n1y * offset

  // Intersect the two offset tangent lines:
  //   Line A: (p0x, p0y) + s * (t0x, t0y)
  //   Line B: (p2x, p2y) - u * (t1x, t1y)   (going back from p2')
  // Solve for s. Derivation in the module doc above.
  const dx = p2x - p0x
  const dy = p2y - p0y
  const det = t0y * t1x - t0x * t1y

  let p1x: number
  let p1y: number
  if (Math.abs(det) < 1e-10) {
    // Parallel tangents — either straight segment (offset is straight,
    // midpoint works) or a cusp (we can't recover a clean quadratic,
    // so midpoint is the best cheap fallback; caller should have
    // pre-subdivided past the cusp).
    p1x = (p0x + p2x) * 0.5
    p1y = (p0y + p2y) * 0.5
  } else {
    const s = (dy * t1x - dx * t1y) / det
    p1x = p0x + s * t0x
    p1y = p0y + s * t0y
  }

  return { p0x, p0y, p1x, p1y, p2x, p2y }
}

// ─── Join insertion (Task 16.3) ──────────────────────────────────────

export type JoinStyle = 'miter' | 'round' | 'bevel'

export interface JoinContext {
  /** Source contour vertex where curve A ends and curve B begins. */
  cornerX: number
  cornerY: number
  /** Unit tangent at the end of curve A (points out of A). */
  tangentA: [number, number]
  /** Unit tangent at the start of curve B (points into B). */
  tangentB: [number, number]
  /** Offset endpoint: end of the last offset segment of A. */
  endA: { x: number; y: number }
  /** Offset endpoint: start of the first offset segment of B. */
  startB: { x: number; y: number }
  /** Signed offset distance (matches what was used for the segments). */
  halfWidth: number
  joinStyle: JoinStyle
  /** Miter clip ratio (SVG default 4). Ignored for `round` / `bevel`. */
  miterLimit: number
}

/**
 * Emit quadratic-Bezier segments that fill the gap between two
 * adjacent offset segments at a contour corner.
 *
 * Caller contract: invoked only when the source contour's tangent is
 * discontinuous at the corner (i.e. curves A and B meet at a non-
 * smooth angle). For smooth joins (`tangentA == tangentB`) the offset
 * endpoints coincide and no join geometry is needed — this function
 * short-circuits to an empty array in that case.
 *
 * Emits join geometry on the *outside* of the corner. The caller is
 * responsible for choosing which side to offset (positive vs negative
 * halfWidth) and thus which side has the gap; this function assumes
 * it's called for that side.
 *
 * - `bevel`: single straight quadratic from `endA` to `startB`.
 * - `miter`: two straight quadratics meeting at the miter point (the
 *   intersection of the offset tangent lines through `endA` and
 *   `startB`). If the miter length exceeds `miterLimit · halfWidth`,
 *   falls back to bevel per the SVG spec.
 * - `round`: arc from `endA` to `startB` centered at `(cornerX, cornerY)`
 *   with radius `|halfWidth|`, split into ≤60°-per-segment quadratics.
 *   Each 60° sub-arc is approximated by a single quadratic whose
 *   control point is the intersection of the arc's endpoint tangents
 *   — max deviation from the true arc is ~r·(1 − cos 30°)² ≈ 0.018·r,
 *   well below the stroke-width-relative error budget for all
 *   reasonable stroke widths.
 */
export function insertJoin(ctx: JoinContext): QuadCurve[] {
  const { endA, startB, tangentA, tangentB, halfWidth, joinStyle, miterLimit } = ctx

  // Smooth join: the offset endpoints coincide. No gap to fill.
  const gap = Math.hypot(startB.x - endA.x, startB.y - endA.y)
  if (gap < 1e-10) return []

  if (joinStyle === 'bevel') {
    return [straightQuad(endA.x, endA.y, startB.x, startB.y)]
  }

  if (joinStyle === 'miter') {
    const miter = intersectLines(
      endA.x, endA.y, tangentA[0], tangentA[1],
      startB.x, startB.y, -tangentB[0], -tangentB[1],
    )
    if (!miter) {
      // Near-parallel offset tangents — no meaningful miter point. SVG
      // fallback is bevel in this pathological case too.
      return [straightQuad(endA.x, endA.y, startB.x, startB.y)]
    }

    // Miter clip: if the miter extends further than `miterLimit · halfWidth`
    // from the corner, bevel instead. Matches the SVG stroke-miterlimit
    // behavior.
    const miterLen = Math.hypot(miter.x - ctx.cornerX, miter.y - ctx.cornerY)
    if (miterLen > miterLimit * Math.abs(halfWidth)) {
      return [straightQuad(endA.x, endA.y, startB.x, startB.y)]
    }

    return [
      straightQuad(endA.x, endA.y, miter.x, miter.y),
      straightQuad(miter.x, miter.y, startB.x, startB.y),
    ]
  }

  // round
  const r = Math.abs(halfWidth)
  if (r < 1e-10) return [straightQuad(endA.x, endA.y, startB.x, startB.y)]

  const a0 = Math.atan2(endA.y - ctx.cornerY, endA.x - ctx.cornerX)
  const a1 = Math.atan2(startB.y - ctx.cornerY, startB.x - ctx.cornerX)
  // Shortest-path angular delta in [-π, π].
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  // Split the arc into segments of ≤ 60° each. Single quadratic per
  // segment gives a visually-indistinguishable approximation at all
  // typical stroke widths; below-60°-per-segment budgets exist but
  // produce no observable improvement for text/shape strokes.
  const maxStep = Math.PI / 3
  const nSegments = Math.max(1, Math.ceil(Math.abs(delta) / maxStep))
  const step = delta / nSegments

  const out: QuadCurve[] = []
  for (let i = 0; i < nSegments; i++) {
    const startAngle = a0 + step * i
    const endAngle = a0 + step * (i + 1)
    const p0x = ctx.cornerX + r * Math.cos(startAngle)
    const p0y = ctx.cornerY + r * Math.sin(startAngle)
    const p2x = ctx.cornerX + r * Math.cos(endAngle)
    const p2y = ctx.cornerY + r * Math.sin(endAngle)

    // Tangent to a circle at angle θ is perpendicular to the radius,
    // pointing in the direction of increasing θ: (-sin θ, cos θ).
    const tax = -Math.sin(startAngle)
    const tay = Math.cos(startAngle)
    const tbx = -Math.sin(endAngle)
    const tby = Math.cos(endAngle)

    const cp = intersectLines(p0x, p0y, tax, tay, p2x, p2y, -tbx, -tby)
    if (cp) {
      out.push({ p0x, p0y, p1x: cp.x, p1y: cp.y, p2x, p2y })
    } else {
      // Fallback for degenerate arc (zero-length segment).
      out.push(straightQuad(p0x, p0y, p2x, p2y))
    }
  }
  return out
}

/** Single straight quadratic (p1 at chord midpoint). */
function straightQuad(ax: number, ay: number, bx: number, by: number): QuadCurve {
  return {
    p0x: ax, p0y: ay,
    p1x: (ax + bx) * 0.5, p1y: (ay + by) * 0.5,
    p2x: bx, p2y: by,
  }
}

/**
 * Intersect two parametric lines given by (point, direction). Returns
 * null for parallel / near-parallel lines.
 *
 *   line A: (ax, ay) + s · (adx, ady)
 *   line B: (bx, by) + t · (bdx, bdy)
 */
function intersectLines(
  ax: number, ay: number, adx: number, ady: number,
  bx: number, by: number, bdx: number, bdy: number,
): { x: number; y: number } | null {
  const det = adx * bdy - ady * bdx
  if (Math.abs(det) < 1e-10) return null
  const dx = bx - ax
  const dy = by - ay
  const s = (dx * bdy - dy * bdx) / det
  return { x: ax + s * adx, y: ay + s * ady }
}

// ─── Cap insertion (Task 16.4) ───────────────────────────────────────

export type CapStyle = 'flat' | 'square' | 'round' | 'triangle'

export interface CapContext {
  /**
   * The source endpoint being capped. For the start cap (contour's
   * very first vertex), this is the original p0 of the first curve;
   * for the end cap, the original p2 of the last curve.
   */
  endpointX: number
  endpointY: number
  /**
   * Unit tangent at the endpoint, pointing **out of** the contour
   * (away from the rest of the curve). For the end cap this is the
   * same direction the final curve is travelling; for the start cap
   * it's the reverse of the initial tangent.
   */
  tangent: [number, number]
  /** Outer offset endpoint (on the +halfWidth side of the endpoint). */
  outerEnd: { x: number; y: number }
  /** Inner offset endpoint (on the -halfWidth side of the endpoint). */
  innerEnd: { x: number; y: number }
  /** Signed stroke half-width (sign matches the outer-offset direction). */
  halfWidth: number
  capStyle: CapStyle
}

/**
 * Emit cap geometry from `outerEnd` to `innerEnd`, going "around"
 * the endpoint outside the stroke path. Called once per open-contour
 * endpoint; closed contours never need caps.
 *
 * - **flat**: 1 straight quadratic from outer to inner (no extension
 *   past the endpoint).
 * - **square**: 3 straight quadratics forming a rectangle half-width
 *   beyond the endpoint along the tangent: outer → outer+tangent·hw →
 *   inner+tangent·hw → inner.
 * - **round**: semicircle from outer to inner centered at the
 *   endpoint, radius `|halfWidth|`, split into ≤60°-per-segment
 *   quadratics (same approach as round joins).
 * - **triangle**: 2 straight quadratics forming an isosceles triangle
 *   half-width beyond the endpoint: outer → apex → inner, where apex
 *   = endpoint + tangent · halfWidth.
 */
export function insertCap(ctx: CapContext): QuadCurve[] {
  const { outerEnd, innerEnd, endpointX, endpointY, tangent, halfWidth, capStyle } = ctx
  const r = Math.abs(halfWidth)

  if (capStyle === 'flat') {
    return [straightQuad(outerEnd.x, outerEnd.y, innerEnd.x, innerEnd.y)]
  }

  if (capStyle === 'square') {
    const ox = tangent[0] * r
    const oy = tangent[1] * r
    const outerExt = { x: outerEnd.x + ox, y: outerEnd.y + oy }
    const innerExt = { x: innerEnd.x + ox, y: innerEnd.y + oy }
    return [
      straightQuad(outerEnd.x, outerEnd.y, outerExt.x, outerExt.y),
      straightQuad(outerExt.x, outerExt.y, innerExt.x, innerExt.y),
      straightQuad(innerExt.x, innerExt.y, innerEnd.x, innerEnd.y),
    ]
  }

  if (capStyle === 'triangle') {
    const apex = {
      x: endpointX + tangent[0] * r,
      y: endpointY + tangent[1] * r,
    }
    return [
      straightQuad(outerEnd.x, outerEnd.y, apex.x, apex.y),
      straightQuad(apex.x, apex.y, innerEnd.x, innerEnd.y),
    ]
  }

  // round — semicircle from outerEnd to innerEnd centered at endpoint.
  if (r < 1e-10) {
    return [straightQuad(outerEnd.x, outerEnd.y, innerEnd.x, innerEnd.y)]
  }

  const a0 = Math.atan2(outerEnd.y - endpointY, outerEnd.x - endpointX)
  const a1 = Math.atan2(innerEnd.y - endpointY, innerEnd.x - endpointX)
  // For a cap we go the *long way* around — 180° across the endpoint,
  // not the shortest arc (which would go back through the contour
  // interior). Determine direction by checking whether the tangent
  // sits on the correct side: the cap arc should bulge in the
  // direction of `tangent` (away from the contour).
  let delta = a1 - a0
  // Normalize to [-π, π].
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  // The correct cap direction is the one whose midpoint falls in the
  // half-plane defined by `tangent`. Midpoint at angle `a0 + delta/2`.
  const midAngle = a0 + delta / 2
  const midX = Math.cos(midAngle)
  const midY = Math.sin(midAngle)
  // If midpoint direction is anti-parallel to tangent, flip delta to
  // go around the other way.
  if (midX * tangent[0] + midY * tangent[1] < 0) {
    delta = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI
  }

  const maxStep = Math.PI / 3
  const nSegments = Math.max(1, Math.ceil(Math.abs(delta) / maxStep))
  const step = delta / nSegments

  const out: QuadCurve[] = []
  for (let i = 0; i < nSegments; i++) {
    const startAngle = a0 + step * i
    const endAngle = a0 + step * (i + 1)
    const p0x = endpointX + r * Math.cos(startAngle)
    const p0y = endpointY + r * Math.sin(startAngle)
    const p2x = endpointX + r * Math.cos(endAngle)
    const p2y = endpointY + r * Math.sin(endAngle)
    const tax = -Math.sin(startAngle)
    const tay = Math.cos(startAngle)
    const tbx = -Math.sin(endAngle)
    const tby = Math.cos(endAngle)
    const cp = intersectLines(p0x, p0y, tax, tay, p2x, p2y, -tbx, -tby)
    if (cp) {
      out.push({ p0x, p0y, p1x: cp.x, p1y: cp.y, p2x, p2y })
    } else {
      out.push(straightQuad(p0x, p0y, p2x, p2y))
    }
  }
  return out
}


