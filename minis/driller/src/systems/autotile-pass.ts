import type { World } from 'koota'
import {
  FLAG_AUTOTILE_DIRTY,
  FLAG_SAG_RECHECK,
  Grid,
  TILE_AIR,
  TILE_SOIL,
} from '../traits'
import { autotileMask, maskToAtlasIndex } from '../lib/autotile'

/**
 * Sweep the grid: for every cell with FLAG_AUTOTILE_DIRTY set, recompute
 * its autotile bitmask and write the resolved frame index into
 * `Grid.frameIndex[i]`. The dirty flag is cleared at the same time.
 *
 * Non-SOIL cells get frame 0 (their atlas region resolves variant
 * differently, e.g. STONE picks a per-cell variant from STONE_VARIANTS).
 *
 * Cheap: cost is O(dirty cells), not O(grid). Each dig touches ~9 cells
 * (the dug cell + 8 neighbors), so amortized ~9 frame resolves per dig.
 */
export function autotilePass(world: World): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags, frameIndex } = grid
  if (frameIndex.length !== tiles.length) return

  const isSoil = (col: number, row: number): boolean => {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return false
    return tiles[row * cols + col] === TILE_SOIL
  }

  for (let i = 0; i < tiles.length; i++) {
    if ((flags[i]! & FLAG_AUTOTILE_DIRTY) === 0) continue
    const tile = tiles[i]!
    if (tile === TILE_AIR || tile !== TILE_SOIL) {
      frameIndex[i] = 0
      flags[i] = (flags[i]! & ~FLAG_AUTOTILE_DIRTY) as number
      continue
    }
    const c = i % cols
    const r = Math.floor(i / cols)
    frameIndex[i] = maskToAtlasIndex(autotileMask(c, r, isSoil))
    flags[i] = (flags[i]! & ~FLAG_AUTOTILE_DIRTY) as number
  }
}

/**
 * Helper used by tests + generators to mark the just-changed cell and its
 * 8-neighbor halo as dirty (autotile resolves the cell + every neighbor
 * whose mask changed).
 *
 * Also tags the 4-neighbor SOIL cells with FLAG_SAG_RECHECK so the
 * cantilever sag detector knows to re-evaluate the chunks containing
 * those cells. Without this gate, the sag rule would fire every tick
 * on every soil chunk in the world (including freshly-loaded chunks
 * that nobody disturbed) — the cause of "half a fully-attached wall
 * shaking" + "just-spawned things shaking" symptoms.
 */
export function markCellAndNeighborsDirty(world: World, col: number, row: number): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = col + dc
      const nr = row + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      flags[nr * cols + nc]! |= FLAG_AUTOTILE_DIRTY
    }
  }
  // Tag the 4-neighbor SOIL cells for sag re-check.
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nc = col + dc
    const nr = row + dr
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
    const nIdx = nr * cols + nc
    if (tiles[nIdx] === TILE_SOIL) {
      flags[nIdx]! |= FLAG_SAG_RECHECK
    }
  }
}
