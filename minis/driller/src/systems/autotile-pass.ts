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
 * Mark a cell and its 8-neighbor halo as autotile-dirty AND tag
 * 4-neighbor SOIL cells with FLAG_SAG_RECHECK so the cantilever
 * sag detector re-evaluates them. Use this for PLAYER-driven
 * mutations (drilling, hazard land, explosion) — events that
 * actually destabilise the world.
 */
export function markCellAndNeighborsDirty(world: World, col: number, row: number): void {
  markAutotileDirty(world, col, row)
  // Tag the 4-neighbor SOIL cells for sag re-check.
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
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

/**
 * Same as markCellAndNeighborsDirty but skips SAG_RECHECK on
 * neighbors whose grid index appears in `excludeSet`. Used by
 * FallingChunk.landAndReattach: the landed cells propagate impact
 * into surrounding terrain (so cascades work) but do NOT tag each
 * other — that would re-evaluate the just-landed group as a single
 * unstable chunk on the same tick.
 *
 * The landed cells themselves are also tagged with FLAG_JUST_LANDED
 * by the caller — detectAndSag filters those out of the unstable
 * set for one pass and clears the flag at the end. Net effect: the
 * full sag → darken → shake → fall story plays out from the NEXT
 * tick onward, with chain reactions intact, and no same-tick loops.
 */
export function markCellAndNeighborsDirtyExcept(
  world: World,
  col: number,
  row: number,
  excludeSet: Set<number>,
): void {
  markAutotileDirty(world, col, row)
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nc = col + dc
    const nr = row + dr
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
    const nIdx = nr * cols + nc
    if (excludeSet.has(nIdx)) continue
    if (tiles[nIdx] === TILE_SOIL) {
      flags[nIdx]! |= FLAG_SAG_RECHECK
    }
  }
}

/**
 * Mark a cell + 8-neighbor halo as autotile-dirty WITHOUT triggering
 * sag re-check. Use ONLY for purely cosmetic re-resolves (changing
 * a non-SOIL frame, etc.). Mutations that change the support
 * topology should use markCellAndNeighborsDirty (player events) or
 * markCellAndNeighborsDirtyExcept (chain reactions).
 */
export function markAutotileDirty(world: World, col: number, row: number): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, flags } = grid
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = col + dc
      const nr = row + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      flags[nr * cols + nc]! |= FLAG_AUTOTILE_DIRTY
    }
  }
}
