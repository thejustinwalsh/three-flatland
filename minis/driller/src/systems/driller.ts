import type { World } from 'koota'
import {
  Animation,
  Driller,
  type DrillerAnimState,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Gem,
  Grid,
  Hazard,
  Mood,
  PlannerTarget,
  TILE_AIR,
  TILE_FIXTURE_BASE,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import {
  DEPTH_AT_FULL_SPEED,
  DIG_INTERVAL_MS_DEEP,
  DIG_INTERVAL_MS_SHALLOW,
  FALL_INTERVAL_MS,
  PONDER_GEM_MS,
  PONDER_GEM_RADIUS,
  ROCK_HITS,
  TILE_PX,
} from '../constants'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { driftMood, moodTarget } from './ai-mood'

/**
 * Depth-scaled dig interval. At depth 0 the driller is deliberate
 * (~360ms/cell — gives the player time to see gem decisions); by
 * DEPTH_AT_FULL_SPEED the interval drops to ~130ms (frantic pace).
 */
function digIntervalForDepth(row: number): number {
  const t = Math.min(1, Math.max(0, row / DEPTH_AT_FULL_SPEED))
  return DIG_INTERVAL_MS_SHALLOW + (DIG_INTERVAL_MS_DEEP - DIG_INTERVAL_MS_SHALLOW) * t
}

/**
 * Move the driller toward its current PlannerTarget, digging through SOIL
 * cells in its path.
 */
export function drillerSystem(world: World, deltaMs: number): void {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)!
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return

  const cols = grid.cols
  const rows = grid.rows

  // Safety: the driller's own cell must always be AIR. If a chunk landed
  // on the driller's cell after respawn, force-clear it so the sprite
  // isn't drawn over solid soil.
  const hereIdx = d.row * cols + d.col
  if (grid.tiles[hereIdx] !== undefined && grid.tiles[hereIdx] !== TILE_AIR) {
    grid.tiles[hereIdx] = TILE_AIR
    grid.flags[hereIdx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, d.col, d.row)
  }

  // Smooth pixel chase toward the target cell.
  const targetPx = d.col * TILE_PX + TILE_PX / 2
  const targetPy = d.row * TILE_PX + TILE_PX / 2
  const px = d.px + (targetPx - d.px) * 0.4
  const py = d.py + (targetPy - d.py) * 0.4

  // ----- Gravity --------------------------------------------------------
  // The driller stands ON the cell directly below them. If that cell is
  // AIR (or off the world), they fall one row per FALL_INTERVAL_MS until
  // they land on a solid tile. While falling, no dig/move actions.
  const supportRow = d.row + 1
  const supportIdx = supportRow * cols + d.col
  const onGround = supportRow >= rows || (grid.tiles[supportIdx] !== undefined && grid.tiles[supportIdx] !== TILE_AIR)

  const fallCD = Math.max(0, d.fallCooldownMs - deltaMs)

  if (!onGround) {
    if (fallCD > 0) {
      drillerEntity.set(Driller, { fallCooldownMs: fallCD, px, py })
      return
    }
    // Drop one row.
    const newRow = d.row + 1
    drillerEntity.set(Driller, {
      row: newRow,
      px,
      py,
      fallCooldownMs: FALL_INTERVAL_MS,
    })
    if (newRow > gs.depthM) {
      world.set(GameState, { depthM: newRow, deepestM: Math.max(gs.deepestM, newRow) })
    }
    // Auto-collect gem at the cell we fell into.
    collectGemAt(world, gs, d.col, newRow)
    // Animation: continue 'fall' state visually.
    const animFall = drillerEntity.get(Animation)
    if (animFall) drillerEntity.set(Animation, { state: 'fall' })
    return
  }

  // ----- On the ground: dig / move -------------------------------------
  const cooldown = Math.max(0, d.digCooldownMs - deltaMs)

  if (cooldown > 0) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  const target = drillerEntity.get(PlannerTarget)
  if (!target) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  const stepCol = Math.sign(target.col - d.col)
  const stepRow = Math.sign(target.row - d.row)
  if (stepCol === 0 && stepRow === 0) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  // ----- Resolve action ------------------------------------------------
  // Down step → dig the support cell (driller stays put; gravity will
  // drop them on a subsequent tick when the cell becomes AIR).
  // Side step → dig the side cell if needed, then move into it (gravity
  // tick will continue the fall if the side has no support either).
  // Up step → only allowed if cell above is AIR; you can't dig upward.

  let actionCell: { col: number; row: number } | null = null
  let nextDrillerCell: { col: number; row: number } = { col: d.col, row: d.row }
  let isSideMove = false
  if (stepRow > 0) {
    actionCell = { col: d.col, row: d.row + 1 }
  } else if (stepCol !== 0) {
    actionCell = { col: d.col + stepCol, row: d.row }
    nextDrillerCell = { col: d.col + stepCol, row: d.row }
    isSideMove = true
  } else if (stepRow < 0) {
    const upIdx = (d.row - 1) * cols + d.col
    if (d.row - 1 >= 0 && grid.tiles[upIdx] === TILE_AIR) {
      nextDrillerCell = { col: d.col, row: d.row - 1 }
    } else {
      // Blocked — can't dig up. Fall back to drive-greedy behavior on
      // next planner tick; for now just absorb the cooldown.
      drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
      return
    }
  }

  if (actionCell) {
    const ac = actionCell.col
    const ar = actionCell.row
    if (ac < 0 || ac >= cols || ar < 0 || ar >= rows) {
      drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
      return
    }
    const tIdx = ar * cols + ac
    const tile = grid.tiles[tIdx]
    if (tile === undefined) return

    if (tile === TILE_STONE || isFixture(tile)) {
      drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
      return
    }

    if (tile === TILE_ROCK) {
      const remaining = (grid.hits[tIdx] ?? ROCK_HITS) - 1
      grid.hits[tIdx] = Math.max(0, remaining)
      if (remaining <= 0) {
        grid.tiles[tIdx] = TILE_AIR
        grid.flags[tIdx] = FLAG_AUTOTILE_DIRTY
        markCellAndNeighborsDirty(world, ac, ar)
      }
      // Driller does NOT move/fall this tick — chip + cooldown.
      drillerEntity.set(Driller, { digCooldownMs: digIntervalForDepth(d.row), px, py })
      return
    }

    if (tile === TILE_SOIL) {
      grid.tiles[tIdx] = TILE_AIR
      grid.flags[tIdx] = FLAG_AUTOTILE_DIRTY
      markCellAndNeighborsDirty(world, ac, ar)
    }
    // For TILE_AIR (already open) or TILE_EXPLOSIVE (will trigger via
    // adjacency), proceed to the move/fall state machine below.
  }

  // Apply movement (side moves only — down moves are handled by gravity
  // next tick).
  const facing = stepCol !== 0 ? (stepCol > 0 ? 1 : -1) : d.facing

  let nearbyGem = false
  if (isSideMove) {
    collectGemAt(world, gs, nextDrillerCell.col, nextDrillerCell.row)
    nearbyGem = gemNearby(world, nextDrillerCell.col, nextDrillerCell.row)
  } else if (stepRow > 0) {
    nearbyGem = gemNearby(world, d.col, d.row + 1)
  }

  const baseCooldown = digIntervalForDepth(nextDrillerCell.row)
  const cooldownAfter = nearbyGem ? baseCooldown + PONDER_GEM_MS : baseCooldown

  drillerEntity.set(Driller, {
    col: nextDrillerCell.col,
    row: nextDrillerCell.row,
    px,
    py,
    facing,
    digCooldownMs: cooldownAfter,
  })

  if (nextDrillerCell.row > gs.depthM) {
    world.set(GameState, { depthM: nextDrillerCell.row, deepestM: Math.max(gs.deepestM, nextDrillerCell.row) })
  }

  const anim = drillerEntity.get(Animation)
  if (anim) {
    const animState: DrillerAnimState =
      stepRow > 0
        ? 'drillDown'
        : stepRow < 0
          ? 'drillUp'
          : stepCol > 0
            ? 'drillRight'
            : 'drillLeft'
    drillerEntity.set(Animation, { state: animState })
  }
}

