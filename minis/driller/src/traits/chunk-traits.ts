import { trait } from 'koota'

/**
 * One cell within a sagging or falling chunk. The cell carries its original
 * tile class so reattach can write the correct value back into the grid.
 */
export interface ChunkCell {
  /** World-space cell coordinates; for falling bodies these are the *original* coords (the body's position offset is what moves). */
  col: number
  row: number
  /** Original tile class (TILE_SOIL, etc.). */
  tile: number
}

/**
 * A SOIL chunk that has lost support and is in the sag telegraph window.
 * After `durationTicks` ticks (less any time spent inside `bracedUntilTick`),
 * the chunk releases as a `FallingChunk`.
 */
export const SaggingChunk = trait({
  cells: (): ChunkCell[] => [],
  /** Tick the chunk entered SAGGING state. */
  startTick: 0,
  /** Total sag duration in ticks; constant per spawn (default ~42 ≈ 0.7s @ 60Hz). */
  durationTicks: 42,
  /** While `currentTick < bracedUntilTick`, the sag timer is paused. */
  bracedUntilTick: 0,
})

/**
 * A SOIL chunk that has released and is falling under gravity.
 *
 * `px` / `py` are the floating-point world-pixel position of the body's
 * top-left origin. The cells in `cells` are at integer-grid offsets from
 * that origin. On landing, the body snaps back to the grid and despawns.
 *
 * `releaseRow` is the absolute world row the chunk's top originated at
 * (= initial py / TILE_PX). Used by the landing-time codex check: a
 * 0-displacement landing (final row == release row) means the path
 * closed mid-flight despite shake-entry guarantees, and the cells must
 * be silently restored — never re-stamped at the same grid location.
 */
export const FallingChunk = trait({
  cells: (): ChunkCell[] => [],
  px: 0,
  py: 0,
  vy: 0,
  releaseRow: 0,
})

/**
 * Per-cluster state for a connected group of TILE_STONE cells sharing
 * a single `grid.clusterId`. Cell-to-cluster identity remains on the
 * SoA `grid.clusterId` array (cheap flood-fill / lookup); the entity
 * entity holds the per-cluster state. The cluster's earliest-shake tick
 * lives here so locking semantics (4×4 max bbox) and the partial-fall
 * visible-commit check both read `shakeStartTick` directly from here.
 *
 * Lifecycle:
 *   - Spawned lazily by `rockAvalancheSystem` when a cluster id is
 *     first encountered with at least one cell of telegraph activity
 *     (or any per-cluster state to record).
 *   - Cleaned up at the end of each avalanche tick: entities whose
 *     `clusterId` was not touched this tick (= cluster has zero cells
 *     remaining) are destroyed.
 *
 * Sentinel values for `shakeStartTick`:
 *   - 0   = not currently shaking.
 *   - -1  = "skip telegraph" — set on cells freshly placed by an
 *           in-motion fall step so the cluster doesn't waste 1.5s of
 *           shake before falling again when its FALLING flag clears.
 *   - >0  = tick at which the cluster first entered the shake window.
 */
export const RockCluster = trait({
  clusterId: 0,
  shakeStartTick: 0,
})
