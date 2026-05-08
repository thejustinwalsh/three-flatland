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
  PONDER_GEM_MS,
  PONDER_GEM_RADIUS,
  ROCK_HITS,
  TILE_PX,
} from '../constants'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { driftMood, moodTarget } from './ai-mood'

/**
 * Depth-scaled per-cell step interval. ALL grid movement (walking,
 * digging, falling) uses this same cadence — Mr. Driller-style
 * "you move on a grid with a measured delay between cells" — so the
 * driller's apparent speed feels uniform regardless of direction.
 *
 * At depth 0 the driller is deliberate (~360ms/cell); by
 * DEPTH_AT_FULL_SPEED the interval drops to ~130ms (frantic pace).
 */
function stepIntervalForDepth(row: number): number {
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

  // Linear pixel lerp from prev cell → current cell, parameterised by
  // the active cooldown ratio. The driller "begins to lerp toward the
  // hole" the instant a step is committed, but the visual position
  // doesn't ARRIVE at the new cell until the step's cooldown elapses.
  // Walking, digging, and falling all share this cadence.
  const activeCD = d.fallCooldownMs > 0 ? d.fallCooldownMs : d.digCooldownMs
  const lerpProgress = d.stepDurationMs > 0
    ? Math.min(1, Math.max(0, 1 - activeCD / d.stepDurationMs))
    : 1
  const fromPx = d.prevCol * TILE_PX + TILE_PX / 2
  const fromPy = d.prevRow * TILE_PX + TILE_PX / 2
  const targetPx = d.col * TILE_PX + TILE_PX / 2
  const targetPy = d.row * TILE_PX + TILE_PX / 2
  const px = fromPx + (targetPx - fromPx) * lerpProgress
  const py = fromPy + (targetPy - fromPy) * lerpProgress

  // ----- Gravity --------------------------------------------------------
  // The driller stands ON the cell directly below them. If that cell is
  // AIR (or off the world), they fall one row per step interval until
  // they land on a solid tile. While falling, no dig/move actions.
  // Falling uses the SAME per-cell cadence as walking/digging — Mr.
  // Driller-style uniform grid pace, regardless of direction.
  const supportRow = d.row + 1
  const supportIdx = supportRow * cols + d.col
  const onGround = supportRow >= rows || (grid.tiles[supportIdx] !== undefined && grid.tiles[supportIdx] !== TILE_AIR)

  const fallCD = Math.max(0, d.fallCooldownMs - deltaMs)

  if (!onGround) {
    if (fallCD > 0) {
      drillerEntity.set(Driller, { fallCooldownMs: fallCD, px, py })
      return
    }
    // Drop one row. Snap prev → current cell at the START of the step;
    // the lerp at the top of the next tick interpolates from prevRow
    // back to row across the step's full duration.
    const newRow = d.row + 1
    const stepMs = stepIntervalForDepth(newRow)
    drillerEntity.set(Driller, {
      prevCol: d.col,
      prevRow: d.row,
      row: newRow,
      fallCooldownMs: stepMs,
      stepDurationMs: stepMs,
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
  // ONE STEP = ONE CELL OF MOTION. Whether the driller is just walking
  // through AIR or drilling through SOIL, the cadence is identical —
  // the lerp animates smooth pixel motion across the step duration so
  // the driller appears to drill INTO the wall in real time, never
  // sitting in place between dig and step.
  //
  //   Side step:
  //     side is AIR  → walk into it
  //     side is SOIL → drill + walk into it (one step)
  //     side is STONE/fixture → blocked
  //     side is ROCK → chip in place (no advance)
  //   Down step (driller is on ground, planner wants down):
  //     dig support cell; gravity drops driller in the SAME tick.
  //   Up step:
  //     drill the cell above. Driller never moves up.

  let actionCell: { col: number; row: number } | null = null
  let nextDrillerCell: { col: number; row: number } = { col: d.col, row: d.row }
  let isSideMove = false
  if (stepRow > 0) {
    // Drill the support cell AND advance into it in one tick.
    actionCell = { col: d.col, row: d.row + 1 }
    nextDrillerCell = { col: d.col, row: d.row + 1 }
  } else if (stepCol !== 0) {
    const sideCol = d.col + stepCol
    if (sideCol < 0 || sideCol >= cols) {
      drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
      return
    }
    const sideIdx = d.row * cols + sideCol
    const sideTile = grid.tiles[sideIdx]
    if (sideTile === TILE_AIR) {
      // Open path — walk only.
      nextDrillerCell = { col: sideCol, row: d.row }
      isSideMove = true
    } else if (sideTile === TILE_STONE || (sideTile !== undefined && isFixture(sideTile))) {
      // Blocked. Absorb cooldown; planner will retarget.
      drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
      return
    } else {
      // SOIL / EXPLOSIVE / ROCK: drill it. ROCK is multi-hit (handled
      // below) and does NOT advance; SOIL becomes AIR and the driller
      // walks into it in the same tick.
      actionCell = { col: sideCol, row: d.row }
      if (sideTile !== TILE_ROCK) {
        nextDrillerCell = { col: sideCol, row: d.row }
        isSideMove = true
      }
    }
  } else if (stepRow < 0) {
    // Drill straight up — never moves the driller. Useful for freeing
    // gems above (gem-gravity will drop them into the new AIR cell) or
    // chipping a rock that's blocking a column.
    actionCell = { col: d.col, row: d.row - 1 }
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
      // prev = current so the lerp keeps the sprite at rest.
      const chipMs = stepIntervalForDepth(d.row)
      drillerEntity.set(Driller, {
        prevCol: d.col,
        prevRow: d.row,
        digCooldownMs: chipMs,
        stepDurationMs: chipMs,
      })
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
  const advanced = isSideMove || (stepRow > 0 && nextDrillerCell.row !== d.row)
  if (advanced) {
    collectGemAt(world, gs, nextDrillerCell.col, nextDrillerCell.row)
    nearbyGem = gemNearby(world, nextDrillerCell.col, nextDrillerCell.row)
  }

  const baseCooldown = stepIntervalForDepth(nextDrillerCell.row)
  const cooldownAfter = nearbyGem ? baseCooldown + PONDER_GEM_MS : baseCooldown

  // Snap prev = old cell (so the lerp animates from the OLD center to
  // the new one over the cooldown window). For dig-only ticks where
  // the driller stays put, prev = current = old cell, so the lerp is
  // a no-op visually.
  drillerEntity.set(Driller, {
    prevCol: d.col,
    prevRow: d.row,
    col: nextDrillerCell.col,
    row: nextDrillerCell.row,
    facing,
    digCooldownMs: cooldownAfter,
    stepDurationMs: cooldownAfter,
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
