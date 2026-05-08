import type { World } from 'koota'
import {
  Driller,
  FallingChunk,
  FLAG_FALLING,
  FLAG_SHAKING,
  GameState,
  Gem,
  Grid,
  Hazard,
  Mood,
  type PlannerName,
  PlannerTarget,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
  isFixtureTile,
} from '../traits'

void TILE_SOIL // import kept for clarity in passability rules
import { MOOD_SWITCH_THRESHOLD, PLAN_COMMIT_TICKS, TILE_PX } from '../constants'
import { bfsNextStep } from '../lib/bfs'
import { isFreeFall } from '../biomes'

interface DrillerCell {
  col: number
  row: number
}

export function planGreedy(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid
  const below = (d.row + 1) * cols + d.col
  if (d.row + 1 < rows && tiles[below] !== TILE_STONE && !isFixtureTile(tiles[below] ?? TILE_AIR)) {
    return [d.col, d.row + 1]
  }
  for (const dc of [-1, 1]) {
    const nc = d.col + dc
    if (nc < 0 || nc >= cols) continue
    const idx = d.row * cols + nc
    const t = tiles[idx]
    if (t !== undefined && t !== TILE_STONE && !isFixtureTile(t)) {
      return [nc, d.row]
    }
  }
  return null
}

/**
 * Line-of-sight (LOS) for the gem-pull heuristic. Two cases count:
 *
 *   1. Same row as the driller, with every cell between them already
 *      AIR. Walk-and-grab — no digging required.
 *   2. Same column on a row above the driller, where the gem is "stuck
 *      in a rock" overhead. The driller can't reach it directly but
 *      shouldn't ignore it either — drilling up will eventually free
 *      it, or a hazard rock might land near it.
 *
 * Diagonal and straight-down LOS are intentionally excluded — straight
 * down is the default greedy path anyway, and diagonal lines aren't
 * walkable on a 4-connected grid.
 */
function hasLOS(
  grid: { cols: number; tiles: Uint8Array },
  dc: number,
  dr: number,
  gc: number,
  gr: number,
): boolean {
  const { cols, tiles } = grid
  if (dr === gr) {
    const lo = Math.min(dc, gc)
    const hi = Math.max(dc, gc)
    for (let c = lo + 1; c < hi; c++) {
      if (tiles[dr * cols + c] !== TILE_AIR) return false
    }
    return true
  }
  if (dc === gc && gr < dr) {
    // Gem above the driller, pinned overhead. Treat as LOS regardless
    // of whatever soil/rock sits between — the AI should weight these
    // gems heavily so it considers tactical drill-ups.
    const overhead = tiles[gr * cols + gc]
    if (overhead === TILE_STONE || overhead === TILE_SOIL) return true
  }
  return false
}

export function planSeeker(world: World, d: DrillerCell): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles } = grid

  // First pass: gems with direct cardinal LOS through AIR. These are the
  // strongest pull — a gem the driller can visibly see at the end of a
  // tunnel should never lose out to a buried gem behind soil. We also
  // give LOS gems a much wider scan range (LOS_SCAN) since you can see
  // farther through a tunnel than you'd reasonably dig.
  const losGems = new Set<number>()
  const buriedGems = new Set<number>()
  const LOS_SCAN = 18
  const BURIED_SCAN = 12
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected || g.scatteredUntilTick > 0) return
    const dist = Math.abs(g.col - d.col) + Math.abs(g.row - d.row)
    if (dist <= LOS_SCAN && hasLOS(grid, d.col, d.row, g.col, g.row)) {
      losGems.add(g.row * cols + g.col)
      return
    }
    if (dist <= BURIED_SCAN) buriedGems.add(g.row * cols + g.col)
  })

  // LOS gems take priority. Only fall back to buried gems if no LOS
  // candidate exists, so the seeker never detours through soil while a
  // visible gem sits at the end of an open tunnel.
  const gemSet = losGems.size > 0 ? losGems : buriedGems
  if (gemSet.size === 0) return null

  return bfsNextStep(
    d.col,
    d.row,
    cols,
    rows,
    (c, r) => gemSet.has(r * cols + c),
    (c, r, _fromC, fromR) => {
      const t = tiles[r * cols + c]
      if (t === undefined) return false
      // Stone, rock and fixtures block the path entirely.
      if (t === TILE_STONE) return false
      if (isFixtureTile(t)) return false
      // Gravity-strict: the driller never walks up. Reject any upward
      // step. (Drilling-up is a separate tactical action, not a pathing
      // primitive.)
      if (fromR >= 0 && r < fromR) return false
      return true
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
    if (t === undefined || t === TILE_STONE || isFixtureTile(t)) return false
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
      if (nt === TILE_STONE || (nt !== undefined && isFixtureTile(nt))) return true
    }
    return false
  }
  const isPassable = (c: number, r: number, _fromC: number, fromR: number): boolean => {
    const t = tiles[r * cols + c]
    if (t === undefined) return false
    if (t !== TILE_AIR && t !== TILE_SOIL) return false
    // Same gravity rule: never walk up.
    if (fromR >= 0 && r < fromR) return false
    return true
  }

  const next = bfsNextStep(d.col, d.row, cols, rows, isShelter, isPassable, 6)
  if (next) return next
  return planGreedy(world, d)
}

