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
  cells: () => [] as ChunkCell[],
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
 */
export const FallingChunk = trait({
  cells: () => [] as ChunkCell[],
  px: 0,
  py: 0,
  vy: 0,
})
