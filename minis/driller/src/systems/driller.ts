import type { Entity, World } from 'koota'
import {
  Animation,
  Driller,
  type DrillerAnimState,
  FLAG_AUTOTILE_DIRTY,
  FLAG_DISTURBED,
  GameState,
  Gem,
  Grid,
  Hazard,
  Mood,
  PlannerTarget,
  TILE_AIR,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
  isFixtureTile,
} from '../traits'
import {
  DEPTH_AT_FULL_SPEED,
  DIG_INTERVAL_MS_DEEP,
  DIG_INTERVAL_MS_SHALLOW,
  DRILL_COOLDOWN_MS,
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

interface ActionWalk { kind: 'walk' | 'fall'; destCol: number; destRow: number; facing: 1 | -1; animState: DrillerAnimState }
interface ActionDrill { kind: 'drill'; drillCol: number; drillRow: number; facing: 1 | -1; animState: DrillerAnimState }
interface ActionIdle { kind: 'idle'; facing: 1 | -1 }
type Action = ActionWalk | ActionDrill | ActionIdle

/**
 * Decide what the driller should do at its current snapped cell.
 * - Gravity wins over planner: free fall when support is AIR.
 * - Drill priorities: down > up > side-blocked. Walk through AIR.
 * - Side effects: collect a gem at the new cell + bump depth.
 */
function pickAction(
  world: World,
  gs: { gems: number; depthM: number; deepestM: number },
  grid: { cols: number; rows: number; tiles: Uint8Array },
  snappedCol: number,
  snappedRow: number,
  currentFacing: 1 | -1,
  drillerEntity: Entity,
): Action {
  const { cols, rows, tiles } = grid

  // Gravity wins.
  const supportRow = snappedRow + 1
  const supportIdx = supportRow * cols + snappedCol
  const onGround =
    supportRow >= rows ||
    (tiles[supportIdx] !== undefined && tiles[supportIdx] !== TILE_AIR)
  if (!onGround) {
    // Lateral drift: chase the planner target laterally as we fall, if
    // the diag-down cell is AIR.
    let driftCol = snappedCol
    const target = drillerEntity.get(PlannerTarget)
    if (target) {
      const dir = Math.sign(target.col - snappedCol)
      if (dir !== 0) {
        const candCol = snappedCol + dir
        if (candCol >= 0 && candCol < cols) {
          const diag = tiles[(snappedRow + 1) * cols + candCol]
          if (diag === TILE_AIR) driftCol = candCol
        }
      }
    }
    const facing = driftCol === snappedCol ? currentFacing : (driftCol > snappedCol ? 1 : -1)
    return { kind: 'fall', destCol: driftCol, destRow: snappedRow + 1, facing, animState: 'fall' }
  }

  // On the ground.
  const target = drillerEntity.get(PlannerTarget)
  if (!target) return { kind: 'idle', facing: currentFacing }
  const stepCol = Math.sign(target.col - snappedCol)
  const stepRow = Math.sign(target.row - snappedRow)
  if (stepCol === 0 && stepRow === 0) return { kind: 'idle', facing: currentFacing }

  const facing = stepCol !== 0 ? (stepCol > 0 ? 1 : -1) : currentFacing

  if (stepRow > 0) {
    // Down → drill the support cell.
    const drillRow = snappedRow + 1
    if (drillRow >= rows) return { kind: 'idle', facing }
    const t = tiles[drillRow * cols + snappedCol]
    if (t === undefined || t === TILE_STONE || (t !== undefined && isFixtureTile(t))) return { kind: 'idle', facing }
    return { kind: 'drill', drillCol: snappedCol, drillRow, facing, animState: 'drillDown' }
  }
  if (stepCol !== 0) {
    const sideCol = snappedCol + stepCol
    if (sideCol < 0 || sideCol >= cols) return { kind: 'idle', facing }
    const sideTile = tiles[snappedRow * cols + sideCol]
    if (sideTile === TILE_AIR) {
      return { kind: 'walk', destCol: sideCol, destRow: snappedRow, facing, animState: 'walk' }
    }
    if (sideTile === TILE_STONE || (sideTile !== undefined && isFixtureTile(sideTile))) {
      return { kind: 'idle', facing }
    }
    return {
      kind: 'drill',
      drillCol: sideCol,
      drillRow: snappedRow,
      facing,
      animState: stepCol > 0 ? 'drillRight' : 'drillLeft',
    }
  }
  // stepRow < 0 → drill the cell above (never move up)
  const upRow = snappedRow - 1
  if (upRow < 0) return { kind: 'idle', facing }
  const t = tiles[upRow * cols + snappedCol]
  if (t === undefined || t === TILE_STONE || (t !== undefined && isFixtureTile(t))) return { kind: 'idle', facing }
  return { kind: 'drill', drillCol: snappedCol, drillRow: upRow, facing, animState: 'drillUp' }
}

/**
 * Resolve a completed drill (cooldown hit zero) — convert the target
 * cell to AIR, decrement ROCK hit counters, disturb adjacent stones.
 */
function completeDrill(world: World, grid: { cols: number; rows: number; tiles: Uint8Array; flags: Uint8Array; hits: Uint8Array }, col: number, row: number): void {
  const idx = row * grid.cols + col
  const tile = grid.tiles[idx]
  if (tile === TILE_ROCK) {
    const remaining = (grid.hits[idx] ?? ROCK_HITS) - 1
    grid.hits[idx] = Math.max(0, remaining)
    if (remaining <= 0) {
      grid.tiles[idx] = TILE_AIR
      grid.flags[idx] = FLAG_AUTOTILE_DIRTY
      markCellAndNeighborsDirty(world, col, row)
      disturbAdjacentStones(grid, col, row)
    }
  } else if (tile === TILE_SOIL) {
    grid.tiles[idx] = TILE_AIR
    grid.flags[idx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, col, row)
    disturbAdjacentStones(grid, col, row)
  }
}

/**
 * Platformer continuous motion + frame-budget loop. Walking through
 * AIR consumes the frame seamlessly across cell boundaries — when the
 * driller arrives at a cell mid-frame, the leftover time is applied
 * to motion toward the NEXT dest. Drilling absorbs the per-cell
 * "decision pause" itself: drill-time IS the delay, after which the
 * block breaks AND motion resumes within the same frame.
 *
 * Rules enforced here:
 *   - drilling and step-target selection happen ONLY when fully
 *     snapped to the current cell.
 *   - while falling (support cell is AIR), no drilling — gravity wins.
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

  // ----- BUDGET LOOP ---------------------------------------------------
  // We split deltaMs in two halves and run the loop body twice. This
  // is the "integrate twice per frame" smoothing trick: it lets a
  // single frame consume an arrival mid-step AND apply post-snap
  // motion in two micro-steps, which evens out the visible position
  // between renders even at borderline framerates.
  let nx = d.px
  let ny = d.py
  let snappedCol = d.col
  let snappedRow = d.row
  let destCol = d.destCol
  let destRow = d.destRow
  let facing = d.facing
  let drillCD = d.drillCooldownMs
  let drillCol = d.drillCol
  let drillRow = d.drillRow
  let lastAnim: DrillerAnimState | null = null

  // Track which cells we've already counted toward depth + gem-collect
  // this frame so a multi-cell traversal doesn't double-credit.
  const visitedKey = (c: number, r: number) => r * cols + c
  const visited = new Set<number>([visitedKey(snappedCol, snappedRow)])

  const consume = (ms: number): void => {
    let remaining = ms
    let iter = 0
    while (remaining > 0 && iter < 6) {
      iter++

      // Drill timer wins over motion. While drilling, position is
      // pinned to the current cell. When it expires, complete the
      // drill and continue the loop with leftover budget so motion
      // resumes in the same frame.
      if (drillCD > 0) {
        const used = Math.min(drillCD, remaining)
        drillCD -= used
        remaining -= used
        nx = snappedCol * TILE_PX + TILE_PX / 2
        ny = snappedRow * TILE_PX + TILE_PX / 2
        if (drillCD === 0) {
          completeDrill(world, grid, drillCol, drillRow)
          // fall through to the snap-pick branch on next iteration
          continue
        }
        return
      }

      const stepMs = stepIntervalForDepth(snappedRow)
      const speed = TILE_PX / stepMs
      const destPx = destCol * TILE_PX + TILE_PX / 2
      const destPy = destRow * TILE_PX + TILE_PX / 2
      const dx = destPx - nx
      const dy = destPy - ny
      const dist = Math.hypot(dx, dy)

      if (dist > SNAP_EPSILON) {
        const moveBudget = speed * remaining
        if (moveBudget >= dist) {
          // Reach the dest exactly. Snap, consume the time-to-reach,
          // continue with leftover budget on the next iteration.
          nx = destPx
          ny = destPy
          remaining -= dist / speed
        } else {
          nx += (dx / dist) * moveBudget
          ny += (dy / dist) * moveBudget
          remaining = 0
          lastAnim = dx === 0 && dy > 0 ? 'fall' : 'walk'
        }
        continue
      }

      // ----- Snapped at dest cell — pick next action ---------------------
      nx = destPx
      ny = destPy
      snappedCol = destCol
      snappedRow = destRow
      const k = visitedKey(snappedCol, snappedRow)
      if (!visited.has(k)) {
        visited.add(k)
        collectGemAt(world, gs, snappedCol, snappedRow)
        if (snappedRow > gs.depthM) {
          world.set(GameState, { depthM: snappedRow, deepestM: Math.max(gs.deepestM, snappedRow) })
        }
      }

      const action = pickAction(world, gs, grid, snappedCol, snappedRow, facing, drillerEntity)
      if (action.kind === 'idle') {
        facing = action.facing
        destCol = snappedCol
        destRow = snappedRow
        if (lastAnim === null) lastAnim = 'idle'
        return
      }
      facing = action.facing
      lastAnim = action.animState
      if (action.kind === 'drill') {
        drillCol = action.drillCol
        drillRow = action.drillRow
        drillCD = DRILL_COOLDOWN_MS
        // Loop continues; drill timer absorbs the rest of the frame.
        continue
      }
      // walk or fall
      destCol = action.destCol
      destRow = action.destRow
      // Loop continues — motion phase will move toward new dest with
      // whatever budget is left.
    }
  }

  // Two-pass integration for smoother motion (split-step Euler).
  consume(deltaMs * 0.5)
  consume(deltaMs * 0.5)

  drillerEntity.set(Driller, {
    col: snappedCol,
    row: snappedRow,
    px: nx,
    py: ny,
    destCol,
    destRow,
    facing,
    drillCooldownMs: drillCD,
    drillCol,
    drillRow,
  })
  if (lastAnim !== null) {
    const anim = drillerEntity.get(Animation)
    if (anim) drillerEntity.set(Animation, { state: lastAnim })
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

/**
 * Mark any TILE_STONE in the 4-neighbourhood of (col, row) with
 * FLAG_DISTURBED. Drilling adjacent to a rock cluster is one of the
 * three destabilising events that lets the avalanche system kick in
 * (the others: a fresh hazard landing on a cluster, and the cluster
 * itself already mid-fall).
 */
function disturbAdjacentStones(grid: { cols: number; rows: number; tiles: Uint8Array; flags: Uint8Array }, col: number, row: number): void {
  const { cols, rows, tiles, flags } = grid
  for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const nc = col + dc
    const nr = row + dr
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
    const nIdx = nr * cols + nc
    if (tiles[nIdx] === TILE_STONE) {
      flags[nIdx] = (flags[nIdx] ?? 0) | FLAG_DISTURBED
    }
  }
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
