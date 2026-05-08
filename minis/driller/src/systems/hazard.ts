import type { World } from 'koota'
import {
  Driller,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Grid,
  Hazard,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import {
  HAZARD_DEPTH_BOOST,
  HAZARD_GRAVITY_PX,
  HAZARD_SPAWN_COL_RANGE,
  HAZARD_SPAWN_INTERVAL_FLOOR,
  HAZARD_SPAWN_INTERVAL_TICKS,
  HAZARD_TERMINAL_PX,
  HAZARD_WARNING_TICKS,
  PLAYFIELD_TOP_OFFSET_ROWS,
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
  if (!grid) return

  const biome = biomeAt(d.row)
  const boost = HAZARD_DEPTH_BOOST[biome.name] ?? 0
  if (boost <= 0) return

  const interval = Math.max(
    HAZARD_SPAWN_INTERVAL_FLOOR,
    Math.floor(HAZARD_SPAWN_INTERVAL_TICKS / (1 + boost)),
  )
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

  // Find candidate columns near the driller with a visible AIR column
  // from the LOGICAL playfield top (a fixed N rows above the driller)
  // down at least MIN_FALL_CELLS. A taller viewport must NOT be a
  // hazard-dodging advantage, so we ignore cam.y here on purpose —
  // rocks spawn at the same logical position regardless of how far
  // back into history the renderer is showing.
  const topRow = Math.max(0, d.row - PLAYFIELD_TOP_OFFSET_ROWS)
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

/**
 * Kirby-style avalanche cascade. When 4+ TILE_STONE cells form a
 * 4-connected cluster, the pile is heavy enough to crush the soil
 * below it: every SOIL cell directly under the cluster's bottom edge
 * is converted to AIR. This vacates support for the soil chunk that
 * was holding everything up, so the next `detectAndSag` tick will
 * mark THAT chunk as sagging and the avalanche cascades naturally
 * through the existing collapse system — no new entity types needed.
 *
 * Runs after `hazardTickSystem` so a freshly-landed rock is included
 * in cluster detection on the SAME tick.
 */
const AVALANCHE_THRESHOLD = 4

export function rockAvalancheSystem(world: World): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid

  // 4-connected flood-fill over TILE_STONE.
  const seen = new Uint8Array(tiles.length)
  const stack: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (seen[i] || tiles[i] !== TILE_STONE) continue
    const cells: number[] = []
    stack.length = 0
    stack.push(i)
    seen[i] = 1
    while (stack.length) {
      const idx = stack.pop()!
      cells.push(idx)
      const c = idx % cols
      const r = (idx - c) / cols
      const ns: number[] = []
      if (c > 0) ns.push(idx - 1)
      if (c < cols - 1) ns.push(idx + 1)
      if (r > 0) ns.push(idx - cols)
      if (r < rows - 1) ns.push(idx + cols)
      for (const ni of ns) {
        if (!seen[ni] && tiles[ni] === TILE_STONE) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }
    if (cells.length < AVALANCHE_THRESHOLD) continue

    // Punch through SOIL directly below any STONE in the cluster whose
    // immediate neighbour-down is SOIL (not AIR, not another STONE in
    // the cluster). The cluster itself doesn't move on this tick — the
    // collapse system picks up the now-unsupported soil above next tick.
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      if (r + 1 >= rows) continue
      const belowIdx = (r + 1) * cols + c
      const below = tiles[belowIdx]
      if (below === TILE_SOIL) {
        // Crush only diggable cells (SOIL). Leave other STONE / fixtures /
        // rocks alone — those would each be their own design call.
        tiles[belowIdx] = TILE_AIR
        flags[belowIdx] = (flags[belowIdx] ?? 0) | FLAG_AUTOTILE_DIRTY
        markCellAndNeighborsDirty(world, c, r + 1)
      }
    }
  }
}

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
}
