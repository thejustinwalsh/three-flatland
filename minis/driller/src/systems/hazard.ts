import type { World } from 'koota'
import {
  Camera,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Grid,
  Hazard,
  TILE_AIR,
  TILE_STONE,
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
import { markCellAndNeighborsDirty } from './autotile-pass'

let lastSpawnTick = 0

const MIN_FALL_CELLS = 3 // need at least this many AIR cells below the warning before spawning

/**
 * Spawn telegraphed falling-rock hazards above the driller. Rocks ONLY
 * spawn where there's a visible AIR column from the top of the viewport
 * down at least MIN_FALL_CELLS — i.e. there's actually an open hole the
 * rock can drop through. The warning indicator appears at the very top
 * of the viewport in that column, "from off-screen above" telegraphing
 * to the player.
 *
 * After the warning ticks expire, the rock falls under gravity, STOPS
 * on the first non-AIR cell, and becomes a permanent STONE tile (a
 * new anchor in the world). Rocks do NOT punch through soil.
 */
export function hazardSpawnSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs || gs.runState !== 'playing') return
  const driller = world.queryFirst(Driller)
  if (!driller) return
  const d = driller.get(Driller)!
  const grid = world.get(Grid)
  const cam = world.get(Camera)
  if (!grid || !cam) return

  const biome = biomeAt(d.row)
  const boost = HAZARD_DEPTH_BOOST[biome.name] ?? 0
  if (boost <= 0) return

  const interval = Math.max(60, Math.floor(HAZARD_SPAWN_INTERVAL_TICKS / (1 + boost)))
  if (gs.tick - lastSpawnTick < interval) return

  // Don't stack hazards: skip if any non-landed Hazard is within the spawn range.
  let nearbyExists = false
  world.query(Hazard).forEach((entity) => {
    if (nearbyExists) return
    const h = entity.get(Hazard)!
    if (h.phase === 'landed') return
    if (Math.abs(h.col - d.col) <= HAZARD_SPAWN_COL_RANGE) nearbyExists = true
  })
  if (nearbyExists) return

  // Find candidate columns near the driller with a visible AIR column from
  // the viewport top down at least MIN_FALL_CELLS.
  const topRow = Math.max(0, Math.floor(cam.y / TILE_PX))
  const { cols, rows, tiles } = grid
  const candidates: { col: number; warningRow: number }[] = []
  for (let dc = -HAZARD_SPAWN_COL_RANGE; dc <= HAZARD_SPAWN_COL_RANGE; dc++) {
    const col = Math.max(0, Math.min(PLAY_COLS - 1, d.col + dc))
    // Need topRow itself to be AIR (the rock spawns there visibly).
    if (tiles[topRow * cols + col] !== TILE_AIR) continue
    // Walk down from topRow+1 — need at least MIN_FALL_CELLS AIR before any solid.
    let airCells = 0
    for (let r = topRow + 1; r < rows; r++) {
      if (tiles[r * cols + col] === TILE_AIR) {
        airCells++
        continue
      }
      break
    }
    if (airCells < MIN_FALL_CELLS) continue
    candidates.push({ col, warningRow: topRow })
  }
  if (candidates.length === 0) return

  const rng = createRng((gs.tick * 0x9e3779b1 + d.col) >>> 0)
  const pick = candidates[rng.intRange(0, candidates.length - 1)]!

  world.spawn(
    Hazard({
      col: pick.col,
      py: pick.warningRow * TILE_PX + TILE_PX / 2,
      vy: 0,
      phase: 'warning',
      fallAtTick: gs.tick + HAZARD_WARNING_TICKS,
    }),
  )
  lastSpawnTick = gs.tick
}

/**
 * Tick all hazards: warning → falling → land (deposit STONE).
 *
 * Rocks STOP on the first non-AIR cell they encounter. The cell
 * immediately ABOVE that obstacle becomes a TILE_STONE — a permanent
 * anchor in the world. The rock is now an obstacle for the driller to
 * dig around (or use the new STONE as a brace for collapse purposes).
 */
export function hazardTickSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid

  world.query(Hazard).forEach((entity) => {
    const h = entity.get(Hazard)!

    if (h.phase === 'warning') {
      if (gs.tick >= h.fallAtTick) entity.set(Hazard, { phase: 'falling', vy: 0 })
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

    // Crush check at the cell the hazard occupies this tick.
    const driller = world.queryFirst(Driller)
    if (driller) {
      const d = driller.get(Driller)!
      if (d.col === h.col && d.row === newRow) {
        world.set(GameState, { runState: 'dying' })
      }
    }

    const idx = newRow * cols + h.col
    const tileHere = tiles[idx]!

    // STOP on first non-AIR cell. Drop a STONE in the cell immediately
    // above (the last AIR cell the rock occupied).
    if (tileHere !== TILE_AIR) {
      const restRow = newRow - 1
      if (restRow >= 0) {
        const restIdx = restRow * cols + h.col
        // Only stamp a STONE if the resting cell is AIR (sanity).
        if (tiles[restIdx] === TILE_AIR) {
          tiles[restIdx] = TILE_STONE
          flags[restIdx] = (flags[restIdx] ?? 0) | FLAG_AUTOTILE_DIRTY
          markCellAndNeighborsDirty(world, h.col, restRow)
        }
      }
      entity.set(Hazard, { phase: 'landed' })
      return
    }

    entity.set(Hazard, { py: newPy, vy: newVy })
  })
}

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
}
