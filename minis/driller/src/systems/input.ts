import type { Entity, World } from 'koota'
import {
  type ActionKind,
  Driller,
  FLAG_SAGGING,
  GameState,
  Gem,
  Grid,
  Mood,
  PetEvents,
  Pointer,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
} from '../traits'
import {
  BRACE_COST,
  OVER_PET_THRESHOLD,
  OVER_PET_WINDOW_TICKS,
  SAG_DURATION_TICKS,
  TILE_PX,
} from '../constants'
import { detectChunks } from '../lib/chunk-detect'
import { applyMoodEvent } from './ai-mood'

/**
 * Resolve the action a click would fire at the current cursor cell, by
 * walking the priority ladder defined in spec §8.1.
 */
export function resolveHoverAction(world: World, col: number, row: number): {
  action: ActionKind
  gemEntity: Entity | null
} {
  const grid = world.get(Grid)
  if (!grid) return { action: 'none', gemEntity: null }
  const { cols, rows: gridRows, tiles, flags } = grid

  // 1) Driller cell
  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const d = drillerEntity.get(Driller)!
    if (d.col === col && d.row === row) return { action: 'pet', gemEntity: null }
  }

  // 2) Gem on this cell
  let gemEntity: Entity | null = null
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.collected) return
    // Allow tapping gems anywhere on screen — just match cell.
    if (g.col === col && g.row === row && !gemEntity) gemEntity = entity
  })
  if (gemEntity) return { action: 'collect', gemEntity }

  // Out-of-bounds → none
  if (col < 0 || col >= cols || row < 0 || row >= gridRows) {
    return { action: 'none', gemEntity: null }
  }

  const idx = row * cols + col
  const tile = tiles[idx] ?? TILE_AIR
  const flag = flags[idx] ?? 0

  // 3) Sagging chunk → brace
  if (tile === TILE_SOIL && (flag & FLAG_SAGGING) !== 0) {
    return { action: 'brace', gemEntity: null }
  }

  // 4) Intact ceiling above driller → trigger
  if (
    tile === TILE_SOIL &&
    drillerEntity &&
    row < drillerEntity.get(Driller)!.row
  ) {
    return { action: 'trigger', gemEntity: null }
  }

  return { action: 'none', gemEntity: null }
}

/**
 * Map a canvas-space pointer to a world cell. The Game container passes
 * its scale + camera Y so this stays free of trait dependencies.
 */
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
  const { canvasX, canvasY, canvasW, canvasH, scale, cameraY, cols, rows } = args
  // Convert canvas-pixel coords to source pixels (un-scale).
  const sourceX = canvasX / scale
  const sourceY = canvasY / scale
  // Source X: 0 at the left of the play canvas; col = floor(sourceX / TILE_PX)
  const col = Math.max(0, Math.min(cols - 1, Math.floor(sourceX / TILE_PX)))
  const worldY = cameraY + sourceY
  const row = Math.max(0, Math.min(rows - 1, Math.floor(worldY / TILE_PX)))
  void canvasW
  void canvasH
  return { col, row }
}

/**
 * Commit one of the four actions. Returns true if the action fired so
 * the caller can play SFX / show feedback.
 */
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
      return doTrigger(world)
    case 'none':
      return false
  }
}

function doPet(world: World): boolean {
  const drillerEntity = world.queryFirst(Driller)
  if (!drillerEntity) return false
  const petEvents = drillerEntity.get(PetEvents)
  const moodTrait = drillerEntity.get(Mood)
  const gs = world.get(GameState)!
  if (!petEvents || !moodTrait) return false

  // Prune sliding-window
  petEvents.recentTicks = petEvents.recentTicks.filter(
    (t) => gs.tick - t <= OVER_PET_WINDOW_TICKS,
  )
  petEvents.recentTicks.push(gs.tick)

  if (petEvents.recentTicks.length > OVER_PET_THRESHOLD) {
    // Over-pet flips polarity to annoyance
    const next = applyMoodEvent({ greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive }, 'over-pet')
    moodTrait.greed = next.greed
    moodTrait.fear = next.fear
    moodTrait.drive = next.drive
    return true
  }

  const next = applyMoodEvent({ greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive }, 'pet')
  moodTrait.greed = next.greed
  moodTrait.fear = next.fear
  moodTrait.drive = next.drive
  moodTrait.trust += 1
  return true
}

function doCollect(world: World, target: Entity): boolean {
  const gem = target.get(Gem)
  const gs = world.get(GameState)
  if (!gem || !gs) return false
  if (gem.collected) return false
  gem.collected = true
  gs.gems += 1

  // Mood: relieved greed pressure
  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'gem-collected')
      m.greed = next.greed
      m.fear = next.fear
      m.drive = next.drive
    }
  }

  // Despawn the gem entity (Phase 13 will spawn a collect-arc particle here)
  target.destroy()
  return true
}

function doBrace(world: World): boolean {
  const gs = world.get(GameState)
  if (!gs) return false
  if (gs.gems < BRACE_COST) return false

  const ptr = world.get(Pointer)
  if (!ptr) return false

  // Find the SaggingChunk entity covering the hovered cell.
  let target: Entity | null = null
  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)
    if (!sag || target) return
    for (const c of sag.cells) {
      if (c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow) {
        target = entity
        return
      }
    }
  })
  if (!target) return false

  const sag = (target as Entity).get(SaggingChunk)!
  sag.bracedUntilTick = gs.tick + 120 // 2s @ 60Hz
  gs.gems -= BRACE_COST

  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'helpful-tap')
      m.greed = next.greed
      m.fear = next.fear
      m.drive = next.drive
    }
  }
  return true
}

function doTrigger(world: World): boolean {
  const ptr = world.get(Pointer)
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!ptr || !grid || !gs) return false
  const { cols, rows, tiles, flags } = grid
  const idx = ptr.hoverTargetRow * cols + ptr.hoverTargetCol
  const t = tiles[idx]
  if (t !== TILE_SOIL) return false

  // Find the SOIL chunk containing this cell; force it into sagging state.
  const allChunks = detectChunks(tiles, cols, rows)
  const owning = allChunks.find((ch) => ch.cells.includes(idx))
  if (!owning) return false

  // Skip if any cell in this chunk is already sagging/falling.
  for (const i of owning.cells) {
    const f = flags[i] ?? 0
    if (f & FLAG_SAGGING) return false
  }

  for (const i of owning.cells) flags[i] = (flags[i] ?? 0) | FLAG_SAGGING
  world.spawn(
    SaggingChunk({
      cells: owning.cells.map((i) => ({
        col: i % cols,
        row: Math.floor(i / cols),
        tile: tiles[i]!,
      })),
      startTick: gs.tick,
      durationTicks: SAG_DURATION_TICKS,
      bracedUntilTick: 0,
    }),
  )

  const drillerEntity = world.queryFirst(Driller)
  if (drillerEntity) {
    const m = drillerEntity.get(Mood)
    if (m) {
      const next = applyMoodEvent({ greed: m.greed, fear: m.fear, drive: m.drive }, 'evil-tap')
      m.greed = next.greed
      m.fear = next.fear
      m.drive = next.drive
    }
  }
  return true
}

