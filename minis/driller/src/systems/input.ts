import type { Entity, World } from 'koota'
import {
  type ActionKind,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_SAGGING,
  FLAG_SHAKING,
  GameState,
  Gem,
  Grid,
  Mood,
  PetEvents,
  Pointer,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
  isFixtureTile,
} from '../traits'
import {
  BRACE_COST,
  DRAG_COST_INTERVAL_TICKS,
  DRAG_COST_PER_INTERVAL,
  DRAG_COST_SCALE_PER_INTERVAL,
  OVER_PET_THRESHOLD,
  OVER_PET_WINDOW_TICKS,
  PAINT_ANCHOR_BUMP,
  PAINT_COST_PER_TICK,
  PET_COST,
  PET_PAUSE_TICKS,
  ROCK_BRACE_EXTEND_TICKS,
  SAG_DURATION_TICKS,
  SHAKE_COST,
  TILE_PX,
} from '../constants'
import { detectChunks } from '../lib/chunk-detect'
import { isFreeFall } from '../biomes'
import { applyMoodEvent } from './ai-mood'
import { braceShakingCluster } from './hazard'

export function resolveHoverAction(
  world: World,
  col: number,
  row: number,
): { action: ActionKind; gemEntity: Entity | null } {
  const grid = world.get(Grid)
  if (!grid) return { action: 'none', gemEntity: null }
  const { cols, rows: gridRows, tiles, flags } = grid

  const drillerEntity = world.queryFirst(Driller)

  // Free-fall mini-game: while the driller is dropping through the
  // void band between worlds, the player can collect ANY visible gem
  // by clicking anywhere — no exact-cell alignment required. Click
  // resolves to the nearest non-collected gem regardless of distance.
  // Once the driller lands and starts drilling again, normal exact-
  // cell hover rules return.
  if (drillerEntity) {
    const d = drillerEntity.get(Driller)!
    if (isFreeFall(d.row)) {
      let nearestGem: Entity | null = null
      let nearestDistSq = Infinity
      world.query(Gem).forEach((entity) => {
        const g = entity.get(Gem)
        if (!g || g.collected) return
        const dc = g.col - col
        const dr = g.row - row
        const distSq = dc * dc + dr * dr
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq
          nearestGem = entity
        }
      })
      if (nearestGem) return { action: 'collect', gemEntity: nearestGem }
      return { action: 'none', gemEntity: null }
    }
  }

  if (drillerEntity) {
    const d = drillerEntity.get(Driller)!
    if (d.col === col && d.row === row) return { action: 'pet', gemEntity: null }
  }

  let gemEntity: Entity | null = null
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected) return
    if (g.col === col && g.row === row && !gemEntity) gemEntity = entity
  })
  if (gemEntity) return { action: 'collect', gemEntity }

  if (col < 0 || col >= cols || row < 0 || row >= gridRows) {
    return { action: 'none', gemEntity: null }
  }

  const idx = row * cols + col
  const tile = tiles[idx] ?? TILE_AIR
  const flag = flags[idx] ?? 0

  // Anything currently in motion (SHAKING or FALLING) is drag-grabbable —
  // soil chunks from a sag, rock clusters from an avalanche/bomb cascade.
  // The player can intercept the chunk mid-fall, drag it to a new
  // location with tile collision, and re-drop it. Cost ramps per second.
  if ((flag & (FLAG_SHAKING | FLAG_FALLING)) !== 0 && !isFixtureTile(tile)) {
    return { action: 'drag', gemEntity: null }
  }

  if (tile === TILE_SOIL && (flag & FLAG_SAGGING) !== 0) {
    return { action: 'brace', gemEntity: null }
  }

  // A stable rock cell (not in motion, not yet shaking) → 'shake'.
  // Wiggle-detection in Game.tsx upgrades a stable-rock hover into the
  // commit; a plain click on the cell does nothing. The wiggle gesture
  // is the deliberate trigger that prevents accidental rock drops.
  if (tile === TILE_STONE && (flag & (FLAG_SHAKING | FLAG_FALLING)) === 0) {
    return { action: 'shake', gemEntity: null }
  }

  // SOIL anywhere → 'paint'. The player click-and-holds to accelerate
  // the cell toward collapse (anchor-distance bump per tick). Above
  // OR below the driller — paint is just a creative-chaos tool that
  // costs gems per tick regardless of direction.
  if (tile === TILE_SOIL) {
    return { action: 'paint', gemEntity: null }
  }

  return { action: 'none', gemEntity: null }
}

