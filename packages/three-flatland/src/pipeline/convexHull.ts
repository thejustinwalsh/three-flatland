/**
 * 2D convex hull + fan triangulation for the per-batch envelope
 * geometry (tight-mesh Option A): all sprites in a batch share one
 * n-gon computed as the hull of the atlas's frame polygons.
 */

/**
 * Andrew's monotone chain over `[x, y]` points. Returns hull points in
 * counter-clockwise order (three's front-face winding). Collinear
 * points are dropped. Input under 3 distinct points returns [].
 */
export function convexHull(points: ReadonlyArray<readonly [number, number]>): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  // De-dupe exact repeats — hull math degenerates on them.
  const unique: (readonly [number, number])[] = []
  for (const p of sorted) {
    const last = unique[unique.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) unique.push(p)
  }
  if (unique.length < 3) return []

  const cross = (o: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower: (readonly [number, number])[] = []
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: (readonly [number, number])[] = []
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return [...lower, ...upper].map((p) => [p[0], p[1]])
}

/**
 * Fan-triangulate a convex CCW polygon: indices `(0, i, i+1)`.
 */
export function fanTriangulate(vertexCount: number): number[] {
  const indices: number[] = []
  for (let i = 1; i < vertexCount - 1; i++) {
    indices.push(0, i, i + 1)
  }
  return indices
}
