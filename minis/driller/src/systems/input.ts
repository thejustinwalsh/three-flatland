import type { Entity, World } from 'koota'
import {
  type ActionKind,
  Drag,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_SAGGING,
  FLAG_SHAKING,
  GameState,
  Gem,
  Grid,
  Mood,
  OverPetIndicator,
  PetEvents,
  Pointer,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
  isFixtureTile,
} from '../traits'
import {
  BRACE_COST,
  DRAG_COST_INTERVAL_TICKS,
  DRAG_COST_PER_INTERVAL,
  DRAG_COST_SCALE_PER_INTERVAL,
  GEM_COLLECT_COOLDOWN_TICKS,
  GEM_FADE_TICKS,
  OVER_PET_THRESHOLD,
  OVER_PET_WINDOW_TICKS,
  PAINT_COST_PER_TICK,
  PET_COST,
  PET_PAUSE_TICKS,
  ROCK_BRACE_EXTEND_TICKS,
  TILE_PX,
} from '../constants'
import { isFreeFall } from '../biomes'
import { applyMoodEvent } from './ai-mood'
import { braceShakingCluster } from './hazard'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { spendGems } from './gem-spend'
import { playSound } from './sounds'

/**
 * Resolve the action that fires when the user clicks at (col, row).
 *
 * Priority (high → low):
 *   1. Active drag — while a drag is in progress, every hover resolves
 *      to 'drag' so the press stays exclusively in drag mode. Stops
 *      the user from accidentally collecting / petting / painting on
 *      release after a drag.
 *   2. Gem (exact cell match OR ±1 Chebyshev halo) — slightly oversized
 *      touch target so clicks adjacent to a small gem still collect it.
 *   3. Pet (driller's exact cell).
 *   4. Drag (chunk currently SHAKING/FALLING in this cell).
 *   5. Brace (soil chunk currently SAGGING).
 *   6. Paint (any soil cell).
 *   7. None.
 *
 * Free-fall is the exception: in the void band the player can collect
 * the nearest gem by clicking anywhere (no halo limit), and other
 * actions are unreachable anyway (no SOIL, no driller-cell pet because
 * the driller is mid-fall).
 */
export function resolveHoverAction(
  world: World,
  col: number,
  row: number
): { action: ActionKind; gemEntity: Entity | null } {
  const grid = world.get(Grid)
  if (!grid) return { action: 'none', gemEntity: null }
  const { cols, rows: gridRows, tiles, flags } = grid

  // 1. Active drag locks the hover action.
  const drag = world.get(Drag)
  if (drag && drag.clusterId !== 0) {
    return { action: 'drag', gemEntity: null }
  }

  const drillerEntity = world.queryFirst(Driller)

  // Free-fall: nearest gem anywhere, no halo, no other actions.
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

  // 2. Gem with ±1 cell halo. Exact-cell match wins over halo neighbors.
  let gemEntity: Entity | null = null
  let gemDist = Infinity
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected) return
    const dc = Math.abs(g.col - col)
    const dr = Math.abs(g.row - row)
    const cheby = Math.max(dc, dr)
    if (cheby > 1) return
    if (cheby < gemDist) {
      gemDist = cheby
      gemEntity = entity
    }
  })
  if (gemEntity) return { action: 'collect', gemEntity }

  // 3. Pet — driller's exact cell.
  if (drillerEntity) {
    const d = drillerEntity.get(Driller)!
    if (d.col === col && d.row === row) return { action: 'pet', gemEntity: null }
  }

  if (col < 0 || col >= cols || row < 0 || row >= gridRows) {
    return { action: 'none', gemEntity: null }
  }
  const idx = row * cols + col
  const tile = tiles[idx] ?? TILE_AIR
  const flag = flags[idx] ?? 0

  // 4. Drag (this cell is currently in motion).
  if ((flag & (FLAG_SHAKING | FLAG_FALLING)) !== 0 && !isFixtureTile(tile)) {
    return { action: 'drag', gemEntity: null }
  }

  // 5. Brace (sagging soil).
  if (tile === TILE_SOIL && (flag & FLAG_SAGGING) !== 0) {
    return { action: 'brace', gemEntity: null }
  }

  // 6. Paint (any soil).
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
  // Pet cost popup over the driller's current cell.
  const dPos = drillerEntity.get(Driller)!
  spendGems(world, PET_COST, dPos.col, dPos.row)

  if (pruned.length > OVER_PET_THRESHOLD) {
    // Over-pet: fear spikes, pause is INSTANTLY cleared so the driller
    // bolts. The mood-driven planner now sees high fear and routes via
    // cautious — the practical effect of "fleeing the touch". Spawn
    // a brief angry-shake indicator at the driller's cell so the
    // player sees WHY the driller bolted.
    const next = applyMoodEvent(
      { greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive },
      'over-pet'
    )
    drillerEntity.set(Mood, next)
    const dNow = drillerEntity.get(Driller)!
    drillerEntity.set(Driller, { pausedUntilTick: 0, petPauseQueuedTicks: 0 })
    world.spawn(OverPetIndicator({ col: dNow.col, row: dNow.row, startTick: gs.tick }))
    playSound(world, 'overPetGrunt')
    return true
  }
  // Regular pet: stops the driller in place for PET_PAUSE_TICKS — but
  // ONLY when grounded. Petting in mid-fall doesn't levitate him; the
  // pause is queued in petPauseQueuedTicks and applied on landing.
  const driller = drillerEntity.get(Driller)!
  const grid = world.get(Grid)
  let grounded = true
  if (grid) {
    const supportRow = driller.row + 1
    if (supportRow < grid.rows) {
      const supportTile = grid.tiles[supportRow * grid.cols + driller.col]
      grounded = supportTile !== undefined && supportTile !== TILE_AIR
    }
  }
  const next = applyMoodEvent(
    { greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive },
    'pet'
  )
  drillerEntity.set(Mood, { ...next, trust: moodTrait.trust + 1 })
  if (grounded) {
    drillerEntity.set(Driller, {
      pausedUntilTick: gs.tick + PET_PAUSE_TICKS,
      petPauseQueuedTicks: 0,
    })
  } else {
    drillerEntity.set(Driller, { petPauseQueuedTicks: PET_PAUSE_TICKS })
  }
  playSound(world, 'pet')
  return true
}