export function pointerWorldCell(args: {
  canvasX: number
  canvasY: number
  canvasW: number
  canvasH: number
  scale: number
  cameraY: number
  cols: number
  rows: number
}): { col: number; row: number } {
  const { canvasX, canvasY, scale, cameraY, cols, rows } = args
  const sourceX = canvasX / scale
  const sourceY = canvasY / scale
  const col = Math.max(0, Math.min(cols - 1, Math.floor(sourceX / TILE_PX)))
  const worldY = cameraY + sourceY
  const row = Math.max(0, Math.min(rows - 1, Math.floor(worldY / TILE_PX)))
  return { col, row }
}

export function commitAction(world: World, action: ActionKind, target: Entity | null): boolean {
  const gs = world.get(GameState)
  if (!gs) return false
  switch (action) {
    case 'pet':
      return doPet(world)
    case 'collect':
      return target ? doCollect(world, target) : false
    case 'brace':
      return doBrace(world)
    case 'trigger':
      // Legacy alias for paint — kept so any older callers still work.
      return doPaint(world)
    case 'shake':
      return doShake(world)
    case 'paint':
      return doPaint(world)
    case 'drag':
      // Drag is a held primitive driven by the pointer system per-tick,
      // not a one-shot commit. The Game.tsx pointerdown handler arms
      // it directly via Pointer.dragEntity; this branch is a no-op.
      return false
    case 'none':
      return false
  }
}

function doPet(world: World): boolean {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return false
  const petEvents = drillerEntity.get(PetEvents)
  const moodTrait = drillerEntity.get(Mood)
  const gs = world.get(GameState)
  if (!petEvents || !moodTrait || !gs) return false
  if (gs.gems < PET_COST) return false

  const pruned = petEvents.recentTicks.filter((t) => gs.tick - t <= OVER_PET_WINDOW_TICKS)
  pruned.push(gs.tick)
  drillerEntity.set(PetEvents, { recentTicks: pruned })
  world.set(GameState, { gems: gs.gems - PET_COST })

  if (pruned.length > OVER_PET_THRESHOLD) {
    // Over-pet: fear spikes, pause is INSTANTLY cleared so the driller
    // bolts. The mood-driven planner now sees high fear and routes via
    // cautious — the practical effect of "fleeing the touch".
    const next = applyMoodEvent(
      { greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive },
      'over-pet',
    )
    drillerEntity.set(Mood, next)
    drillerEntity.set(Driller, { pausedUntilTick: 0 })
    return true
  }
  // Regular pet: stops the driller in place for PET_PAUSE_TICKS so he
  // can enjoy it. Each pet RESETS the timer (stacking taps extend the
  // pause up to over-pet). Trust counter ticks up.
  const next = applyMoodEvent(
    { greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive },
    'pet',
  )
  drillerEntity.set(Mood, { ...next, trust: moodTrait.trust + 1 })
  drillerEntity.set(Driller, { pausedUntilTick: gs.tick + PET_PAUSE_TICKS })
  return true
}

function doCollect(world: World, target: Entity): boolean {
  const gem = target.get(Gem)
  const gs = world.get(GameState)
  if (!gem || !gs) return false
  if (gem.collected) return false

  world.set(GameState, { gems: gs.gems + 1 })
  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'gem-collected')
      drillerEntity.set(Mood, next)
    }
  }
  target.destroy()
  return true
}

function doBrace(world: World): boolean {
  const gs = world.get(GameState)
  const ptr = world.get(Pointer)
  if (!gs || !ptr) return false
  if (gs.gems < BRACE_COST) return false

  // Try soil sag first.
  let braced = false
  let soilTarget: Entity | null = null
  world.query(SaggingChunk).forEach((entity) => {
    if (soilTarget) return
    const sag = entity.get(SaggingChunk)
    if (!sag) return
    for (const c of sag.cells) {
      if (c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow) {
        soilTarget = entity
        return
      }
    }
  })
  if (soilTarget) {
    ;(soilTarget as Entity).set(SaggingChunk, { bracedUntilTick: gs.tick + 120 })
    braced = true
  } else {
    // Fall through to rock SHAKE clusters. doBrace is silent on success
    // here — `braceShakingCluster` returns true iff the cell is a
    // brace-able shaking rock.
    braced = braceShakingCluster(
      world,
      ptr.hoverTargetCol,
      ptr.hoverTargetRow,
      ROCK_BRACE_EXTEND_TICKS,
    )
  }
  if (!braced) return false
  world.set(GameState, { gems: gs.gems - BRACE_COST })

  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'helpful-tap')
      drillerEntity.set(Mood, next)
    }
  }
  return true
}

