import type { Entity, World } from 'koota'
import { Camera, Driller, GameState, Gem, Grid, TILE_AIR } from '../traits'
import { FALL_INTERVAL_MS, PLAYFIELD_TOP_OFFSET_ROWS, TILE_PX } from '../constants'

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
    if (!g || g.collected) return

    // Smooth-py lerp from prevRow → row across the active fall step.
    const fromPy = g.prevRow * TILE_PX + TILE_PX / 2
    const toPy = g.row * TILE_PX + TILE_PX / 2
    const progress = g.stepDurationMs > 0
      ? Math.min(1, Math.max(0, 1 - g.fallCooldownMs / g.stepDurationMs))
      : 1
    const smoothPx = g.col * TILE_PX + TILE_PX / 2
    const smoothPy = fromPy + (toPy - fromPy) * progress

    // Touch-pickup at the driller's CURRENT cell. Done first so a gem
    // that's already in the driller's cell (e.g. fell onto the driller
    // last tick while ground was being dug out) gets collected even if
    // the gem is now blocked from falling further.
    if (drillerCell && g.col === drillerCell.col && g.row === drillerCell.row) {
      collectGem(world, entity)
      return
    }

    // Above the LOGICAL playfield top = inside the darkening overlay
    // band. The grey box kills gems no matter what — the driller has
    // fallen past them and they can never be caught from there. We
    // give the renderer a 4-row death window above the playfield top
    // to play an eased scale-out before the entity is destroyed.
    const playfieldTop = drillerCell ? drillerCell.row - PLAYFIELD_TOP_OFFSET_ROWS : topRow
    if (g.row < playfieldTop - GEM_DEATH_ROWS) {
      entity.destroy()
      return
    }
    if (g.row > bottomRow) {
      // Out of view below — keep px/py up to date so it doesn't pop
      // when the driller next descends past it.
      entity.set(Gem, { px: smoothPx, py: smoothPy })
      return
    }

    const belowRow = g.row + 1
    if (belowRow >= grid.rows) {
      entity.set(Gem, { px: smoothPx, py: smoothPy })
      return
    }
    const belowIdx = belowRow * grid.cols + g.col
    const below = grid.tiles[belowIdx]
    if (below === undefined || below !== TILE_AIR) {
      // At rest — clear any in-flight step state and keep px/py at the
      // current cell center.
      entity.set(Gem, {
        prevRow: g.row,
        px: smoothPx,
        py: toPy,
        fallCooldownMs: 0,
        stepDurationMs: 0,
      })
      return
    }

    const cd = Math.max(0, g.fallCooldownMs - deltaMs)
    if (cd > 0) {
      entity.set(Gem, { fallCooldownMs: cd, px: smoothPx, py: smoothPy })
      return
    }

    // If the cell we're about to fall into is the driller's cell,
    // collect on contact instead of moving the gem there.
    if (drillerCell && g.col === drillerCell.col && belowRow === drillerCell.row) {
      collectGem(world, entity)
      return
    }

    // Commit a new fall step. Snap visible py to the OLD cell so the
    // next tick's lerp begins at progress 0. Same FALL_INTERVAL_MS for
    // all gems everywhere — no special free-fall mode.
    entity.set(Gem, {
      prevRow: g.row,
      row: belowRow,
      px: smoothPx,
      py: toPy,
      fallCooldownMs: FALL_INTERVAL_MS,
      stepDurationMs: FALL_INTERVAL_MS,
    })
  })
}

/**
 * How many rows above the playfield top a gem keeps existing while
 * it scales out. Mirrored by GemRenderer's death-tween window.
 */
export const GEM_DEATH_ROWS = 4

function collectGem(world: World, entity: Entity): void {
  const gs = world.get(GameState)
  if (gs) world.set(GameState, { gems: gs.gems + 1 })
  entity.destroy()
}
