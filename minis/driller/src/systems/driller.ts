import type { World } from 'koota'
import {
  Animation,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Grid,
  Mood,
  PlannerTarget,
  TILE_AIR,
  TILE_FIXTURE_BASE,
  TILE_SOIL,
  TILE_STONE,
} from '../traits'
import { TILE_PX } from '../constants'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { driftMood, moodTarget } from './ai-mood'

const DIG_INTERVAL_MS = 180

/**
 * Move the driller toward its current PlannerTarget, digging through SOIL
 * cells in its path. Stone and fixtures block movement (planner re-routes
 * around them).
 *
 * Also advances the floating-point pixel position for smooth rendering
 * between cell snaps.
 */
export function drillerSystem(world: World, deltaMs: number): void {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)!
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return

  // Cooldown
  d.digCooldownMs = Math.max(0, d.digCooldownMs - deltaMs)

  // Smoothly chase the cell-anchored pixel position.
  const targetPx = d.col * TILE_PX + TILE_PX / 2
  const targetPy = d.row * TILE_PX + TILE_PX / 2
  d.px += (targetPx - d.px) * 0.4
  d.py += (targetPy - d.py) * 0.4

  if (d.digCooldownMs > 0) return

  const target = drillerEntity.get(PlannerTarget)
  if (!target) return

  // Determine next step (single cell move toward target).
  const stepCol = Math.sign(target.col - d.col)
  const stepRow = Math.sign(target.row - d.row)
  let nc = d.col
  let nr = d.row
  if (stepCol !== 0) nc = d.col + stepCol
  else if (stepRow !== 0) nr = d.row + stepRow
  else return // already at target

  if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return
  const idx = nr * grid.cols + nc
  const tile = grid.tiles[idx]
  if (tile === undefined) return
  if (tile === TILE_STONE || isFixture(tile)) return

  // Dig if SOIL.
  if (tile === TILE_SOIL) {
    grid.tiles[idx] = TILE_AIR
    grid.flags[idx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, nc, nr)
  }

  // Move.
  d.col = nc
  d.row = nr
  if (stepCol !== 0) d.facing = stepCol > 0 ? 1 : -1
  d.digCooldownMs = DIG_INTERVAL_MS

  // Update depthM tracking.
  if (d.row > gs.depthM) gs.depthM = d.row
  if (d.row > gs.deepestM) gs.deepestM = d.row

  // Animation state hint — exact frame timing handled later.
  const anim = drillerEntity.get(Animation)
  if (anim) anim.state = stepRow > 0 ? 'drillDown' : stepRow < 0 ? 'drillUp' : stepCol > 0 ? 'drillRight' : 'drillLeft'
}

function isFixture(t: number): boolean {
  return t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 8
}

/**
 * Tick the mood drift system. Computes a target mood from the current
 * world state and drifts current toward it.
 *
 * Phase 8: lightweight signals (gem visibility, idle time). The
 * collapse-system already mutates Mood directly via applyMoodEvent on
 * sag-overhead events, so this only needs the slow background drift.
 */
export function moodDriftSystem(world: World, ticksSinceLastTap: number): void {
  const drillerEntity = world.queryFirst(Mood)
  if (!drillerEntity) return
  const m = drillerEntity.get(Mood)!

  const target = moodTarget({
    visibleGemCount: 0, // wired in a polish pass; cheap default for now
    sagOverhead: false,
    ticksSinceLastTap,
  })
  const drifted = driftMood({ greed: m.greed, fear: m.fear, drive: m.drive }, target)
  m.greed = drifted.greed
  m.fear = drifted.fear
  m.drive = drifted.drive
}
