/**
 * Connected-component labeling (CCL) on an ImageData's alpha channel.
 *
 * Algorithm: two-pass labeling with union-find (path-compressed).
 *   Pass 1 — scan top-to-bottom, left-to-right. For each filled pixel,
 *     inspect the already-visited neighbors (left and top for 4-connectivity;
 *     those plus the two diagonal corners for 8-connectivity). Assign the
 *     smallest neighbor label, or a fresh label if none. Merge all neighbor
 *     labels via union-find.
 *   Pass 2 — walk every pixel again, resolve its label to the canonical root,
 *     and expand that component's bounding box.
 *
 * Performance: O(W × H) with near-linear union-find overhead. On a 1024×1024
 * image (~1 M pixels) this typically runs in 150–400 ms on the main thread
 * (hardware-dependent). That is acceptable for an explicit "Detect" button.
 * Do NOT call this on every render or from a React effect without a guard.
 * For very large images (> 2048²) consider offloading to a Web Worker.
 */

export type DetectedRect = {
  x: number
  y: number
  w: number
  h: number
  /** Number of filled (alpha ≥ threshold) pixels in this component. */
  pixels: number
}

export type CCLOptions = {
  /**
   * Pixels with alpha >= this are considered "filled". 1..255.
   * Default 1 (any non-zero alpha).
   */
  alphaThreshold?: number
  /**
   * Discard components smaller than this many filled pixels.
   * Default 4.
   */
  minPixels?: number
  /**
   * Discard bounding boxes smaller than this on any axis.
   * Default 2.
   */
  minSize?: number
  /**
   * 4-connectivity (default) or 8-connectivity.
   * 4-connectivity: left + top neighbors only (+ right-top for completeness,
   * handled by symmetry in pass 1).
   * 8-connectivity: also includes the two diagonal corners above.
   */
  connectivity?: 4 | 8
}

// ---------------------------------------------------------------------------
// Union-Find with path compression + union by rank
// ---------------------------------------------------------------------------

function makeUnionFind(capacity: number): { parent: Int32Array; rank: Uint8Array } {
  const parent = new Int32Array(capacity)
  const rank = new Uint8Array(capacity)
  for (let i = 0; i < capacity; i++) parent[i] = i
  return { parent, rank }
}

function find(parent: Int32Array, x: number): number {
  // Iterative path compression
  let root = x
  while (parent[root] !== root) root = parent[root]!
  // Path halving
  while (parent[x] !== root) {
    const next = parent[x]!
    parent[x] = root
    x = next
  }
  return root
}

