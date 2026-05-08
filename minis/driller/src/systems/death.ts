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

/**
 * Death pipeline runs only while `GameState.runState === 'dying'`. The
 * collapse system tags this state on crush; the death system advances
 * a small phase counter until the new driller is in place.
 */
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

  if (gs.runState !== 'dying' && deathPhase === 'idle') {
    return
  }

  if (deathPhase === 'idle' && gs.runState === 'dying') {
    // Just entered dying state — capture death position from current driller.
    const drillerEntity = world.queryFirst(Driller)
    if (drillerEntity) {
      const d = drillerEntity.get(Driller)!
      deathCol = d.col
      deathRow = d.row

      // Animate the driller as 'fall' before despawn.
      const anim = drillerEntity.get(Animation)
      if (anim) anim.state = 'fall'

      // Scatter collected gems around the impact.
      scatterGems(world, gs.gems, deathCol, deathRow, gs.tick)

      // Despawn the driller; respawn happens in 'respawn' phase.
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
      // Clear columns above death position (ghost chute).
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

    // Hero mode: lives unchanged. Full mode: decrement and watch for
    // run-end at zero.
    if (gs.mode === 'full') {
      gs.lives -= 1
      if (gs.lives <= 0) {
        gs.runState = 'leaderboard'
        deathPhase = 'idle'
        return
      }
    }
    gs.runState = 'playing'
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
  // Clear a 3-wide column from the top down to the death row, stopping
  // when we hit STONE/FIXTURE (the ghost passes through soil only).
  for (let r = 0; r < rows; r++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = deathCol + dc
      if (c < 0 || c >= cols) continue
      const idx = r * cols + c
      if (idx >= tiles.length) continue
      const t = tiles[idx]!
      // Only clear SOIL — STONE/FIXTURE survive the ghost.
      if (t === TILE_AIR || t > 1) continue
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
    }
  }
}

function respawnDriller(world: World): void {
  // Reset gems collected this life (they were scattered; user can recover them).
  // Trust persists; mood resets toward neutral with elevated drive (re-engaged).
  world.spawn(
    Driller({ col: deathCol, row: 0, px: deathCol * TILE_PX + TILE_PX / 2, py: TILE_PX / 2, facing: 1, digCooldownMs: 0 }),
    Mood({ greed: 0.2, fear: 0.2, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    Animation({ state: 'idle', frame: 0, frameAccumMs: 0 }),
    PetEvents(),
  )
}

/**
 * Hero-mode world-fall transition. Triggered when the driller crosses
 * ~250m (past the core biome's typical playable depth). The current world
 * resets: new seed, depth → 0, world number ticks up, chunks regenerate.
 *
 * The driller stays alive through this — the visual effect is a quick
 * fade-to-black handled at the renderer level (TBD), but the data
 * mechanics are: reset Grid + Seed + depth state.
 */
export function heroWorldFallSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs || gs.mode !== 'hero') return
  if (gs.depthM < 250) return
  // Trigger world-fall:
  gs.worldNumber += 1
  gs.depthM = 0
  gs.deepestM = 0
  // Caller must reset the streaming state; we do not import generation here
  // to keep death.ts decoupled. The Scene wires `resetStreaming()` after
  // this system ticks if worldNumber changed.
  // (Fresh chunk generation happens automatically next tick when streamChunks
  // sees no loaded chunks.)
}

/** Tick scattered gems toward expiry; despawn timed-out ones. */
export function scatteredGemsSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return
  world.query(Gem).forEach((entity) => {
    const g = entity.get(Gem)
    if (!g || g.scatteredUntilTick === 0) return
    if (gs.tick >= g.scatteredUntilTick) {
      entity.destroy()
    }
  })
}