/**
 * Gem cash-out values per size. Bigger gems are visually larger AND
 * worth more — they're both the rarer drop and the better find.
 *   small  = 1   (most common)
 *   medium = 3
 *   large  = 5
 *   huge   = 10  (jackpot)
 */
const GEM_VALUE = { small: 1, medium: 3, large: 5, huge: 10 } as const

function doCollect(world: World, target: Entity): boolean {
  const gem = target.get(Gem)
  const gs = world.get(GameState)
  const ptr = world.get(Pointer)
  if (!gem || !gs || !ptr) return false
  if (gem.collected) return false

  // Per-collect cooldown — prevents auto-clicker farming in gameplay.
  // Bypassed in the void band (gem bonus zone is intentionally a free-
  // for-all click frenzy).
  const drillerEntity = world.queryFirst(Driller)
  const driller = drillerEntity ? drillerEntity.get(Driller) : null
  const inVoid = driller ? isFreeFall(driller.row) : false
  if (!inVoid && gs.tick < ptr.collectCooldownUntilTick) return false

  const value = GEM_VALUE[gem.size] ?? 1
  world.set(GameState, { gems: gs.gems + value })
  if (!inVoid) {
    world.set(Pointer, { collectCooldownUntilTick: gs.tick + GEM_COLLECT_COOLDOWN_TICKS })
  }
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'gem-collected')
      drillerEntity.set(Mood, next)
    }
  }
  target.destroy()
  playSound(world, 'gemCollect')
  return true
}

function doBrace(world: World): boolean {
  const gs = world.get(GameState)
  const ptr = world.get(Pointer)
  if (!gs || !ptr) return false
  if (gs.gems < BRACE_COST) return false

  // Try soil sag first.
  let braced = false
  const soilTarget = world.query(SaggingChunk).find((entity) => {
    const sag = entity.get(SaggingChunk)
    return sag?.cells.some(
      (cell) => cell.col === ptr.hoverTargetCol && cell.row === ptr.hoverTargetRow
    )
  })
  if (soilTarget) {
    soilTarget.set(SaggingChunk, { bracedUntilTick: gs.tick + 120 })
    braced = true
  } else {
    // Fall through to rock SHAKE clusters. doBrace is silent on success
    // here — `braceShakingCluster` returns true iff the cell is a
    // brace-able shaking rock.
    braced = braceShakingCluster(
      world,
      ptr.hoverTargetCol,
      ptr.hoverTargetRow,
      ROCK_BRACE_EXTEND_TICKS
    )
  }
  if (!braced) return false
  // Pop the cost over the cell the player braced (pointer's hover cell).
  spendGems(world, BRACE_COST, ptr.hoverTargetCol, ptr.hoverTargetRow)

  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'helpful-tap')
      drillerEntity.set(Mood, next)
    }
  }
  playSound(world, 'brace')
  return true
}

