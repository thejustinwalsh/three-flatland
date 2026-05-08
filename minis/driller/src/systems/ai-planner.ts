import type { World } from 'koota'
import {
  Driller,
  GameState,
  Gem,
  Grid,
  Hazard,
  Mood,
  type PlannerName,
  PlannerTarget,
  TILE_AIR,
  TILE_FIXTURE_BASE,
  TILE_ROCK,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import { MOOD_SWITCH_THRESHOLD, PLAN_COMMIT_TICKS } from '../constants'
import { bfsNextStep } from '../lib/bfs'

interface DrillerCell {
  col: number
  row: number
}

export function planGreedy(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid
  const below = (d.row + 1) * cols + d.col
  if (d.row + 1 < rows && tiles[below] !== TILE_STONE && !isFixture(tiles[below] ?? TILE_AIR)) {
    return [d.col, d.row + 1]
  }
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

export function planSeeker(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid

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

export function planCautious(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid

  const isShelter = (c: number, r: number): boolean => {
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

export function selectPlanner(world: World): PlannerName {
  const moodEntity = world.queryFirst(Mood)
  const gs = world.get(GameState)
  if (!moodEntity || !gs) return 'greedy'
  const mood = moodEntity.get(Mood)!

  const candidate: PlannerName =
    mood.fear >= mood.greed && mood.fear >= mood.drive
      ? 'cautious'
      : mood.greed >= mood.drive
        ? 'seeker'
        : 'greedy'

  if (candidate === mood.planner) return mood.planner

  const candidateValue =
    candidate === 'cautious' ? mood.fear : candidate === 'seeker' ? mood.greed : mood.drive
  const currentValue =
    mood.planner === 'cautious'
      ? mood.fear
      : mood.planner === 'seeker'
        ? mood.greed
        : mood.drive
  if (candidateValue - currentValue < MOOD_SWITCH_THRESHOLD) return mood.planner
  if (gs.tick - mood.switchAtTick < PLAN_COMMIT_TICKS) return mood.planner

  moodEntity.set(Mood, { planner: candidate, switchAtTick: gs.tick })
  return candidate
}

/**
 * Hazard evade — find the nearest LATERAL cell that's not under any
 * active falling rock. Highest-priority response; runs before any
 * mood-driven planner. Returns null if no hazard threat or driller
 * already safe.
 *
 * The driller's column is "threatened" if any non-landed Hazard is in
 * column ±1. Evasion target: a SOIL or AIR cell at the same row in
 * the closest non-threatened column.
 */
export function planEvadeHazard(world: World, d: { col: number; row: number }): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, tiles } = grid

  const threatenedCols = new Set<number>()
  let threatened = false
  world.query(Hazard).forEach((entity) => {
    const h = entity.get(Hazard)
    if (!h || h.phase === 'landed') return
    for (let dc = -1; dc <= 1; dc++) threatenedCols.add(h.col + dc)
    if (Math.abs(h.col - d.col) <= 1) threatened = true
  })
  if (!threatened) return null

  // Search outward from driller for the closest passable column not under threat.
  for (let dist = 1; dist < cols; dist++) {
    for (const sign of [-1, 1] as const) {
      const c = d.col + dist * sign
      if (c < 0 || c >= cols) continue
      if (threatenedCols.has(c)) continue
      // Ensure stepping there is feasible (next-cell SOIL or AIR, not stone/rock/fixture).
      const idx = d.row * cols + c
      const t = tiles[idx]
      if (t === undefined) continue
      if (t === TILE_STONE || t === TILE_ROCK) continue
      if (t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 5) continue
      return [c, d.row]
    }
  }
  return null
}

export function plannerTick(world: World): void {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)!

  // Highest-priority override: evade falling rocks regardless of mood.
  const evade = planEvadeHazard(world, d)
  let next: [number, number] | null = evade

  if (!next) {
    const which = selectPlanner(world)
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
  }
  if (!next) return

  const target = drillerEntity.get(PlannerTarget)
  const gs = world.get(GameState)
  if (!gs) return

  // Evade overrides the sunk-cost commit window.
  if (target && !evade) {
    if (
      gs.tick - target.reservedAtTick < PLAN_COMMIT_TICKS &&
      (target.col !== d.col || target.row !== d.row)
    ) {
      return
    }
  }

  if (target) {
    drillerEntity.set(PlannerTarget, { col: next[0], row: next[1], reservedAtTick: gs.tick })
  } else {
    drillerEntity.add(PlannerTarget({ col: next[0], row: next[1], reservedAtTick: gs.tick }))
  }
}
