import type { World } from 'koota'
import {
  Driller,
  Explosive,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Gem,
  Grid,
  TILE_AIR,
  TILE_EXPLOSIVE,
} from '../traits'
import {
  EXPLOSIVE_FUSE_TICKS,
  EXPLOSIVE_TRIGGER_RADIUS,
  EXPLOSION_RADIUS,
} from '../constants'
import { markCellAndNeighborsDirty } from './autotile-pass'

/**
 * Explosive lifecycle:
 *   1. Generated as TILE_EXPLOSIVE + an Explosive entity at the cell.
 *   2. When the driller is within EXPLOSIVE_TRIGGER_RADIUS, set triggered=true,
 *      fuseRemaining=EXPLOSIVE_FUSE_TICKS. Visual: cell pulses red.
 *   3. Each tick decrement fuseRemaining. On 0, detonate.
 *   4. Detonate: every cell within EXPLOSION_RADIUS (Chebyshev) becomes AIR.
 *      Gems in the area are destroyed. Other Explosives in the area chain
 *      (re-trigger immediately, fuse=0 next tick).
 *      Driller in radius → death.
 */
export function explosiveSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
  const drillerEntity = world.queryFirst(Driller)
  const driller = drillerEntity?.get(Driller)

  // Pass 1: trigger any explosive within driller adjacency.
  if (driller) {
    world.query(Explosive).forEach((entity) => {
      const e = entity.get(Explosive)!
      if (e.triggered) return
      const dx = Math.abs(e.col - driller.col)
      const dy = Math.abs(e.row - driller.row)
      if (dx <= EXPLOSIVE_TRIGGER_RADIUS && dy <= EXPLOSIVE_TRIGGER_RADIUS) {
        entity.set(Explosive, { triggered: true, fuseRemaining: EXPLOSIVE_FUSE_TICKS })
      }
    })
  }

  // Pass 2: tick triggered explosives + detonate at fuse=0.
  const detonations: { col: number; row: number }[] = []
  world.query(Explosive).forEach((entity) => {
    const e = entity.get(Explosive)!
    if (!e.triggered) return
    const next = e.fuseRemaining - 1
    if (next > 0) {
      entity.set(Explosive, { fuseRemaining: next })
      return
    }
    detonations.push({ col: e.col, row: e.row })
    entity.destroy()
  })

  // Pass 3: apply detonations. May chain-trigger neighbors which fire next tick.
  for (const det of detonations) {
    detonate(world, det.col, det.row, cols, rows, tiles, flags)
    // Chain: any other explosive in radius → triggered with 0 fuse.
    world.query(Explosive).forEach((entity) => {
      const e = entity.get(Explosive)!
      const dx = Math.abs(e.col - det.col)
      const dy = Math.abs(e.row - det.row)
      if (dx <= EXPLOSION_RADIUS && dy <= EXPLOSION_RADIUS) {
        entity.set(Explosive, { triggered: true, fuseRemaining: 1 })
      }
    })
    // Driller in blast → death.
    if (driller) {
      const dx = Math.abs(driller.col - det.col)
      const dy = Math.abs(driller.row - det.row)
      if (dx <= EXPLOSION_RADIUS && dy <= EXPLOSION_RADIUS) {
        world.set(GameState, { runState: 'dying' })
      }
    }
  }
}

function detonate(
  world: World,
  col: number,
  row: number,
  cols: number,
  rows: number,
  tiles: Uint8Array,
  flags: Uint8Array,
): void {
  for (let dr = -EXPLOSION_RADIUS; dr <= EXPLOSION_RADIUS; dr++) {
    for (let dc = -EXPLOSION_RADIUS; dc <= EXPLOSION_RADIUS; dc++) {
      const c = col + dc
      const r = row + dr
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue
      const idx = r * cols + c
      const t = tiles[idx]!
      // STONE and FIXTURE survive explosions; ROCK and SOIL and EXPLOSIVE go.
      if (t === TILE_AIR) continue
      if (t === TILE_EXPLOSIVE) {
        tiles[idx] = TILE_AIR
        flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
        markCellAndNeighborsDirty(world, c, r)
        continue
      }
      // SOIL, ROCK → vaporized
      if (t === 1 /* TILE_SOIL */ || t === 8 /* TILE_ROCK */) {
        tiles[idx] = TILE_AIR
        flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
        markCellAndNeighborsDirty(world, c, r)
      }
    }
  }
  // Vaporize gems in radius.
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)!
    if (g.collected) return
    const dx = Math.abs(g.col - col)
    const dy = Math.abs(g.row - row)
    if (dx <= EXPLOSION_RADIUS && dy <= EXPLOSION_RADIUS) entity.destroy()
  })
}
