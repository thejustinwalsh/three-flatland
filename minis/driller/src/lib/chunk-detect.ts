import {
  ANCHOR_DIST_INF,
  isFixtureTile,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'

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
 * Returns true if the tile is part of the anchor-distance graph (i.e.
 * a conductor that propagates anchor distance to its neighbors). SOIL
 * and STONE both conduct at +1 cost; AIR is not in the graph;
 * FIXTUREs are walls (they emit a seed UP into their above-neighbor
 * but do not conduct distance through themselves).
 */
function isConductor(t: number): boolean {
  return t === TILE_SOIL || t === TILE_STONE
}

/**
 * Collect anchor seed indices for the diffusion model.
 *
 * Seeds (cells whose anchor distance is pinned at 0):
 *   - Row 0 SOIL/STONE cells (top edge — the world surface)
 *   - The cell DIRECTLY ABOVE each FIXTURE (if SOIL/STONE) — the
 *     fixture acts as a load-bearing pillar that anchors the column
 *     above it. Fixtures themselves are walls (no propagation).
 *
 * Note: bottom-loaded edge is NOT a seed (we drop the streaming-defer
 * hack). The pre-settle BFS bakes the steady-state distance for the
 * chunk as it loads; when the floor recedes (chunks below stream in),
 * relaxation handles the transition naturally — previously-floor
 * cells climb in distance over several ticks and the player sees the
 * wavefront.
 */
function collectAnchorSeeds(
  tiles: Uint8Array,
  cols: number,
  rows: number,
): number[] {
  const seeds: number[] = []
  // Top edge — row 0 conductors.
  for (let c = 0; c < cols; c++) {
    const idx = c
    if (isConductor(tiles[idx]!)) seeds.push(idx)
  }
  // Fixtures emit a seed into the cell DIRECTLY ABOVE (if conductor).
  for (let i = 0; i < tiles.length; i++) {
    if (!isFixtureTile(tiles[i]!)) continue
    const c = i % cols
    const r = (i - c) / cols
    const above = r - 1
    if (above < 0) continue
    const aboveIdx = above * cols + c
    if (isConductor(tiles[aboveIdx]!)) seeds.push(aboveIdx)
  }
  void rows
  return seeds
}

/**
 * Pre-settle the anchor distance grid via a single multi-source BFS
 * from the current seeds. Called when worldgen creates a chunk and
 * after large structural mutations (explosions, world rotation) that
 * would take the slow relaxation many ticks to converge through.
 *
 * Writes into `dist` directly; AIR cells are set to ANCHOR_DIST_INF
 * so they have no effect on the relaxation step.
 */
export function seedAnchorsBFS(
  tiles: Uint8Array,
  dist: Uint8Array,
  cols: number,
  rows: number,
): void {
  // Reset to infinity, then seed.
  dist.fill(ANCHOR_DIST_INF)
  const seeds = collectAnchorSeeds(tiles, cols, rows)
  const queue: number[] = []
  for (const s of seeds) {
    if (dist[s] !== 0) {
      dist[s] = 0
      queue.push(s)
    }
  }
  // 4-connected BFS through CONDUCTORS (SOIL + STONE). FIXTUREs are
  // walls — distance does not propagate through them. AIR is not in
  // the graph.
  let head = 0
  while (head < queue.length) {
    const idx = queue[head++]!
    const c = idx % cols
    const r = (idx - c) / cols
    const d = dist[idx]!
    const nd = d + 1
    if (nd >= ANCHOR_DIST_INF) continue // can't go further
    // 4 neighbors
    const ns: number[] = []
    if (c > 0) ns.push(idx - 1)
    if (c < cols - 1) ns.push(idx + 1)
    if (r > 0) ns.push(idx - cols)
    if (r < rows - 1) ns.push(idx + cols)
    for (const ni of ns) {
      if (!isConductor(tiles[ni]!)) continue
      if (dist[ni]! <= nd) continue
      dist[ni] = nd
      queue.push(ni)
    }
  }
}

/**
 * One step of diffusion-based anchor distance update. Run every tick
 * from `collapseTick`. Variant C policy:
 *   - Rising stress (target > stored): increment stored by +1 (slow).
 *     A wavefront of weakness propagates outward at exactly 1 cell/tick,
 *     visible to the player as the cracking gradient deepens.
 *   - Falling stress (target < stored): snap stored = target (instant).
 *     Strength gain (a fixture coming back into anchor range, a rock
 *     landing nearby) doesn't need telegraph.
 *
 * For each non-AIR cell:
 *   target = isSeed ? 0 : min(neighbor.dist) + 1
 *
 * Cost: O(cells). Walks the full grid each tick. The relaxation is
 * cheap per-cell (4 neighbor reads + min + write) so this is
 * essentially memory-bound.
 *
 * Returns the number of cells whose stored distance changed this tick
 * — useful for early-exit optimization (if 0, the grid converged).
 */
export function relaxAnchorDist(
  tiles: Uint8Array,
  dist: Uint8Array,
  cols: number,
  rows: number,
): number {
  let changed = 0
  // Pre-compute seed mask in a single pass: a cell is a seed if it's
  // a conductor in row 0, or the conductor directly above a fixture.
  // We can't easily memoize this without extra storage, so we test
  // inline per cell — cheap (no allocations).
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!
    if (t === TILE_AIR) {
      // AIR cells: keep at INF (or set if not). They participate in
      // neither seeding nor conduction.
      if (dist[i] !== ANCHOR_DIST_INF) {
        dist[i] = ANCHOR_DIST_INF
        changed++
      }
      continue
    }
    if (isFixtureTile(t)) {
      // FIXTURE cells are walls; their own stored value is unused.
      // Pin to INF so they don't pollute the gradient if read.
      if (dist[i] !== ANCHOR_DIST_INF) {
        dist[i] = ANCHOR_DIST_INF
        changed++
      }
      continue
    }
    // Conductor (SOIL or STONE).
    const c = i % cols
    const r = (i - c) / cols
    const isSeed =
      r === 0 || (r > 0 && isFixtureTile(tiles[(r - 1) * cols + c]!))
    let target: number
    if (isSeed) {
      target = 0
    } else {
      // min over conductor neighbors + 1.
      let minN = ANCHOR_DIST_INF
      if (c > 0) {
        const ni = i - 1
        if (isConductor(tiles[ni]!)) {
          const d = dist[ni]!
          if (d < minN) minN = d
        }
      }
      if (c < cols - 1) {
        const ni = i + 1
        if (isConductor(tiles[ni]!)) {
          const d = dist[ni]!
          if (d < minN) minN = d
        }
      }
      if (r > 0) {
        const ni = i - cols
        if (isConductor(tiles[ni]!)) {
          const d = dist[ni]!
          if (d < minN) minN = d
        }
      }
      if (r < rows - 1) {
        const ni = i + cols
        if (isConductor(tiles[ni]!)) {
          const d = dist[ni]!
          if (d < minN) minN = d
        }
      }
      target = minN >= ANCHOR_DIST_INF ? ANCHOR_DIST_INF : minN + 1
      if (target > ANCHOR_DIST_INF) target = ANCHOR_DIST_INF
    }
    const stored = dist[i]!
    if (target > stored) {
      // Rising stress — propagate by +1 per tick.
      if (stored < ANCHOR_DIST_INF) {
        dist[i] = stored + 1
        changed++
      }
    } else if (target < stored) {
      // Falling stress — snap instantly.
      dist[i] = target
      changed++
    }
  }
  return changed
}

