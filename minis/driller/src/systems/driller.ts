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
  DRILL_COOLDOWN_MS,
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

const SNAP_EPSILON = 0.5 // px tolerance for "arrived at cell center"

/**
 * Platformer-style continuous motion. The driller has a CONTINUOUS
 * (px, py) position and a movement target cell (destCol, destRow);
 * each tick (px, py) advances toward the target's center at a fixed
 * pixels-per-millisecond rate (depth-scaled). When (px, py) is within
 * SNAP_EPSILON of the dest center the driller "arrives" — col/row
 * snap to dest, and a new action (drill or set new dest) is chosen.
 *
 * Rules enforced here:
 *   - drilling and step-target selection happen ONLY when fully
 *     snapped to the current cell (px, py at center, col === destCol,
 *     row === destRow).
 *   - while falling (support cell is AIR), no drilling — the driller
 *     must land first.
 *   - up-actions DRILL only; the driller never has destRow < row.
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

  // Safety: the driller's own cell must always be AIR. A chunk landing
  // on the driller's cell during respawn would otherwise hide the sprite.
  const hereIdx = d.row * cols + d.col
  if (grid.tiles[hereIdx] !== undefined && grid.tiles[hereIdx] !== TILE_AIR) {
    grid.tiles[hereIdx] = TILE_AIR
    grid.flags[hereIdx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, d.col, d.row)
  }

  // ----- DRILL TIMER ---------------------------------------------------
  // While the drill is active the driller is locked in place. Position
  // is pinned to the current cell center; no motion or new actions.
  if (d.drillCooldownMs > 0) {
    const newCD = Math.max(0, d.drillCooldownMs - deltaMs)
    const restPx = d.col * TILE_PX + TILE_PX / 2
    const restPy = d.row * TILE_PX + TILE_PX / 2
    if (newCD === 0) {
      // Drill complete — convert the target cell to AIR (or chip a rock).
      const drillIdx = d.drillRow * cols + d.drillCol
      const tile = grid.tiles[drillIdx]
      if (tile === TILE_ROCK) {
        const remaining = (grid.hits[drillIdx] ?? ROCK_HITS) - 1
        grid.hits[drillIdx] = Math.max(0, remaining)
        if (remaining <= 0) {
          grid.tiles[drillIdx] = TILE_AIR
          grid.flags[drillIdx] = FLAG_AUTOTILE_DIRTY
          markCellAndNeighborsDirty(world, d.drillCol, d.drillRow)
        }
      } else if (tile === TILE_SOIL) {
        grid.tiles[drillIdx] = TILE_AIR
        grid.flags[drillIdx] = FLAG_AUTOTILE_DIRTY
        markCellAndNeighborsDirty(world, d.drillCol, d.drillRow)
      }
    }
    drillerEntity.set(Driller, {
      px: restPx,
      py: restPy,
      drillCooldownMs: newCD,
    })
    return
  }

  // ----- CONTINUOUS MOTION ---------------------------------------------
  // Move (px, py) toward (destCol, destRow) center at a fixed rate.
  // Speed scales with depth, so descent feels increasingly frantic.
  const stepMs = stepIntervalForDepth(d.row)
  const speedPxPerMs = TILE_PX / stepMs
  const destPx = d.destCol * TILE_PX + TILE_PX / 2
  const destPy = d.destRow * TILE_PX + TILE_PX / 2
  let nx = d.px
  let ny = d.py
  const dx = destPx - nx
  const dy = destPy - ny
  const dist = Math.hypot(dx, dy)

  if (dist > SNAP_EPSILON) {
    const move = Math.min(dist, speedPxPerMs * deltaMs)
    nx += (dx / dist) * move
    ny += (dy / dist) * move
    const animMoving = drillerEntity.get(Animation)
    if (animMoving) {
      drillerEntity.set(Animation, {
        state: dx === 0 && dy > 0 ? 'fall' : 'walk',
      })
    }
    drillerEntity.set(Driller, { px: nx, py: ny })
    return
  }

  // ----- ARRIVED at destination cell -----------------------------------
  // Snap, update col/row, then decide the next action.
  const snappedPx = destPx
  const snappedPy = destPy
  const snappedCol = d.destCol
  const snappedRow = d.destRow

  // Auto-collect any gem at the newly-occupied cell.
  collectGemAt(world, gs, snappedCol, snappedRow)
  if (snappedRow > gs.depthM) {
    world.set(GameState, { depthM: snappedRow, deepestM: Math.max(gs.deepestM, snappedRow) })
  }

  // Gravity check: if the support cell is AIR, set fall target and go.
  // No drilling while falling — landing first is required.
  const supportRow = snappedRow + 1
  const supportIdx = supportRow * cols + snappedCol
  const onGround =
    supportRow >= rows ||
    (grid.tiles[supportIdx] !== undefined && grid.tiles[supportIdx] !== TILE_AIR)
  if (!onGround) {
    drillerEntity.set(Driller, {
      col: snappedCol,
      row: snappedRow,
      px: snappedPx,
      py: snappedPy,
      destCol: snappedCol,
      destRow: snappedRow + 1,
    })
    const animFall = drillerEntity.get(Animation)
    if (animFall) drillerEntity.set(Animation, { state: 'fall' })
    return
  }

  // On the ground. Pick next action from planner target.
  const target = drillerEntity.get(PlannerTarget)
  if (!target) {
    drillerEntity.set(Driller, {
      col: snappedCol,
      row: snappedRow,
      px: snappedPx,
      py: snappedPy,
      destCol: snappedCol,
      destRow: snappedRow,
    })
    return
  }
  const stepCol = Math.sign(target.col - snappedCol)
  const stepRow = Math.sign(target.row - snappedRow)
  if (stepCol === 0 && stepRow === 0) {
    drillerEntity.set(Driller, {
      col: snappedCol,
      row: snappedRow,
      px: snappedPx,
      py: snappedPy,
      destCol: snappedCol,
      destRow: snappedRow,
    })
    const animIdle = drillerEntity.get(Animation)
    if (animIdle) drillerEntity.set(Animation, { state: 'idle' })
    return
  }

  // ----- Resolve the next per-cell action ------------------------------
  // Down  → drill the support cell; gravity will pull on next arrival.
  // Side  → AIR: walk into it. SOIL/ROCK/EXPLOSIVE: drill it (then walk
  //         next arrival). STONE/fixture: blocked.
  // Up    → drill the cell above; never move up.
  let drillCell: { col: number; row: number } | null = null
  let walkDest: { col: number; row: number } | null = null

  if (stepRow > 0) {
    drillCell = { col: snappedCol, row: snappedRow + 1 }
  } else if (stepCol !== 0) {
    const sideCol = snappedCol + stepCol
    if (sideCol < 0 || sideCol >= cols) {
      drillerEntity.set(Driller, {
        col: snappedCol, row: snappedRow,
        px: snappedPx, py: snappedPy,
        destCol: snappedCol, destRow: snappedRow,
      })
      return
    }
    const sideTile = grid.tiles[snappedRow * cols + sideCol]
    if (sideTile === TILE_AIR) {
      walkDest = { col: sideCol, row: snappedRow }
    } else if (sideTile === TILE_STONE || (sideTile !== undefined && isFixture(sideTile))) {
      // Blocked: idle here, planner will retarget.
      drillerEntity.set(Driller, {
        col: snappedCol, row: snappedRow,
        px: snappedPx, py: snappedPy,
        destCol: snappedCol, destRow: snappedRow,
      })
      return
    } else {
      drillCell = { col: sideCol, row: snappedRow }
    }
  } else if (stepRow < 0) {
    drillCell = { col: snappedCol, row: snappedRow - 1 }
  }

  const facing = stepCol !== 0 ? (stepCol > 0 ? 1 : -1) : d.facing

  if (drillCell) {
    // Validate target then start the drill timer.
    if (drillCell.col < 0 || drillCell.col >= cols || drillCell.row < 0 || drillCell.row >= rows) {
      drillerEntity.set(Driller, {
        col: snappedCol, row: snappedRow,
        px: snappedPx, py: snappedPy,
        destCol: snappedCol, destRow: snappedRow,
      })
      return
    }
    const tile = grid.tiles[drillCell.row * cols + drillCell.col]
    if (tile === undefined || tile === TILE_STONE || (tile !== undefined && isFixture(tile))) {
      // Blocked or out of world. Idle here.
      drillerEntity.set(Driller, {
        col: snappedCol, row: snappedRow,
        px: snappedPx, py: snappedPy,
        destCol: snappedCol, destRow: snappedRow,
        facing,
      })
      return
    }

    drillerEntity.set(Driller, {
      col: snappedCol,
      row: snappedRow,
      px: snappedPx,
      py: snappedPy,
      destCol: snappedCol,
      destRow: snappedRow,
      facing,
      drillCooldownMs: DRILL_COOLDOWN_MS,
      drillCol: drillCell.col,
      drillRow: drillCell.row,
    })
    const animDrill = drillerEntity.get(Animation)
    if (animDrill) {
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
    return
  }

  if (walkDest) {
    // Add the gem-ponder pause as a small extra hold once the cell is
    // entered: a nearby gem causes the AI to pause and consider its
    // options just before stepping in. Implemented as a brief drill of
    // an already-AIR cell (no grid mutation; just the timer).
    const nearby = gemNearby(world, walkDest.col, walkDest.row)
    if (nearby) {
      drillerEntity.set(Driller, {
        col: snappedCol,
        row: snappedRow,
        px: snappedPx,
        py: snappedPy,
        destCol: snappedCol,
        destRow: snappedRow,
        facing,
        drillCooldownMs: PONDER_GEM_MS,
        drillCol: walkDest.col,
        drillRow: walkDest.row,
      })
      return
    }
    drillerEntity.set(Driller, {
      col: snappedCol,
      row: snappedRow,
      px: snappedPx,
      py: snappedPy,
      destCol: walkDest.col,
      destRow: walkDest.row,
      facing,
    })
    const animWalk = drillerEntity.get(Animation)
    if (animWalk) drillerEntity.set(Animation, { state: 'walk' })
    return
  }

  // No-op fallthrough: nothing to do.
  drillerEntity.set(Driller, {
    col: snappedCol,
    row: snappedRow,
    px: snappedPx,
    py: snappedPy,
    destCol: snappedCol,
    destRow: snappedRow,
  })
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
