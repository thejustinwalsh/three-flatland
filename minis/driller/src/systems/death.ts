import type { World } from 'koota'
import {
  Animation,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Gem,
  Grid,
  Mood,
  PetEvents,
  TILE_AIR,
} from '../traits'
import type { GemColor, GemSize } from '../atlas-regions'
import { TILE_PX } from '../constants'
import { createRng } from '../lib/rng'

let deathPhase: 'idle' | 'scatter' | 'ghost' | 'respawn' = 'idle'
let deathTick = 0
let deathCol = 9
let deathRow = 0

const SCATTER_RADIUS = 6
const GHOST_TICKS = 24
const SCATTER_LIFETIME_TICKS = 180

export function deathSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return

  if (gs.runState !== 'dying' && deathPhase === 'idle') return

  if (deathPhase === 'idle' && gs.runState === 'dying') {
    const drillerEntity = world.queryFirst(Driller)
    if (drillerEntity) {
      const d = drillerEntity.get(Driller)!
      deathCol = d.col
      deathRow = d.row
      drillerEntity.set(Animation, { state: 'fall' })
      scatterGems(world, gs.gems, deathCol, deathRow, gs.tick)
      drillerEntity.destroy()
    }
    deathPhase = 'scatter'
    deathTick = gs.tick
    return
  }

  if (deathPhase === 'scatter') {
    if (gs.tick - deathTick >= 12) {
      deathPhase = 'ghost'
      deathTick = gs.tick
      clearGhostChute(world, deathCol)
    }
    return
  }

  if (deathPhase === 'ghost') {
    if (gs.tick - deathTick >= GHOST_TICKS) {
      deathPhase = 'respawn'
    }
    return
  }

  if (deathPhase === 'respawn') {
    respawnDriller(world)

    if (gs.mode === 'full') {
      const newLives = gs.lives - 1
      if (newLives <= 0) {
        world.set(GameState, { lives: 0, runState: 'leaderboard' })
        deathPhase = 'idle'
        return
      }
      world.set(GameState, { lives: newLives, runState: 'playing' })
    } else {
      world.set(GameState, { runState: 'playing' })
    }
    deathPhase = 'idle'
    return
  }
}

function scatterGems(world: World, count: number, col: number, row: number, tick: number): void {
  if (count <= 0) return
  const rng = createRng(((tick * 9301) ^ (col * 49297) ^ row) >>> 0)
  const colors: GemColor[] = ['emerald', 'topaz', 'ruby', 'amethyst']

  for (let i = 0; i < Math.min(count, 8); i++) {
    const angle = rng.next() * Math.PI * 2
    const dist = (1 + rng.next() * (SCATTER_RADIUS - 1)) * TILE_PX
    const px = col * TILE_PX + Math.cos(angle) * dist
    const py = row * TILE_PX + Math.sin(angle) * dist
    const color = colors[rng.intRange(0, colors.length - 1)]!
    const sizes: GemSize[] = ['small', 'medium', 'large']
    const size = sizes[rng.intRange(0, sizes.length - 1)]!
    world.spawn(
      Gem({
        col: Math.floor(px / TILE_PX),
        row: Math.floor(py / TILE_PX),
        color,
        size,
        collected: false,
        scatteredUntilTick: tick + SCATTER_LIFETIME_TICKS,
        px,
        py,
      }),
    )
  }
}

function clearGhostChute(world: World, deathCol: number): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
  for (let r = 0; r < rows; r++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = deathCol + dc
      if (c < 0 || c >= cols) continue
      const idx = r * cols + c
      if (idx >= tiles.length) continue
      const t = tiles[idx]!
      if (t === TILE_AIR || t > 1) continue
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
    }
  }
}

function respawnDriller(world: World): void {
  world.spawn(
    Driller({
      col: deathCol,
      row: 0,
      px: deathCol * TILE_PX + TILE_PX / 2,
      py: TILE_PX / 2,
      facing: 1,
      digCooldownMs: 0,
    }),
    Mood({ greed: 0.2, fear: 0.2, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    Animation({ state: 'idle', frame: 0, frameAccumMs: 0 }),
    PetEvents(),
  )
}

export function heroWorldFallSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs || gs.mode !== 'hero') return
  if (gs.depthM < 250) return
  world.set(GameState, {
    worldNumber: gs.worldNumber + 1,
    depthM: 0,
    deepestM: 0,
  })
}

export function scatteredGemsSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.scatteredUntilTick === 0) return
    if (gs.tick >= g.scatteredUntilTick) entity.destroy()
  })
}