function collectGemAt(
  world: World,
  gs: { gems: number },
  col: number,
  row: number,
): void {
  let collected = false
  world.query(Gem).forEach((entity) => {
    if (collected) return
    const g = entity.get(Gem)
    if (!g || g.collected) return
    if (g.scatteredUntilTick !== 0) return
    if (g.col === col && g.row === row) {
      world.set(GameState, { gems: gs.gems + 1 })
      entity.destroy()
      collected = true
    }
  })
}

function gemNearby(world: World, col: number, row: number): boolean {
  let nearby = false
  world.query(Gem).forEach((entity) => {
    if (nearby) return
    const g = entity.get(Gem)
    if (!g || g.collected || g.scatteredUntilTick !== 0) return
    if (Math.abs(g.col - col) + Math.abs(g.row - row) <= PONDER_GEM_RADIUS) {
      nearby = true
    }
  })
  return nearby
}

function isFixture(t: number): boolean {
  return t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 8
}

/**
 * Tick the mood drift system. Reads world signals (visible gems, overhead
 * sag, falling-rock hazards) and lerps current mood toward the target.
 */
export function moodDriftSystem(world: World, ticksSinceLastTap: number): void {
  const drillerEntity = world.queryFirst(Mood)
  if (!drillerEntity) return
  const driller = world.queryFirst(Driller)
  const m = drillerEntity.get(Mood)!

  let visibleGemCount = 0
  let sagOverhead = false
  let hazardOverhead = false

  if (driller) {
    const d = driller.get(Driller)!
    const grid = world.get(Grid)

    world.query(Gem).forEach((entity) => {
      const g = entity.get(Gem)
      if (!g || g.collected) return
      if (Math.abs(g.col - d.col) + Math.abs(g.row - d.row) <= 6) visibleGemCount++
    })

    if (grid) {
      for (let dr = 1; dr <= 3; dr++) {
        const r = d.row - dr
        if (r < 0) break
        const idx = r * grid.cols + d.col
        if ((grid.flags[idx] ?? 0) & 1) {
          sagOverhead = true
          break
        }
      }
    }

    // Hazard overhead = active rock in driller's column or 1 either side.
    // Falling rocks may chip the column slightly; ±1 covers near-misses.
    world.query(Hazard).forEach((entity) => {
      const h = entity.get(Hazard)
      if (!h) return
      if (h.phase === 'landed') return
      if (Math.abs(h.col - d.col) <= 1) hazardOverhead = true
    })
  }

  const target = moodTarget({
    visibleGemCount,
    sagOverhead,
    hazardOverhead,
    ticksSinceLastTap,
  })
  const drifted = driftMood({ greed: m.greed, fear: m.fear, drive: m.drive }, target)
  drillerEntity.set(Mood, { greed: drifted.greed, fear: drifted.fear, drive: drifted.drive })
}
