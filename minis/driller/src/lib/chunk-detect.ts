import { isAnchorTile, TILE_SOIL } from '../traits'

/**
 * A connected-component of SOIL cells, plus its bounding box and cell list.
 *
 * `cells` are flat indices into the tile array (`row * cols + col`).
 */
export interface SoilChunk {
  cells: number[]
  minRow: number
  maxRow: number
  minCol: number
  maxCol: number
}

/**
 * 4-connected flood-fill over a tile array. Returns one SoilChunk per
 * distinct SOIL component. Cost: O(cells). Uses an iterative stack so we
 * don't blow the call stack on large chunks.
 *
 * Optional `topRow` / `bottomRow` clip the seeding scan to a row window
 * (the flood-fill itself still walks any reachable connected SOIL — so
 * a chunk that crosses the window edge is detected fully). This lets
 * collapse and avalanche systems skip iterating millions of cleared
 * cells in deep / virtualised grids.
 */
export function detectChunks(
  tiles: Uint8Array,
  cols: number,
  rows: number,
  topRow = 0,
  bottomRow = rows,
): SoilChunk[] {
  const seen = new Uint8Array(tiles.length)
  const chunks: SoilChunk[] = []
  const stack: number[] = []

  const startIdx = Math.max(0, topRow * cols)
  const endIdx = Math.min(tiles.length, bottomRow * cols)
  for (let i = startIdx; i < endIdx; i++) {
    if (seen[i] || tiles[i] !== TILE_SOIL) continue
    const cells: number[] = []
    let minR = Infinity
    let maxR = -Infinity
    let minC = Infinity
    let maxC = -Infinity

    stack.length = 0
    stack.push(i)
    seen[i] = 1

    while (stack.length) {
      const idx = stack.pop()!
      cells.push(idx)
      const c = idx % cols
      const r = (idx - c) / cols
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c

      if (c > 0) {
        const ni = idx - 1
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (c < cols - 1) {
        const ni = idx + 1
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (r > 0) {
        const ni = idx - cols
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
      if (r < rows - 1) {
        const ni = idx + cols
        if (!seen[ni] && tiles[ni] === TILE_SOIL) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }

    chunks.push({ cells, minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC })
  }
  return chunks
}

/**
 * Compute the distance-to-nearest-anchor for every cell.
 *
 * Anchors (distance 0):
 *   - STONE / FIXTURE cells (always — even if "floating" mid-air;
 *     soil hangs off them regardless of their own stability)
 *   - SOIL cells touching the TOP edge (row 0) — the sky cap
 *   - SOIL cells touching the BOTTOM edge (last row) — the floor
 *   - Side walls (col 0, col cols-1) are NOT anchors. A wall-segment
 *     hanging in mid-air should fall, not float forever.
 *
 * Distance propagates through SOIL cells only (4-connected). Returns
 * an `Int32Array` parallel to `tiles`:
 *   -1 — AIR cell, OR a SOIL cell unreachable from any anchor
 *    0 — anchor cell
 *    N — SOIL cell whose shortest 4-connected soil-path to an anchor
 *        is N edges long
 *
 * This is the shared core used by both `unstableCells` (for the
 * collapse system) and the renderer's always-on weakness gradient
 * (which tints SOIL by its anchor distance — closer = solid, farther
 * = visibly cracked). Cost: O(cells) — single multi-source BFS.
 */
export function anchorDistanceMap(
  tiles: Uint8Array,
  cols: number,
  rows: number,
): Int32Array {
  const dist = new Int32Array(tiles.length)
  dist.fill(-1)
  const queue: number[] = []

  // Seed: anchor tiles themselves are at distance 0
  for (let i = 0; i < tiles.length; i++) {
    if (isAnchorTile(tiles[i]!)) {
      dist[i] = 0
      queue.push(i)
    }
  }
  // Seed: SOIL cells touching the TOP edge (row 0) are anchored.
  for (let c = 0; c < cols; c++) {
    const idx = c // row 0 col c
    if (tiles[idx] === TILE_SOIL && dist[idx] === -1) {
      dist[idx] = 0
      queue.push(idx)
    }
  }
  // Seed: SOIL cells touching the BOTTOM edge (last loaded row) are
  // anchored. This moves down as the streamer extends the world; soil
  // that was anchored to the previous bottom can become unanchored if
  // the new bottom is too far for its path-through-soil.
  for (let c = 0; c < cols; c++) {
    const idx = (rows - 1) * cols + c
    if (tiles[idx] === TILE_SOIL && dist[idx] === -1) {
      dist[idx] = 0
      queue.push(idx)
    }
  }

  // Relaxed BFS — propagate distance through SOIL cells only.
  // FIFO via queue index pointer (avoids shift O(n)).
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]!
    const c = idx % cols
    const r = (idx - c) / cols
    const d = dist[idx]!
    for (let k = 0; k < 4; k++) {
      const dc = k === 0 ? -1 : k === 1 ? 1 : 0
      const dr = k === 2 ? -1 : k === 3 ? 1 : 0
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const ni = nr * cols + nc
      if (tiles[ni] !== TILE_SOIL) continue
      const nd = d + 1
      if (dist[ni] !== -1 && dist[ni]! <= nd) continue
      dist[ni] = nd
      queue.push(ni)
    }
  }
  return dist
}

/**
 * Cantilever collapse rule.
 *
 * Returns the SOIL cell indices whose 4-connected soil-path to the
 * nearest anchor is longer than `maxReach`, plus any unreachable
 * SOIL cells. These are "unstable" — they should sag and fall. As
 * cells fall, the new tile arrangement is re-evaluated next tick;
 * cells that used to be safely chained to an anchor through their
 * neighbors may now be stranded → cascading sags.
 */
export function unstableCells(
  tiles: Uint8Array,
  cols: number,
  rows: number,
  maxReach: number,
): Set<number> {
  const dist = anchorDistanceMap(tiles, cols, rows)
  const out = new Set<number>()
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== TILE_SOIL) continue
    const d = dist[i]!
    if (d === -1 || d > maxReach) out.add(i)
  }
  return out
}

/**
 * Legacy support — kept so existing tests pass. Returns true if the
 * chunk has *any* anchor connection (zero-tolerance rule). New code
 * should use `unstableCells` with a `maxReach` value.
 */
export function isSupported(
  chunk: SoilChunk,
  tiles: Uint8Array,
  cols: number,
  rows: number,
): boolean {
  for (const idx of chunk.cells) {
    const c = idx % cols
    const r = (idx - c) / cols
    if (c === 0 || c === cols - 1) return true
    if (r === rows - 1) return true

    const ns = [idx - 1, idx + 1, idx - cols, idx + cols]
    for (const ni of ns) {
      if (ni < 0 || ni >= tiles.length) continue
      const t = tiles[ni]!
      if (isAnchorTile(t)) return true
    }
  }
  return false
}