/**
 * Planner selection rules — hard priorities first, mood as tiebreaker.
 *
 *   1. ANY gem visible within scan-radius → seeker.
 *      Collecting gems is the goal of the game; there is no version of
 *      the game where the driller should ignore a gem they can reach.
 *      This bypasses mood hysteresis so a gem appearing next to a
 *      mid-greedy-dig immediately yanks the planner into seeker mode.
 *
 *   2. Otherwise, mood-driven (with hysteresis + sunk-cost window):
 *      Fear dominant → cautious; Greed → seeker; Drive → greedy.
 *
 * The cautious planner still wins over a gem when sag/hazard fear is
 * spiking: planEvadeHazard runs BEFORE selectPlanner in plannerTick, so
 * imminent crush hazards override everything.
 */
const GEM_SCAN_RADIUS = 6
const GEM_LOS_SCAN_RADIUS = 18

export function selectPlanner(world: World): PlannerName {
  const moodEntity = world.queryFirst(Mood)
  const gs = world.get(GameState)
  if (!moodEntity || !gs) return 'greedy'
  const mood = moodEntity.get(Mood)!

  // Hard rule: visible gem → seeker. No mood gating.
  // LOS gems pull from far (clear tunnel = strong magnet); buried gems
  // only count within the close scan radius.
  const driller = world.queryFirst(Driller)
  const grid = world.get(Grid)
  if (driller && grid) {
    const d = driller.get(Driller)!

    // FREE-FALL OVERRIDE: while in the void band the driller is on a
    // gem-collection sortie — max greed, force seeker, ignore mood
    // hysteresis. The seeker's BFS already handles diagonal-fall
    // pathing through AIR.
    if (isFreeFall(d.row)) {
      moodEntity.set(Mood, {
        planner: 'seeker',
        switchAtTick: gs.tick,
        greed: 1.0,
      })
      return 'seeker'
    }

    let gemVisible = false
    world.query(Gem).forEach((entity) => {
      if (gemVisible) return
      const g = entity.get(Gem)
      if (!g || g.collected || g.scatteredUntilTick > 0) return
      const dist = Math.abs(g.col - d.col) + Math.abs(g.row - d.row)
      if (dist <= GEM_LOS_SCAN_RADIUS && hasLOS(grid, d.col, d.row, g.col, g.row)) {
        gemVisible = true
        return
      }
      if (dist <= GEM_SCAN_RADIUS) gemVisible = true
    })
    if (gemVisible) {
      if (mood.planner !== 'seeker') {
        moodEntity.set(Mood, { planner: 'seeker', switchAtTick: gs.tick })
      }
      return 'seeker'
    }
  }

  // Fear dominant → cautious. Otherwise drive → greedy.
  const candidate: PlannerName =
    mood.fear >= mood.greed && mood.fear >= mood.drive
      ? 'cautious'
      : 'greedy'

  if (candidate === mood.planner) return mood.planner

  const candidateValue = candidate === 'cautious' ? mood.fear : mood.drive
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
      if (t === TILE_STONE) continue
      if (isFixtureTile(t)) continue
      return [c, d.row]
    }
  }
  return null
}

/**
 * Phase 2 correctness: avoid columns where a FallingChunk is in
 * mid-air ABOVE the driller. Until now the driller had no awareness
 * of falling soil chunks (they're entities, not grid cells), so the
 * AI would walk straight into a landing zone. Same shape as
 * planEvadeHazard: identify threatened columns, search outward for
 * the closest passable safe column, return that as the next step.
 *
 * "Threatened" = any FallingChunk whose cells occupy `d.col` (or
 * within ±1 col halo) AND whose lowest cell is currently AT or
 * ABOVE the driller's row. We don't care about chunks already past
 * the driller (they can't crush a driller they've already passed).
 */