/**
 * Compatibility wrapper: full BFS one-shot. Kept for legacy callers
 * (renderer pre-diffusion read, tests). New code should read
 * `Grid.anchorDist` directly. Returns a fresh Int32Array sized to
 * `tiles.length` with -1 for unreachable / AIR cells (matching the
 * legacy contract).
 */
export function anchorDistanceMap(
  tiles: Uint8Array,
  cols: number,
  rows: number,
): Int32Array {
  const dist = new Uint8Array(tiles.length)
  seedAnchorsBFS(tiles, dist, cols, rows)
  const out = new Int32Array(tiles.length)
  for (let i = 0; i < tiles.length; i++) {
    const d = dist[i]!
    out[i] = d >= ANCHOR_DIST_INF ? -1 : d
  }
  return out
}

/**
 * Cantilever collapse rule (diffusion-aware). Returns the SOIL cell
 * indices whose persistent `dist > maxReach`, plus any cells with
 * INF (no anchor path). These are "unstable" and should sag.
 *
 * Reads from a pre-computed `dist` array — typically `grid.anchorDist`
 * driven by `relaxAnchorDist()`. Tests can pass an ad-hoc dist from
 * `seedAnchorsBFS()` for steady-state assertions.
 */
export function unstableCells(
  tiles: Uint8Array,
  dist: Uint8Array,
  maxReach: number,
): Set<number> {
  const out = new Set<number>()
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== TILE_SOIL) continue
    const d = dist[i]!
    if (d >= ANCHOR_DIST_INF || d > maxReach) out.add(i)
  }
  return out
}
