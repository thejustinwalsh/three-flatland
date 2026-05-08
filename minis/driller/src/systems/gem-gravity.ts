import type { World } from 'koota'
import { Camera, Gem, Grid, TILE_AIR } from '../traits'
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

  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected || g.scatteredUntilTick !== 0) return
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
    entity.set(Gem, { row: belowRow, fallCooldownMs: FALL_INTERVAL_MS })
  })
}
