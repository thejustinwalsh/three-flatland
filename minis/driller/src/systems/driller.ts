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

  // Safety: if the driller's current cell is not AIR (e.g., a chunk
  // landed on the cell after respawn), force-clear it. Without this,
  // the driller appears to dig but stays atop a SOIL cell that never
  // gets cleared (the dig branch only runs for the *next* cell).
  const hereIdx = d.row * grid.cols + d.col
  if (grid.tiles[hereIdx] !== undefined && grid.tiles[hereIdx] !== TILE_AIR) {
    grid.tiles[hereIdx] = TILE_AIR
    grid.flags[hereIdx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, d.col, d.row)
  }

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

  // Multi-hit ROCK: decrement hit counter without moving until broken.
  if (tile === TILE_ROCK) {
    const hitsRemaining = (grid.hits[idx] ?? ROCK_HITS) - 1
    grid.hits[idx] = Math.max(0, hitsRemaining)
    if (hitsRemaining <= 0) {
      grid.tiles[idx] = TILE_AIR
      grid.flags[idx] = FLAG_AUTOTILE_DIRTY
      markCellAndNeighborsDirty(world, nc, nr)
      // ROCK broke — driller still doesn't move this tick (chip then advance next).
    }
    drillerEntity.set(Driller, { digCooldownMs: digIntervalForDepth(d.row), px, py })
    return
  }

  // Dig if SOIL.
  if (tile === TILE_SOIL) {
    grid.tiles[idx] = TILE_AIR
    grid.flags[idx] = FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, nc, nr)
  }

  // Auto-collect gem on entered cell + measure gem proximity for ponder.
  let collectedGem = false
  let nearbyGem = false
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected) return
    if (g.col === nc && g.row === nr && g.scatteredUntilTick === 0) {
      if (!collectedGem) {
        world.set(GameState, { gems: gs.gems + 1 })
        entity.destroy()
        collectedGem = true
      }
      return
    }
    // Gem within PONDER_GEM_RADIUS (Manhattan) → driller hesitates a beat.
    if (g.scatteredUntilTick === 0 && Math.abs(g.col - nc) + Math.abs(g.row - nr) <= PONDER_GEM_RADIUS) {
      nearbyGem = true
    }
  })

  // Move + animate.
  const facing = stepCol !== 0 ? (stepCol > 0 ? 1 : -1) : d.facing
  const baseCooldown = digIntervalForDepth(nr)
  const cooldownAfter = nearbyGem ? baseCooldown + PONDER_GEM_MS : baseCooldown
  drillerEntity.set(Driller, {
    col: nc,
    row: nr,
    px,
    py,
    facing,
    digCooldownMs: cooldownAfter,
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
