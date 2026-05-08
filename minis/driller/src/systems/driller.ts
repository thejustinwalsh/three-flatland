import type { World } from 'koota'
import {
  Animation,
  Driller,
  type DrillerAnimState,
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
 * cells in its path.
 */
export function drillerSystem(world: World, deltaMs: number): void {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return
  const d = drillerEntity.get(Driller)!
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return

  // Cooldown
  const cooldown = Math.max(0, d.digCooldownMs - deltaMs)

  // Smooth pixel chase
  const targetPx = d.col * TILE_PX + TILE_PX / 2
  const targetPy = d.row * TILE_PX + TILE_PX / 2
  const px = d.px + (targetPx - d.px) * 0.4
  const py = d.py + (targetPy - d.py) * 0.4

  if (cooldown > 0) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  const target = drillerEntity.get(PlannerTarget)
  if (!target) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  // One-step move toward target.
  const stepCol = Math.sign(target.col - d.col)
  const stepRow = Math.sign(target.row - d.row)
  let nc = d.col
  let nr = d.row
  if (stepCol !== 0) nc = d.col + stepCol
  else if (stepRow !== 0) nr = d.row + stepRow
  else {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }
  const idx = nr * grid.cols + nc
  const tile = grid.tiles[idx]
  if (tile === undefined) return
  if (tile === TILE_STONE || isFixture(tile)) {
    drillerEntity.set(Driller, { digCooldownMs: cooldown, px, py })
    return
  }

  // Dig if SOIL.
  if (tile === TILE_SOIL) {
    grid.tiles[idx] = TILE_AIR
    grid.flags[idx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, nc, nr)
  }

  // Move + animate.
  const facing = stepCol !== 0 ? (stepCol > 0 ? 1 : -1) : d.facing
  drillerEntity.set(Driller, {
    col: nc,
    row: nr,
    px,
    py,
    facing,
    digCooldownMs: DIG_INTERVAL_MS,
  })

  // Update depth tracking.
  if (nr > gs.depthM) {
    world.set(GameState, { depthM: nr, deepestM: Math.max(gs.deepestM, nr) })
  }

  // Animation.
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

function isFixture(t: number): boolean {
  return t >= TILE_FIXTURE_BASE && t < TILE_FIXTURE_BASE + 8
}

/**
 * Tick the mood drift system: target from world signals, lerp current toward it.
 */
export function moodDriftSystem(world: World, ticksSinceLastTap: number): void {
  const drillerEntity = world.queryFirst(Mood)
  if (!drillerEntity) return
  const m = drillerEntity.get(Mood)!

  const target = moodTarget({
    visibleGemCount: 0,
    sagOverhead: false,
    ticksSinceLastTap,
  })
  const drifted = driftMood({ greed: m.greed, fear: m.fear, drive: m.drive }, target)
  drillerEntity.set(Mood, { greed: drifted.greed, fear: drifted.fear, drive: drifted.drive })
}