export function planEvadeFallingChunk(
  world: World,
  d: { col: number; row: number },
): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, tiles } = grid

  const threatenedCols = new Set<number>()
  let threatened = false
  world.query(FallingChunk).forEach((entity) => {
    const fall = entity.get(FallingChunk)
    if (!fall) return
    const baseRow = Math.floor(fall.py / TILE_PX)
    const baseCol = Math.floor(fall.px / TILE_PX)
    let lowestRow = -Infinity
    const occupiedCols: number[] = []
    for (const c of fall.cells) {
      const fc = baseCol + c.col
      const fr = baseRow + c.row
      occupiedCols.push(fc)
      if (fr > lowestRow) lowestRow = fr
    }
    // Already past the driller — its bottom is BELOW driller's row.
    if (lowestRow > d.row) return
    for (const fc of occupiedCols) {
      threatenedCols.add(fc - 1)
      threatenedCols.add(fc)
      threatenedCols.add(fc + 1)
    }
    if (occupiedCols.includes(d.col)) threatened = true
  })
  if (!threatened) return null

  for (let dist = 1; dist < cols; dist++) {
    for (const sign of [-1, 1] as const) {
      const c = d.col + dist * sign
      if (c < 0 || c >= cols) continue
      if (threatenedCols.has(c)) continue
      const idx = d.row * cols + c
      const t = tiles[idx]
      if (t === undefined) continue
      if (t === TILE_STONE) continue
      if (isFixtureTile(t)) continue
      return [c, d.row]
    }
  }
  return null
}

/**
 * Phase 2 correctness: avoid columns where a rock cluster is
 * mid-telegraph or in-motion ABOVE the driller. Mirrors
 * planEvadeFallingChunk for soil chunks, but operates on grid cells
 * (rocks have no entity representation — they're FLAG_FALLING /
 * FLAG_SHAKING bits on TILE_STONE cells).
 *
 * "Threatened" = any cell with TILE_STONE && (FLAG_FALLING || FLAG_SHAKING)
 * whose row is AT or ABOVE the driller's row, with a ±1 col halo
 * (a falling rock can scatter sideways on impact / break-off).
 */
export function planEvadeMovingStoneCluster(
  world: World,
  d: { col: number; row: number },
): [number, number] | null {
  const grid = world.get(Grid)
  if (!grid) return null
  const { cols, rows, tiles, flags } = grid

  const threatenedCols = new Set<number>()
  // Bounded scan window — we only care about rows near and above the
  // driller. Below-driller rocks can't crush the driller.
  const winTop = Math.max(0, d.row - 32)
  const winBot = Math.min(rows, d.row + 1)
  for (let r = winTop; r < winBot; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      if (tiles[idx] !== TILE_STONE) continue
      const f = flags[idx] ?? 0
      if ((f & (FLAG_FALLING | FLAG_SHAKING)) === 0) continue
      threatenedCols.add(c - 1)
      threatenedCols.add(c)
      threatenedCols.add(c + 1)
    }
  }
  // Driller is in danger iff its column is in the threatened set.
  if (!threatenedCols.has(d.col)) return null

  for (let dist = 1; dist < cols; dist++) {
    for (const sign of [-1, 1] as const) {
      const c = d.col + dist * sign
      if (c < 0 || c >= cols) continue
      if (threatenedCols.has(c)) continue
      const idx = d.row * cols + c
      const t = tiles[idx]
      if (t === undefined) continue
      if (t === TILE_STONE) continue
      if (isFixtureTile(t)) continue
      return [c, d.row]
    }
  }
  return null
}

export function plannerTick(world: World): void {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)!

  // 1. Highest-priority overrides: evade incoming falling rocks AND
  //    in-flight FallingChunks AND in-motion / shaking rock clusters.
  //    Any of these threats trumps mood-based plans.
  const evadeFalling = planEvadeFallingChunk(world, d)
  const evadeStones = evadeFalling ? null : planEvadeMovingStoneCluster(world, d)
  const evadeHazard = evadeFalling || evadeStones ? null : planEvadeHazard(world, d)
  const evade = evadeFalling ?? evadeStones ?? evadeHazard
  let next: [number, number] | null = evade

  // 2. Selected planner. If the chosen planner returns null (e.g., seeker
  //    can't find a gravity-reachable gem) → fall through to greedy so the
  //    driller never just stands there staring at an unreachable gem.
  if (!next) {
    const which = selectPlanner(world)
    if (which === 'seeker') {
      next = planSeeker(world, d) ?? planGreedy(world, d)
    } else if (which === 'cautious') {
      next = planCautious(world, d) ?? planGreedy(world, d)
    } else {
      next = planGreedy(world, d)
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