/**
 * Paint action: instantly DESTROYS the hovered soil cell (SOIL → AIR)
 * for PAINT_COST_PER_TICK gems. The held-pointer loop in Game.tsx
 * re-fires this each game tick while the button stays down — drag
 * the cursor across soil to carve a hole as wide as you can afford.
 *
 * Anchor distances are recomputed by the existing relaxation pass on
 * the next tick, so any overhang the destruction creates will trip
 * the SHAKE → FALL pipeline organically. Paint doesn't manually
 * spawn sags; it just opens holes and lets the existing collapse
 * detector observe the consequences.
 *
 * Replaces the old `trigger` action (which spawned a SaggingChunk
 * outright). The earlier anchor-distance-bump version was the wrong
 * curve — too slow to feel responsive given the per-tick cost.
 */
function doPaint(world: World): boolean {
  const gs = world.get(GameState)
  const ptr = world.get(Pointer)
  const grid = world.get(Grid)
  if (!gs || !ptr || !grid) return false
  if (gs.gems < PAINT_COST_PER_TICK) return false
  const { cols, tiles, flags } = grid
  const idx = ptr.hoverTargetRow * cols + ptr.hoverTargetCol
  if (tiles[idx] !== TILE_SOIL) return false

  tiles[idx] = TILE_AIR
  flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
  markCellAndNeighborsDirty(world, ptr.hoverTargetCol, ptr.hoverTargetRow)

  // Arm fade timers on any gems on the painted row — same exposure
  // logic as drilling. A destroyed cell IS a row mutation.
  const paintRow = ptr.hoverTargetRow
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)!
    if (g.collected) return
    if (g.expireAtTick !== 0) return
    if (g.row !== paintRow) return
    if (isFreeFall(g.row)) return
    entity.set(Gem, { expireAtTick: gs.tick + GEM_FADE_TICKS })
  })

  // Pop the per-tick cost over the painted cell; stacking turns held
  // paint into one growing "-N" popup instead of per-tick confetti.
  spendGems(world, PAINT_COST_PER_TICK, ptr.hoverTargetCol, ptr.hoverTargetRow)
  playSound(world, 'trigger')
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

/**
 * Per-tick held-action driver. Paint and drag are held primitives
 * (button down → ongoing effect each tick). Game.tsx fires the first
 * paint commit on pointerdown; this system fires every subsequent
 * tick while the button stays down on a paintable cell.
 *
 * Re-resolves the hover action each tick because the cell underneath
 * can shift state (paint pushes a soil cell into FLAG_SAGGING; then
 * the next tick's correct action is 'drag', not 'paint'). Without
 * the re-resolve a player could keep paying paint costs after the
 * cell already triggered a chunk.
 */
export function pointerHeldTick(world: World): void {
  const ptr = world.get(Pointer)
  if (!ptr || !ptr.active) return
  // Hover cell may have shifted state since the last pointermove —
  // refresh the displayed hoverAction so the cursor UI keeps in
  // sync. But the COMMIT action is gated by the locked mode from
  // pointerdown; switching what's under the cursor doesn't switch
  // which action fires while the button is held.
  const { action, gemEntity } = resolveHoverAction(world, ptr.hoverTargetCol, ptr.hoverTargetRow)
  if (action !== ptr.hoverAction) {
    world.set(Pointer, {
      hoverAction: action,
      hoverGemEntity: gemEntity?.id() ?? 0,
    })
  }
  // Mode lock: only the action that was bound at pointerdown ticks.
  // 'paint' is the only continuously-tickable action (shake fires on
  // wiggle threshold, drag is its own system, etc.).
  if (ptr.lockedAction === 'paint' && action === 'paint') {
    commitAction(world, 'paint', null)
  }
}
