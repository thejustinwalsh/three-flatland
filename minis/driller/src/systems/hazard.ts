import type { World } from 'koota'
import {
  Driller,
  GameState,
  Grid,
  Hazard,
  isAnchorTile,
  TILE_AIR,
  TILE_SOIL,
} from '../traits'
import {
  HAZARD_DEPTH_BOOST,
  HAZARD_GRAVITY_PX,
  HAZARD_SPAWN_COL_RANGE,
  HAZARD_SPAWN_INTERVAL_TICKS,
  HAZARD_TERMINAL_PX,
  HAZARD_WARNING_TICKS,
  PLAY_COLS,
  TILE_PX,
} from '../constants'
import { biomeAt } from '../biomes'
import { createRng } from '../lib/rng'

let lastSpawnTick = 0

/**
 * Periodically spawn a falling-rock hazard above the driller's path.
 * Spawns are gated by:
 *   - cooldown (HAZARD_SPAWN_INTERVAL_TICKS, scaled by biome boost)
 *   - no other warning hazard within ±HAZARD_SPAWN_COL_RANGE columns
 *   - driller exists and is in the playing state
 */
export function hazardSpawnSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs || gs.runState !== 'playing') return
  const driller = world.queryFirst(Driller)
  if (!driller) return
  const d = driller.get(Driller)!
  const grid = world.get(Grid)
  if (!grid) return

  const biome = biomeAt(d.row)
  const boost = HAZARD_DEPTH_BOOST[biome.name] ?? 0
  if (boost <= 0) return // no hazards in topsoil

  const interval = Math.max(60, Math.floor(HAZARD_SPAWN_INTERVAL_TICKS / (1 + boost)))
  if (gs.tick - lastSpawnTick < interval) return

  // Avoid stacking hazards on top of each other.
  let nearbyExists = false
  world.query(Hazard).forEach((entity) => {
    if (nearbyExists) return
    const h = entity.get(Hazard)!
    if (h.phase === 'landed') return
    if (Math.abs(h.col - d.col) <= HAZARD_SPAWN_COL_RANGE) nearbyExists = true
  })
  if (nearbyExists) return

  // Pick a column near the driller (±HAZARD_SPAWN_COL_RANGE).
  const rng = createRng((gs.tick * 0x9e3779b1 + d.col) >>> 0)
  const col = Math.max(
    0,
    Math.min(PLAY_COLS - 1, d.col + rng.intRange(-HAZARD_SPAWN_COL_RANGE, HAZARD_SPAWN_COL_RANGE)),
  )

  // Find the first AIR cell directly above the driller in that column —
  // that's where the warning indicator hovers. If the column is solid all
  // the way up, abort.
  let warningRow = -1
  for (let r = d.row - 2; r >= Math.max(0, d.row - 30); r--) {
    const t = grid.tiles[r * grid.cols + col]
    if (t === TILE_AIR) {
      warningRow = r
      break
    }
  }
  if (warningRow < 0) return

  world.spawn(
    Hazard({
      col,
      py: warningRow * TILE_PX + TILE_PX / 2,
      vy: 0,
      phase: 'warning',
      fallAtTick: gs.tick + HAZARD_WARNING_TICKS,
    }),
  )
  lastSpawnTick = gs.tick
}

/**
 * Tick all hazards: warning → falling → impact.
 *
 * Falling hazards crash through SOIL cells (turning them to AIR), so they
 * carve a small vertical channel as they fall. Stops on STONE / ROCK /
 * FIXTURE. Crushes the driller on cell-collision.
 */
export function hazardTickSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles } = grid

  world.query(Hazard).forEach((entity) => {
    const h = entity.get(Hazard)!

    if (h.phase === 'warning') {
      if (gs.tick >= h.fallAtTick) {
        entity.set(Hazard, { phase: 'falling', vy: 0 })
      }
      return
    }
    if (h.phase === 'landed') {
      entity.destroy()
      return
    }

    // falling
    const newVy = Math.min(h.vy + HAZARD_GRAVITY_PX, HAZARD_TERMINAL_PX)
    const newPy = h.py + newVy
    const newRow = Math.floor(newPy / TILE_PX)
    if (newRow >= rows) {
      entity.destroy()
      return
    }

    // Crush the driller if we land on its cell.
    const driller = world.queryFirst(Driller)
    if (driller) {
      const d = driller.get(Driller)!
      if (d.col === h.col && d.row === newRow) {
        world.set(GameState, { runState: 'dying' })
      }
    }

    // Collide with any non-AIR, non-SOIL tile (anchor stops the rock).
    const idx = newRow * cols + h.col
    const tileBelow = tiles[idx]!
    if (tileBelow !== TILE_AIR && tileBelow !== TILE_SOIL && isAnchorTile(tileBelow)) {
      entity.set(Hazard, { phase: 'landed' })
      return
    }
    // Punch through soil.
    if (tileBelow === TILE_SOIL) {
      tiles[idx] = TILE_AIR
    }

    entity.set(Hazard, { py: newPy, vy: newVy })
  })
}

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
}