/**
 * Shake action: a deliberate wiggle gesture on a stable rock dislodges
 * it and the entire cluster instantly enters the falling state — no
 * shake telegraph (the user's wiggle WAS the telegraph). Used for
 * non-chunk solo rocks the player wants to drop on something. The
 * wiggle-detection lives in Game.tsx (pointer-path threshold); this
 * function just applies the gameplay consequence: 1 gem cost, set
 * FLAG_FALLING on the rock + every cluster sibling, clear FLAG_SHAKING.
 */
function doShake(world: World): boolean {
  const gs = world.get(GameState)
  const ptr = world.get(Pointer)
  const grid = world.get(Grid)
  if (!gs || !ptr || !grid) return false
  if (gs.gems < SHAKE_COST) return false
  const { cols, tiles, flags, clusterId } = grid
  const idx = ptr.hoverTargetRow * cols + ptr.hoverTargetCol
  const t = tiles[idx]
  if (t !== TILE_STONE) return false
  // Already in motion → no-op (the avalanche path is already running).
  if (((flags[idx] ?? 0) & (FLAG_SHAKING | FLAG_FALLING)) !== 0) return false

  const cid = clusterId[idx] ?? 0
  for (let i = 0; i < clusterId.length; i++) {
    if (tiles[i] !== TILE_STONE) continue
    // Solo stone (cluster id 0): only the clicked cell falls.
    if (cid === 0) {
      if (i !== idx) continue
    } else {
      if (clusterId[i] !== cid) continue
    }
    flags[i] = ((flags[i] ?? 0) & ~FLAG_SHAKING) | FLAG_FALLING | FLAG_AUTOTILE_DIRTY
  }

  world.set(GameState, { gems: gs.gems - SHAKE_COST })
  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'evil-tap')
      drillerEntity.set(Mood, next)
    }
  }
  return true
}

/**
 * Paint action: each commit ticks the hovered SOIL cell's anchor
 * distance up by PAINT_ANCHOR_BUMP, costing PAINT_COST_PER_TICK gems.
 * The held-pointer loop in Game.tsx calls this every relaxation tick
 * while the button is down on a soil cell. Once the cell crosses the
 * collapse threshold (the existing sag detector picks it up on the
 * next relaxation pass), the chunk shakes and falls normally — paint
 * doesn't bypass the SHAKE → FALL pipeline, it just accelerates entry.
 *
 * Replaces the old `trigger` action (which spawned a SaggingChunk
 * outright). Paint is the soft-evil version: ongoing gem cost, visual
 * decay, the player can stop or grab the resulting chunk mid-fall.
 */
function doPaint(world: World): boolean {
  const gs = world.get(GameState)
  const ptr = world.get(Pointer)
  const grid = world.get(Grid)
  if (!gs || !ptr || !grid) return false
  if (gs.gems < PAINT_COST_PER_TICK) return false
  const { cols, tiles, anchorDist, flags } = grid
  const idx = ptr.hoverTargetRow * cols + ptr.hoverTargetCol
  if (tiles[idx] !== TILE_SOIL) return false
  // Already sagging → don't double-charge; paint did its job.
  if (((flags[idx] ?? 0) & FLAG_SAGGING) !== 0) return false

  const cur = anchorDist[idx] ?? 0
  const next = Math.min(255, cur + PAINT_ANCHOR_BUMP)
  anchorDist[idx] = next
  flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY

  world.set(GameState, { gems: gs.gems - PAINT_COST_PER_TICK })
  // Evil-tap event each commit so the driller's mood reflects the
  // ongoing harassment, not just the first tick.
  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const np = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'evil-tap')
      drillerEntity.set(Mood, np)
    }
  }
  return true
}

/**
 * Compute the gem cost for the current drag tick. Base
 * DRAG_COST_PER_INTERVAL each DRAG_COST_INTERVAL_TICKS, scaling by
 * DRAG_COST_SCALE_PER_INTERVAL per elapsed interval. Exported for
 * the pointer drag tick in Game.tsx.
 */
export function dragCostForElapsed(elapsedTicks: number): number {
  const intervals = Math.floor(elapsedTicks / DRAG_COST_INTERVAL_TICKS)
  return DRAG_COST_PER_INTERVAL + intervals * DRAG_COST_SCALE_PER_INTERVAL
}

// `detectChunks` import retained only because the previous trigger
// implementation used it; kept available for future paint-cluster
// work if we ever want to limit paint to chunk-cells only.
void detectChunks
void SaggingChunk
void SAG_DURATION_TICKS
