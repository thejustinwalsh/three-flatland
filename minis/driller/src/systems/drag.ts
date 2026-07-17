import type { World } from 'koota'
import {
  Drag,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_SHAKING,
  GameState,
  Grid,
  Pointer,
  TILE_AIR,
  TILE_STONE,
} from '../traits'
import {
  DRAG_COST_INTERVAL_TICKS,
  DRAG_COST_PER_INTERVAL,
  DRAG_COST_SCALE_PER_INTERVAL,
} from '../constants'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { spendGems } from './gem-spend'

/**
 * Start a drag on the stone cluster at (col, row). Pauses gravity on
 * every cell in the cluster (clearing FLAG_FALLING / FLAG_SHAKING) so
 * the player can position it freely. Returns true on success.
 */
export function startDrag(world: World, col: number, row: number): boolean {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  const drag = world.get(Drag)
  if (!grid || !gs || !drag) return false
  if (drag.clusterId !== 0) return false // already dragging
  const idx = row * grid.cols + col
  if (grid.tiles[idx] !== TILE_STONE) return false
  const cid = grid.clusterId[idx] ?? 0
  if (cid === 0) return false
  // Pause gravity on every cluster cell.
  for (let i = 0; i < grid.clusterId.length; i++) {
    if (grid.clusterId[i] !== cid) continue
    if (grid.tiles[i] !== TILE_STONE) continue
    grid.flags[i] = ((grid.flags[i] ?? 0) & ~FLAG_FALLING & ~FLAG_SHAKING) | FLAG_AUTOTILE_DIRTY
  }
  world.set(Drag, {
    clusterId: cid,
    anchorCol: col,
    anchorRow: row,
    startTick: gs.tick,
    intervalsCharged: 0,
  })
  return true
}

/**
 * Finish a drag. Re-arms FLAG_FALLING on every cluster cell so the
 * avalanche system resumes its fall from wherever the drag left it.
 */
export function endDrag(world: World): void {
  const drag = world.get(Drag)
  if (!drag || drag.clusterId === 0) return
  const grid = world.get(Grid)
  if (grid) {
    for (let i = 0; i < grid.clusterId.length; i++) {
      if (grid.clusterId[i] !== drag.clusterId) continue
      if (grid.tiles[i] !== TILE_STONE) continue
      grid.flags[i] = (grid.flags[i] ?? 0) | FLAG_FALLING | FLAG_AUTOTILE_DIRTY
    }
  }
  world.set(Drag, { clusterId: 0 })
}

/**
 * Per-tick drag driver:
 *   1. Bill any newly-crossed cost intervals; release on insolvency.
 *   2. Translate the cluster toward the pointer if the cell offset is
 *      navigable (target cells all AIR or part of the cluster itself).
 *
 * If the pointer goes inactive mid-drag the system auto-releases.
 */
export function dragSystem(world: World): void {
  const drag = world.get(Drag)
  if (!drag || drag.clusterId === 0) return
  const ptr = world.get(Pointer)
  const gs = world.get(GameState)
  const grid = world.get(Grid)
  if (!ptr || !gs || !grid) return
  if (!ptr.active) {
    endDrag(world)
    return
  }

  // Bill any newly-crossed cost intervals. The popup pops over the
  // cluster's current anchor cell so the cost is visible in-world.
  const elapsed = gs.tick - drag.startTick
  const intervalsNow = Math.floor(elapsed / DRAG_COST_INTERVAL_TICKS)
  if (intervalsNow > drag.intervalsCharged) {
    let owed = 0
    for (let i = drag.intervalsCharged; i < intervalsNow; i++) {
      owed += DRAG_COST_PER_INTERVAL + i * DRAG_COST_SCALE_PER_INTERVAL
    }
    if (!spendGems(world, owed, drag.anchorCol, drag.anchorRow)) {
      endDrag(world)
      return
    }
    world.set(Drag, { intervalsCharged: intervalsNow })
  }

  const offsetCol = ptr.hoverTargetCol - drag.anchorCol
  const offsetRow = ptr.hoverTargetRow - drag.anchorRow
  if (offsetCol === 0 && offsetRow === 0) return

  // Gather current cluster cells.
  const fromIdxs: number[] = []
  for (let i = 0; i < grid.clusterId.length; i++) {
    if (grid.clusterId[i] !== drag.clusterId) continue
    if (grid.tiles[i] !== TILE_STONE) continue
    fromIdxs.push(i)
  }
  if (fromIdxs.length === 0) {
    endDrag(world)
    return
  }

  // Compute target indices + bail on any out-of-bounds.
  const targets: { from: number; to: number }[] = []
  for (const fi of fromIdxs) {
    const c = fi % grid.cols
    const r = Math.floor(fi / grid.cols)
    const tc = c + offsetCol
    const tr = r + offsetRow
    if (tc < 0 || tc >= grid.cols || tr < 0 || tr >= grid.rows) return
    targets.push({ from: fi, to: tr * grid.cols + tc })
  }
  // Collision: every target must be AIR or be a cell the cluster is
  // vacating this tick.
  const fromSet = new Set(fromIdxs)
  for (const t of targets) {
    if (fromSet.has(t.to)) continue
    const tile = grid.tiles[t.to]
    if (tile === undefined) return
    if (tile !== TILE_AIR) return
  }

  // Atomic move: snapshot, clear, write.
  const snapshot = targets.map((t) => ({
    to: t.to,
    tile: grid.tiles[t.from]!,
    flags: grid.flags[t.from]!,
    hits: grid.hits[t.from]!,
    cid: grid.clusterId[t.from]!,
  }))
  for (const fi of fromIdxs) {
    grid.tiles[fi] = TILE_AIR
    grid.flags[fi] = FLAG_AUTOTILE_DIRTY
    grid.hits[fi] = 0
    grid.clusterId[fi] = 0
    const c = fi % grid.cols
    const r = Math.floor(fi / grid.cols)
    markCellAndNeighborsDirty(world, c, r)
  }
  for (const s of snapshot) {
    grid.tiles[s.to] = s.tile
    grid.flags[s.to] = (s.flags & ~FLAG_FALLING & ~FLAG_SHAKING) | FLAG_AUTOTILE_DIRTY
    grid.hits[s.to] = s.hits
    grid.clusterId[s.to] = s.cid
    const c = s.to % grid.cols
    const r = Math.floor(s.to / grid.cols)
    markCellAndNeighborsDirty(world, c, r)
  }

  // Anchor moves with the cluster — pointer offset is relative to the
  // last successful translation, not the original grab point.
  world.set(Drag, {
    anchorCol: ptr.hoverTargetCol,
    anchorRow: ptr.hoverTargetRow,
  })
}