function union(parent: Int32Array, rank: Uint8Array, a: number, b: number): void {
  const ra = find(parent, a)
  const rb = find(parent, b)
  if (ra === rb) return
  if (rank[ra]! < rank[rb]!) {
    parent[ra] = rb
  } else if (rank[ra]! > rank[rb]!) {
    parent[rb] = ra
  } else {
    parent[rb] = ra
    rank[ra] = (rank[ra] ?? 0) + 1
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Connected-component labeling on the alpha channel. Returns the
 * bounding box of each connected blob of "filled" pixels. Blobs smaller
 * than minPixels OR with bbox smaller than minSize on any axis are
 * filtered.
 *
 * Results are sorted in reading order (top-to-bottom, left-to-right) using
 * a y-tolerance of half the median bounding-box height — rects whose top
 * edges are within that tolerance are treated as being on the same row and
 * sorted by x within the row.
 */
export function connectedComponents(image: ImageData, options?: CCLOptions): DetectedRect[] {
  const {
    alphaThreshold = 1,
    minPixels = 4,
    minSize = 2,
    connectivity = 4,
  } = options ?? {}

  const { width: W, height: H, data } = image
  const N = W * H

  // labels[i] = provisional label for pixel i (0 = background / unfilled)
  const labels = new Int32Array(N)

  // Union-find over label IDs. Max unique labels = ceil(N/2) in worst case
  // (checkerboard). Allocate N/2 + 1 to be safe; label 0 is background.
  const maxLabels = Math.ceil(N / 2) + 2
  const { parent, rank } = makeUnionFind(maxLabels)

  let nextLabel = 1

  // ------------------------------------------------------------------
  // Pass 1: assign provisional labels
  // ------------------------------------------------------------------
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x
      const alpha = data[idx * 4 + 3]!
      if (alpha < alphaThreshold) continue

      // Collect filled neighbor labels
      let topLabel = 0
      let leftLabel = 0
      let topLeftLabel = 0
      let topRightLabel = 0

      if (y > 0) {
        topLabel = labels[(y - 1) * W + x]!
      }
      if (x > 0) {
        leftLabel = labels[idx - 1]!
      }
      if (connectivity === 8) {
        if (y > 0 && x > 0) {
          topLeftLabel = labels[(y - 1) * W + (x - 1)]!
        }
        if (y > 0 && x < W - 1) {
          topRightLabel = labels[(y - 1) * W + (x + 1)]!
        }
      }

      // Gather non-zero neighbors
      const neighbors: number[] = []
      if (topLabel > 0) neighbors.push(find(parent, topLabel))
      if (leftLabel > 0) neighbors.push(find(parent, leftLabel))
      if (topLeftLabel > 0) neighbors.push(find(parent, topLeftLabel))
      if (topRightLabel > 0) neighbors.push(find(parent, topRightLabel))

      if (neighbors.length === 0) {
        // New component
        labels[idx] = nextLabel++
      } else {
        // Assign minimum root label among neighbors
        let minRoot = neighbors[0]!
        for (let n = 1; n < neighbors.length; n++) {
          if (neighbors[n]! < minRoot) minRoot = neighbors[n]!
        }
        labels[idx] = minRoot
        // Merge all neighbors to minRoot
        for (let n = 0; n < neighbors.length; n++) {
          union(parent, rank, minRoot, neighbors[n]!)
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Pass 2: collect bounding boxes
  // ------------------------------------------------------------------
  // For each canonical label root, track: minX, minY, maxX, maxY, pixels
  // Use flat arrays indexed by label ID (up to nextLabel).
  const minX = new Int32Array(nextLabel).fill(W)
  const minY = new Int32Array(nextLabel).fill(H)
  const maxX = new Int32Array(nextLabel).fill(-1)
  const maxY = new Int32Array(nextLabel).fill(-1)
  const pixCount = new Int32Array(nextLabel)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x
      const lbl = labels[idx]!
      if (lbl === 0) continue
      const root = find(parent, lbl)
      if (x < minX[root]!) minX[root] = x
      if (y < minY[root]!) minY[root] = y
      if (x > maxX[root]!) maxX[root] = x
      if (y > maxY[root]!) maxY[root] = y
      pixCount[root] = (pixCount[root] ?? 0) + 1
    }
  }

  // ------------------------------------------------------------------
  // Build result array (only canonical roots with valid data)
  // ------------------------------------------------------------------
  const raw: DetectedRect[] = []
  const seen = new Set<number>()

  for (let lbl = 1; lbl < nextLabel; lbl++) {
    const root = find(parent, lbl)
    if (seen.has(root)) continue
    seen.add(root)

    const px = pixCount[root]!
    if (px < minPixels) continue

    const bx = minX[root]!
    const by = minY[root]!
    const bw = maxX[root]! - bx + 1
    const bh = maxY[root]! - by + 1

    if (bw < minSize || bh < minSize) continue

    raw.push({ x: bx, y: by, w: bw, h: bh, pixels: px })
  }

  // ------------------------------------------------------------------
  // Reading-order sort (top-to-bottom, left-to-right)
  // y-tolerance = half the median bbox height
  // ------------------------------------------------------------------
  if (raw.length === 0) return raw

  const heights = raw.map((r) => r.h).sort((a, b) => a - b)
  const medianH = heights[Math.floor(heights.length / 2)]!
  const yTol = medianH / 2

  raw.sort((a, b) => {
    const rowA = Math.round(a.y / yTol)
    const rowB = Math.round(b.y / yTol)
    if (rowA !== rowB) return rowA - rowB
    return a.x - b.x
  })

  return raw
}
