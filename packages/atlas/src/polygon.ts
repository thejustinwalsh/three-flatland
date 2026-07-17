/**
 * Alpha-silhouette → polygon pipeline:
 *
 *   1. threshold alpha to a binary mask
 *   2. trace the outer contour (Moore-Neighbor)
 *   3. simplify with Douglas–Peucker to a vertex budget
 *   4. ear-clip triangulate
 *
 * All coordinates are pixel-space until `normalizePolygon` maps them to
 * unit-quad locals + frame-local UVs (the runtime atlas mesh format).
 */

export interface PolygonOptions {
  /** Alpha threshold (0–255) below which a pixel is transparent. */
  alphaThreshold?: number
  /** Target max vertices after simplification. */
  vertexBudget?: number
  /** Pixels of outward padding applied to the silhouette. */
  padding?: number
}

export interface FramePolygon {
  /** Simplified outline in source-pixel coords (y-down). */
  outline: [number, number][]
  /** Ear-clip triangulation indices into `outline`. */
  triangles: number[]
}

const DEFAULT_ALPHA_THRESHOLD = 8
const DEFAULT_VERTEX_BUDGET = 8
const DEFAULT_PADDING = 1

/**
 * Trace and simplify the alpha silhouette of an RGBA pixel region.
 * Returns null for fully-transparent frames (nothing to draw) and a
 * trivial 4-vertex rect for frames whose silhouette fills the bounds.
 */
export function polygonizeAlpha(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: PolygonOptions = {}
): FramePolygon | null {
  const threshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD
  const budget = Math.max(4, options.vertexBudget ?? DEFAULT_VERTEX_BUDGET)
  const padding = options.padding ?? DEFAULT_PADDING

  // 1. Binary mask (1px transparent border so the contour walk always
  // has an outside to hug).
  const mw = width + 2
  const mh = height + 2
  const mask = new Uint8Array(mw * mh)
  let solidCount = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! >= threshold) {
        mask[(y + 1) * mw + (x + 1)] = 1
        solidCount++
      }
    }
  }
  if (solidCount === 0) return null

  // Degenerate fast path: a fully-opaque rectangle needs no tracing.
  // Winding matches earClip's y-down output convention so the baker's
  // uniform y-flip index swap yields CCW y-up triangles for every path.
  if (solidCount === width * height) {
    return {
      outline: [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      triangles: [0, 1, 2, 0, 2, 3],
    }
  }

  // 2. Trace EVERY connected component (Moore-Neighbor per component).
  // A single-blob frame follows the tight contour path; disconnected
  // blobs (muzzle flash + weapon, split particles) fall back to the
  // convex hull of all component contours — conservative, still
  // covers everything, never clips a blob the first trace missed.
  const contours = traceAllContours(mask, mw, mh)
  if (contours.length === 0) return null

  if (contours.length > 1) {
    const allPoints: [number, number][] = []
    for (const contour of contours) {
      for (const [x, y] of contour) allPoints.push([x - 1, y - 1])
    }
    let hull = convexHullYDown(allPoints)
    if (hull.length < 3) return null
    if (padding > 0) hull = padOutline(hull, padding, width, height)
    hull = simplifyToBudget(hull, budget)
    if (hull.length < 3) return null
    const hullTriangles = earClip(hull)
    if (hullTriangles.length < 3) return null
    return { outline: hull, triangles: hullTriangles }
  }

  // Undo the border offset, apply outward padding via bbox-relative
  // scaling (cheap dilation adequate at sprite scales).
  let outline: [number, number][] = contours[0]!.map(([x, y]) => [x - 1, y - 1])
  if (padding > 0) outline = padOutline(outline, padding, width, height)

  // 3. Douglas–Peucker down to the vertex budget (binary search on
  // epsilon — the budget is the contract, epsilon is the knob).
  outline = simplifyToBudget(outline, budget)
  if (outline.length < 3) return null

  // 4. Ear-clip triangulation (y-down winding).
  const triangles = earClip(outline)
  if (triangles.length < 3) return null

  return { outline, triangles }
}

/**
 * Trace the outer contour of every connected component. Components are
 * discovered by scanning for unvisited solid pixels and flood-filling
 * each one after its contour is traced.
 */
function traceAllContours(mask: Uint8Array, mw: number, mh: number): [number, number][][] {
  const visited = new Uint8Array(mask.length)
  const contours: [number, number][][] = []
  const queue: number[] = []

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const idx = y * mw + x
      if (mask[idx] !== 1 || visited[idx] === 1) continue

      contours.push(traceContour(mask, mw, mh, x, y))

      // Flood-fill this component so the scan skips it.
      queue.length = 0
      queue.push(idx)
      visited[idx] = 1
      while (queue.length > 0) {
        const current = queue.pop()!
        const cx = current % mw
        const cy = (current / mw) | 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue
            const nIdx = ny * mw + nx
            if (mask[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1
              queue.push(nIdx)
            }
          }
        }
      }
    }
  }
  return contours
}

