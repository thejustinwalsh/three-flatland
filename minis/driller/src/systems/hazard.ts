import type { World } from 'koota'
import {
  Driller,
  FLAG_AUTOTILE_DIRTY,
  FLAG_DISTURBED,
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
    // above (the last AIR cell the rock occupied). The new stone is
    // born DISTURBED — a freshly-landed rock counts as destabilising
    // any adjacent stone cluster, which is precisely how "rocks fall
    // when a 4th joins them" works.
    if (tileHere !== TILE_AIR) {
      const restRow = newRow - 1
      if (restRow >= 0) {
        const restIdx = restRow * cols + h.col
        if (tiles[restIdx] === TILE_AIR) {
          tiles[restIdx] = TILE_STONE
          flags[restIdx] = (flags[restIdx] ?? 0) | FLAG_AUTOTILE_DIRTY | FLAG_DISTURBED
          markCellAndNeighborsDirty(world, h.col, restRow)
          // Disturb any STONE in the 4-neighbourhood — the impact
          // shakes the existing pile.
          for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nc = h.col + dc
            const nr = restRow + dr
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
            const nIdx = nr * cols + nc
            if (tiles[nIdx] === TILE_STONE) {
              flags[nIdx] = (flags[nIdx] ?? 0) | FLAG_DISTURBED
            }
          }
        }
      }
      entity.set(Hazard, { phase: 'landed' })
      return
    }

    entity.set(Hazard, { py: newPy, vy: newVy })
  })
}

/**
 * Avalanche cascade. When 4+ TILE_STONE cells form a 4-connected
 * cluster, the pile is heavy enough to fall as a unit. Each "fall
 * step" the cluster shifts down one row; columns where the bottom
 * edge sits over SOIL get crushed (SOIL → AIR) and the rock that did
 * the crushing accumulates a hit on `grid.hits[idx]`. After 4 hits
 * that rock disintegrates — same model as drilling a rock (also 4
 * hits to break in the user-facing mental model).
 *
 * Once a cluster shrinks below 4 rocks it's no longer "heavy enough"
 * and stops falling — remaining stones become static brace tiles.
 *
 * Falling cadence is throttled by `lastAvalancheTick` so cluster
 * descent reads as a heavy crash, not a single-tick teleport.
 */
const AVALANCHE_THRESHOLD = 4
const AVALANCHE_HITS_TO_BREAK = 4
const AVALANCHE_FALL_INTERVAL_TICKS = 12 // ~200ms at 60Hz
let lastAvalancheTick = 0

export function rockAvalancheSystem(world: World): void {
  const gs = world.get(GameState)
  const grid = world.get(Grid)
  if (!gs || !grid) return
  if (gs.tick - lastAvalancheTick < AVALANCHE_FALL_INTERVAL_TICKS) return
  const { cols, rows, tiles, flags, hits } = grid

  // 4-connected flood-fill over TILE_STONE to find each cluster.
  const seen = new Uint8Array(tiles.length)
  const stack: number[] = []
  let advancedAny = false

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

    // Stability rule: a cluster only falls if it has been DISTURBED
    // (a fresh rock landed on/near it, or the driller drilled an
    // adjacent tile). Untouched 4+ piles from world generation are
    // inert until the player actually destabilises them.
    let disturbed = false
    for (const idx of cells) {
      if ((flags[idx]! & FLAG_DISTURBED) !== 0) {
        disturbed = true
        break
      }
    }
    if (!disturbed) continue

    // The cluster can fall iff every cell directly under the cluster's
    // bottom edge (not part of the cluster) is AIR or SOIL — anything
    // else (fixture, rock, world-floor) blocks the whole pile.
    const inCluster = new Set(cells)
    let canFall = true
    const bottomEdge: number[] = []
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      if (r + 1 >= rows) {
        canFall = false
        break
      }
      const belowIdx = (r + 1) * cols + c
      if (inCluster.has(belowIdx)) continue
      const below = tiles[belowIdx]
      if (below !== TILE_AIR && below !== TILE_SOIL) {
        canFall = false
        break
      }
      bottomEdge.push(idx)
    }
    if (!canFall) continue

    // Crush soil under the bottom edge (each crush = +1 hit on the
    // rock that did the crushing). Then physically translate the
    // cluster down one row.
    for (const idx of bottomEdge) {
      const c = idx % cols
      const r = (idx - c) / cols
      const belowIdx = (r + 1) * cols + c
      if (tiles[belowIdx] === TILE_SOIL) {
        tiles[belowIdx] = TILE_AIR
        flags[belowIdx] = (flags[belowIdx] ?? 0) | FLAG_AUTOTILE_DIRTY
        hits[idx] = (hits[idx] ?? 0) + 1
        markCellAndNeighborsDirty(world, c, r + 1)
      }
    }

    // Translate the cluster down. Process bottom rows first so we
    // don't overwrite a cell still occupied by another cluster cell.
    cells.sort((a, b) => Math.floor(b / cols) - Math.floor(a / cols))
    for (const idx of cells) {
      const c = idx % cols
      const r = (idx - c) / cols
      const newIdx = (r + 1) * cols + c
      const rockHits = hits[idx] ?? 0
      // Disintegrate this rock if it's accumulated enough hits to
      // break — leaves AIR behind, no descent.
      if (rockHits >= AVALANCHE_HITS_TO_BREAK) {
        tiles[idx] = TILE_AIR
        flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
        hits[idx] = 0
        markCellAndNeighborsDirty(world, c, r)
        continue
      }
      // Otherwise translate stone + carry its hit count to new cell.
      // The DISTURBED bit travels with the moving stone — the cluster
      // keeps falling next interval until it lands on something solid
      // OR shrinks below the threshold, at which point the unset
      // DISTURBED at the bottom of the loop renders it inert again.
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
      tiles[newIdx] = TILE_STONE
      flags[newIdx] = (flags[newIdx] ?? 0) | FLAG_AUTOTILE_DIRTY | FLAG_DISTURBED
      hits[newIdx] = rockHits
      hits[idx] = 0
      markCellAndNeighborsDirty(world, c, r)
      markCellAndNeighborsDirty(world, c, r + 1)
    }
    advancedAny = true
  }

  // Clear the disturbance bit from any cluster cell that DIDN'T move
  // this tick. Untriggered clusters become inert again until the next
  // destabilisation event.
  if (advancedAny) {
    // Cells that moved have FLAG_DISTURBED set on their new positions
    // (above). For any leftover stone with DISTURBED, leave it: it'll
    // be picked up next interval.
  } else {
    // No cluster fell — clear all DISTURBED on stones to avoid stale
    // state on clusters that couldn't fall (e.g., blocked below).
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === TILE_STONE && (flags[i]! & FLAG_DISTURBED) !== 0) {
        flags[i]! &= ~FLAG_DISTURBED
      }
    }
  }

  if (advancedAny) lastAvalancheTick = gs.tick
}

/** Reset avalanche timer on world rotation / restart. */
export function resetAvalanche(): void {
  lastAvalancheTick = 0
}

/** Reset module-level state on world rotation / restart. */
export function resetHazardSpawn(): void {
  lastSpawnTick = 0
}
