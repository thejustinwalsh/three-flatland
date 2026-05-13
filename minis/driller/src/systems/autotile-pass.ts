import type { World } from 'koota'
import {
  FLAG_AUTOTILE_DIRTY,
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
 * Mark a cell + 8-neighbor halo as autotile-dirty.
 *
 * Pre-diffusion this also wrote FLAG_DISTURBED / FLAG_SAG_RECHECK
 * on neighbors to gate the legacy stability detector. With
 * `Grid.anchorDist` driven each tick by `relaxAnchorDist()`, the
 * stability re-evaluation is automatic — drilling a cell turns it
 * to AIR, the diffusion step picks up the topology change next
 * tick, and the wavefront propagates outward at 1 cell/tick. No
 * imperative flag-writing needed.
 */
export function markCellAndNeighborsDirty(world: World, col: number, row: number): void {
  markAutotileDirty(world, col, row)
}

/**
 * Mark a cell + 8-neighbor halo as autotile-dirty WITHOUT triggering
 * sag re-check. Use ONLY for purely cosmetic re-resolves (changing
 * a non-SOIL frame, etc.). With the diffusion model, every mutation
 * is "free" from a re-evaluation perspective — the relaxation runs
 * unconditionally — so this is now equivalent to
 * `markCellAndNeighborsDirty`.
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
