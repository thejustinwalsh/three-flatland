import type { Entity, World } from 'koota'
import { Camera, Driller, GameState, Gem, Grid, TILE_AIR } from '../traits'
import { FALL_INTERVAL_MS, TILE_PX } from '../constants'

/**
 * Gravity for gems — once a gem has entered the camera viewport, it
 * follows the same falling rules as the driller: if the cell directly
 * below is AIR, drop one row per FALL_INTERVAL_MS.
 *
 * Off-screen gems (above the camera or far below it) are skipped — they
 * remain stationary in the soil they were generated into until the
 * driller's descent brings them into view, at which point any gem
 * floating above an open hole begins to fall.
 *
 * Scattered gems (post-death) keep their own px/py float-position via
 * the existing scatter timer; this system only acts on un-scattered,
 * un-collected gems with `scatteredUntilTick === 0`.
 */
export function gemGravitySystem(world: World, deltaMs: number): void {
  const cam = world.get(Camera)
  const grid = world.get(Grid)
  if (!cam || !grid) return

  const topRow = Math.floor(cam.y / TILE_PX) - 2
  const bottomRow = topRow + cam.rows + 4

  // Snapshot the driller's cell once — gems that land on it should be
  // auto-collected regardless of which direction the encounter came
  // from (driller walked into a stationary gem, or a gem fell onto the
  // driller's head).
  const drillerEntity = world.queryFirst(Driller)
  const drillerCell = drillerEntity ? drillerEntity.get(Driller)! : null

  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected || g.scatteredUntilTick !== 0) return

    // Touch-pickup at the driller's CURRENT cell. Done first so a gem
    // that's already in the driller's cell (e.g. fell onto the driller
    // last tick while ground was being dug out) gets collected even if
    // the gem is now blocked from falling further.
    if (drillerCell && g.col === drillerCell.col && g.row === drillerCell.row) {
      collectGem(world, entity)
      return
    }

    if (g.row < topRow || g.row > bottomRow) return // out of view

    const belowRow = g.row + 1
    if (belowRow >= grid.rows) return
    const belowIdx = belowRow * grid.cols + g.col
    const below = grid.tiles[belowIdx]
    if (below === undefined || below !== TILE_AIR) return

    const cd = Math.max(0, g.fallCooldownMs - deltaMs)
    if (cd > 0) {
      entity.set(Gem, { fallCooldownMs: cd })
      return
    }

    // If the cell we're about to fall into is the driller's cell,
    // collect on contact instead of moving the gem there.
    if (drillerCell && g.col === drillerCell.col && belowRow === drillerCell.row) {
      collectGem(world, entity)
      return
    }

    entity.set(Gem, { row: belowRow, fallCooldownMs: FALL_INTERVAL_MS })
  })
}

function collectGem(world: World, entity: Entity): void {
  const gs = world.get(GameState)
  if (gs) world.set(GameState, { gems: gs.gems + 1 })
  entity.destroy()
}
