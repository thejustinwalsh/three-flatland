import type { World } from 'koota'
import {
  Driller,
  Gem,
  Grid,
  Mood,
  PlannerTarget,
  TILE_AIR,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
  type PlannerName,
} from '../traits'
import {
  GameState,
} from '../traits'
import {
  MOOD_SWITCH_THRESHOLD,
  PLAN_COMMIT_TICKS,
} from '../constants'
import { bfsNextStep } from '../lib/bfs'

interface DrillerCell {
  col: number
  row: number
}

/**
 * Greedy descender: prefer cells directly below the driller. Sideways only
 * when blocked (anchored neighbor). Score = depth gain.
 */
export function planGreedy(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid
  const below = (d.row + 1) * cols + d.col
  if (d.row + 1 < rows && tiles[below] !== TILE_STONE && !isFixture(tiles[below] ?? TILE_AIR)) {
    return [d.col, d.row + 1]
  }
  // Try sides
  for (const dc of [-1, 1]) {
    const nc = d.col + dc
    if (nc < 0 || nc >= cols) continue
    const idx = d.row * cols + nc
    const t = tiles[idx]
    if (t !== undefined && t !== TILE_STONE && !isFixture(t)) {
      return [nc, d.row]
    }
  }
  return null
}

/**
 * Seeker: BFS toward the nearest visible gem within radius 6. Returns the
 * next-step cell; planner will commit to it for ≥ PLAN_COMMIT_TICKS.
 */
export function planSeeker(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid

  // Build a quick gem-position lookup constrained to BFS window.
  const gemSet = new Set<number>()
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected || g.scatteredUntilTick > 0) return
    if (Math.abs(g.col - d.col) + Math.abs(g.row - d.row) > 12) return
    gemSet.add(g.row * cols + g.col)
  })
  if (gemSet.size === 0) return null

  return bfsNextStep(
    d.col,
    d.row,
    cols,
    rows,
    (c, r) => gemSet.has(r * cols + c),
    (c, r) => {
      const t = tiles[r * cols + c]
      if (t === undefined) return false
      return t !== TILE_STONE && !isFixture(t)
    },
    6,
  )
}

/**
 * Cautious: find the nearest STONE/FIXTURE-adjacent passable cell. If
 * none nearby, fall back to greedy.
 */
export function planCautious(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid

  const isShelter = (c: number, r: number): boolean => {
    // Shelter = adjacent to STONE or FIXTURE (and itself passable).
    const t = tiles[r * cols + c]
    if (t === undefined || t === TILE_STONE || isFixture(t)) return false
    for (const [dc, dr] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const nt = tiles[nr * cols + nc]
      if (nt === TILE_STONE || (nt !== undefined && isFixture(nt))) return true
    }
    return false
  }
  const isPassable = (c: number, r: number): boolean => {
    const t = tiles[r * cols + c]
    if (t === undefined) return false
    return t === TILE_AIR || t === TILE_SOIL
  }

  const next = bfsNextStep(d.col, d.row, cols, rows, isShelter, isPassable, 6)
  if (next) return next
  return planGreedy(world, d)
}

function isFixture(t: number): boolean {
  return t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 8
}

/**
 * Decide which planner to run this tick.
 *
 * Dominant axis = max(greed, fear, drive). Switching planners requires the
 * new dominant axis to exceed the current by at least MOOD_SWITCH_THRESHOLD,
 * AND the previous planner's PLAN_COMMIT_TICKS sunk-cost window must have
 * elapsed.
 */
export function selectPlanner(world: World): PlannerName {
  const m = world.queryFirst(Mood)
  const gs = world.get(GameState)
  if (!m || !gs) return 'greedy'
  const mood = m.get(Mood)!

  const candidate: PlannerName =
    mood.fear >= mood.greed && mood.fear >= mood.drive
      ? 'cautious'
      : mood.greed >= mood.drive
        ? 'seeker'
        : 'greedy'

  if (candidate === mood.planner) return mood.planner

  // Hysteresis: require the candidate's axis to exceed the current by threshold.
  const candidateValue =
    candidate === 'cautious' ? mood.fear : candidate === 'seeker' ? mood.greed : mood.drive
  const currentValue =
    mood.planner === 'cautious' ? mood.fear : mood.planner === 'seeker' ? mood.greed : mood.drive
  if (candidateValue - currentValue < MOOD_SWITCH_THRESHOLD) return mood.planner

  // Sunk cost: don't switch within PLAN_COMMIT_TICKS of the last switch.
  if (gs.tick - mood.switchAtTick < PLAN_COMMIT_TICKS) return mood.planner

  // Commit the switch.
  mood.planner = candidate
  mood.switchAtTick = gs.tick
  return candidate
}

/** Drive a single planner tick: pick a target cell and write to PlannerTarget. */
export function plannerTick(world: World): void {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)!

  const which = selectPlanner(world)
  let next: [number, number] | null = null
  switch (which) {
    case 'greedy':
      next = planGreedy(world, d)
      break
    case 'seeker':
      next = planSeeker(world, d)
      break
    case 'cautious':
      next = planCautious(world, d)
      break
  }
  if (!next) return

  // Write or update the target.
  const target = drillerEntity.get(PlannerTarget)
  const gs = world.get(GameState)
  if (!gs) return

  if (target) {
    // Sunk-cost commit window: don't re-target within PLAN_COMMIT_TICKS.
    if (gs.tick - target.reservedAtTick < PLAN_COMMIT_TICKS && (target.col !== d.col || target.row !== d.row)) {
      return
    }
    target.col = next[0]
    target.row = next[1]
    target.reservedAtTick = gs.tick
  } else {
    drillerEntity.add(PlannerTarget({ col: next[0], row: next[1], reservedAtTick: gs.tick }))
  }
}
