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

export function resolveHoverAction(
  world: World,
  col: number,
  row: number,
): { action: ActionKind; gemEntity: Entity | null } {
  const grid = world.get(Grid)
  if (!grid) return { action: 'none', gemEntity: null }
  const { cols, rows: gridRows, tiles, flags } = grid

  const drillerEntity = world.queryFirst(Driller)
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

  if (tile === TILE_SOIL && (flag & FLAG_SAGGING) !== 0) {
    return { action: 'brace', gemEntity: null }
  }

  if (
    tile === TILE_SOIL &&
    drillerEntity &&
    row < drillerEntity.get(Driller)!.row
  ) {
    return { action: 'trigger', gemEntity: null }
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
  const gs = world.get(GameState)
  if (!petEvents || !moodTrait || !gs) return false

  const pruned = petEvents.recentTicks.filter((t) => gs.tick - t <= OVER_PET_WINDOW_TICKS)
  pruned.push(gs.tick)
  drillerEntity.set(PetEvents, { recentTicks: pruned })

  if (pruned.length > OVER_PET_THRESHOLD) {
    const next = applyMoodEvent(
      { greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive },
      'over-pet',
    )
    drillerEntity.set(Mood, next)
    return true
  }
  const next = applyMoodEvent(
    { greed: moodTrait.greed, fear: moodTrait.fear, drive: moodTrait.drive },
    'pet',
  )
  drillerEntity.set(Mood, { ...next, trust: moodTrait.trust + 1 })
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

  let target: Entity | null = null
  world.query(SaggingChunk).forEach((entity) => {
    if (target) return
    const sag = entity.get(SaggingChunk)
    if (!sag) return
    for (const c of sag.cells) {
      if (c.col === ptr.hoverTargetCol && c.row === ptr.hoverTargetRow) {
        target = entity
        return
      }
    }
  })
  if (!target) return false

  ;(target as Entity).set(SaggingChunk, { bracedUntilTick: gs.tick + 120 })
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

function doTrigger(world: World): boolean {
  const ptr = world.get(Pointer)
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!ptr || !grid || !gs) return false
  const { cols, rows, tiles, flags } = grid
  const idx = ptr.hoverTargetRow * cols + ptr.hoverTargetCol
  const t = tiles[idx]
  if (t !== TILE_SOIL) return false

  const allChunks = detectChunks(tiles, cols, rows)
  const owning = allChunks.find((ch) => ch.cells.includes(idx))
  if (!owning) return false

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
      drillerEntity.set(Mood, next)
    }
  }
  return true
}