/** Convex hull for y-down pixel coords (monotone chain). */
function convexHullYDown(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const unique: [number, number][] = []
  for (const point of sorted) {
    const last = unique[unique.length - 1]
    if (!last || last[0] !== point[0] || last[1] !== point[1]) unique.push(point)
  }
  if (unique.length < 3) return unique
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = []
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop()
    lower.push(point)
  }
  const upper: [number, number][] = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const point = unique[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop()
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

/** Moore-Neighbor tracing over a border-padded binary mask. */
function traceContour(mask: Uint8Array, mw: number, mh: number, fromX?: number, fromY?: number): [number, number][] {
  // Clockwise Moore neighborhood, starting west.
  const neighbors = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ] as const

  let startX = fromX ?? -1
  let startY = fromY ?? -1
  if (startX < 0) {
    outer: for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (mask[y * mw + x] === 1) {
          startX = x
          startY = y
          break outer
        }
      }
    }
  }
  if (startX < 0) return []

  const contour: [number, number][] = []
  let cx = startX
  let cy = startY
  // Entered scanning left-to-right, so the backtrack is west.
  let backtrack = 0
  const maxSteps = mw * mh * 4

  for (let step = 0; step < maxSteps; step++) {
    contour.push([cx, cy])
    // Search clockwise from the backtrack direction.
    let found = false
    for (let i = 1; i <= 8; i++) {
      const dir = (backtrack + i) % 8
      const nx = cx + neighbors[dir]![0]
      const ny = cy + neighbors[dir]![1]
      if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue
      if (mask[ny * mw + nx] === 1) {
        // New backtrack: the direction we came FROM (opposite), minus one
        // step so the search re-covers the pixel before the found one.
        backtrack = (dir + 5) % 8
        cx = nx
        cy = ny
        found = true
        break
      }
    }
    if (!found) break // isolated pixel
    if (cx === startX && cy === startY) break
  }

  return contour
}

/** Outward padding by scaling around the outline's own bbox center. */
function padOutline(outline: [number, number][], padding: number, width: number, height: number): [number, number][] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of outline) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const halfW = Math.max(1, (maxX - minX) / 2)
  const halfH = Math.max(1, (maxY - minY) / 2)
  const sx = (halfW + padding) / halfW
  const sy = (halfH + padding) / halfH
  return outline.map(([x, y]) => [
    Math.min(width, Math.max(0, cx + (x - cx) * sx)),
    Math.min(height, Math.max(0, cy + (y - cy) * sy)),
  ])
}

/** Douglas–Peucker with a binary search on epsilon until under budget. */
function simplifyToBudget(points: [number, number][], budget: number): [number, number][] {
  if (points.length <= budget) return points
  let lo = 0.1
  let hi = Math.max(2, points.length)
  let best = points
  for (let iter = 0; iter < 24; iter++) {
    const eps = (lo + hi) / 2
    const simplified = douglasPeucker(points, eps)
    if (simplified.length > budget) {
      lo = eps
    } else {
      best = simplified
      hi = eps
    }
    if (hi - lo < 0.01) break
  }
  return best.length <= budget ? best : douglasPeucker(points, hi)
}

function douglasPeucker(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points
  // Closed contour: anchor at the two most distant points, simplify the halves.
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let maxDist = 0
    let maxIdx = -1
    for (let i = start + 1; i < end; i++) {
      const d = pointSegmentDistance(points[i]!, points[start]!, points[end]!)
      if (d > maxDist) {
        maxDist = d
        maxIdx = i
      }
    }
    if (maxDist > epsilon && maxIdx > 0) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }
  const result: [number, number][] = []
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]!)
  }
  return result
}

function pointSegmentDistance(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Ear-clip triangulation of a simple polygon (either winding; y-down
 * coords). O(n²) — fine for vertex budgets ≤ 32.
 */
export function earClip(outline: [number, number][]): number[] {
  const n = outline.length
  if (n < 3) return []
  const indices: number[] = []
  const remaining = Array.from({ length: n }, (_, i) => i)

  // Determine winding so ear tests use the correct orientation.
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x1, y1] = outline[i]!
    const [x2, y2] = outline[(i + 1) % n]!
    area += x1 * y2 - x2 * y1
  }
  const ccw = area > 0

  const cross = (a: number, b: number, c: number): number => {
    const [ax, ay] = outline[a]!
    const [bx, by] = outline[b]!
    const [cx, cy] = outline[c]!
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  }
  const inTriangle = (p: number, a: number, b: number, c: number): boolean => {
    const s1 = cross(a, b, p)
    const s2 = cross(b, c, p)
    const s3 = cross(c, a, p)
    const hasNeg = s1 < 0 || s2 < 0 || s3 < 0
    const hasPos = s1 > 0 || s2 > 0 || s3 > 0
    return !(hasNeg && hasPos)
  }

  let guard = n * n
  while (remaining.length > 3 && guard-- > 0) {
    let clipped = false
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length]!
      const curr = remaining[i]!
      const next = remaining[(i + 1) % remaining.length]!
      const convex = ccw ? cross(prev, curr, next) > 0 : cross(prev, curr, next) < 0
      if (!convex) continue
      let contains = false
      for (const other of remaining) {
        if (other === prev || other === curr || other === next) continue
        if (inTriangle(other, prev, curr, next)) {
          contains = true
          break
        }
      }
      if (contains) continue
      indices.push(prev, curr, next)
      remaining.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) return [] // stalled on a degenerate/non-simple outline — fail closed
  }
  if (remaining.length !== 3) return [] // guard exhausted without finishing — fail closed
  indices.push(remaining[0]!, remaining[1]!, remaining[2]!)
  return indices
}
