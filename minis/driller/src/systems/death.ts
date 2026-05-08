import type { World } from 'koota'
import {
  Animation,
  Camera,
  Driller,
  Explosive,
  FallingChunk,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Gem,
  Grid,
  Hazard,
  Mood,
  Particle,
  PetEvents,
  PlannerTarget,
  SaggingChunk,
  TILE_AIR,
} from '../traits'
import type { GemColor, GemSize } from '../atlas-regions'
import { TILE_PX } from '../constants'
import { createRng } from '../lib/rng'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { setHazardSafeMinRow } from './hazard'

let deathPhase: 'idle' | 'scatter' | 'ghost' | 'respawn' = 'idle'
let deathTick = 0
let deathCol = 9
let deathRow = 0
let ghostRow = 0

const SCATTER_RADIUS = 6
/**
 * Per-row tick rate for the rising ghost beam. Lower = faster rise.
 * The beam rises until it reaches the top of the visible viewport,
 * with `GHOST_MAX_ROWS` as a safety ceiling so a deeply-buried death
 * doesn't cap the rise budget. The respawn fires once the beam has
 * either escaped the viewport or hit the safety ceiling.
 */
const GHOST_TICKS_PER_ROW = 2
const GHOST_MAX_ROWS = 60

/**
 * Live snapshot of the ghost beam used by the renderer. Updated each
 * tick during the 'ghost' death phase; `active=false` between deaths.
 */
export const ghostBeam = {
  active: false,
  col: 9,
  row: 0,
  startTick: 0,
  elapsedTicks: 0,
}

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
    ghostRow = deathRow
    return
  }

  if (deathPhase === 'scatter') {
    if (gs.tick - deathTick >= 12) {
      deathPhase = 'ghost'
      deathTick = gs.tick
      ghostRow = deathRow
      ghostBeam.active = true
      ghostBeam.col = deathCol
      ghostBeam.row = ghostRow
      ghostBeam.startTick = gs.tick
      ghostBeam.elapsedTicks = 0
      // Clear the death cell itself immediately — the rest rises on
      // a per-tick schedule below.
      clearGhostRow(world, deathCol, ghostRow)
    }
    return
  }

  if (deathPhase === 'ghost') {
    // Rising ghost beam clears a 3-wide chute as it ascends. It
    // continues all the way to the top of the visible viewport
    // (capped by GHOST_MAX_ROWS) so the player sees the column
    // wiped clean to the heavens. The beam's own sprite is rendered
    // by GhostBeam.tsx using the snapshot below.
    const elapsed = gs.tick - deathTick
    const targetRow = deathRow - Math.floor(elapsed / GHOST_TICKS_PER_ROW)
    while (ghostRow > targetRow && ghostRow > 0) {
      ghostRow--
      clearGhostRow(world, deathCol, ghostRow)
    }
    ghostBeam.row = ghostRow
    ghostBeam.elapsedTicks = elapsed

    // Stop conditions: beam has escaped the visible viewport, or hit
    // the safety ceiling, or reached row 0.
    const cam = world.get(Camera)
    const cameraTopRow = cam ? Math.floor(cam.y / TILE_PX) - 2 : -10
    const escapedViewport = ghostRow <= cameraTopRow
    const hitCeiling = deathRow - ghostRow >= GHOST_MAX_ROWS
    const atWorldTop = ghostRow <= 0
    if (escapedViewport || hitCeiling || atWorldTop) {
      ghostBeam.active = false
      deathPhase = 'respawn'
    }
    return
  }

  if (deathPhase === 'respawn') {
    if (gs.mode === 'full') {
      const newLives = gs.lives - 1
      if (newLives <= 0) {
        // Third death — full reset goes via leaderboard prompt; the
        // restart handler in Game.tsx wipes seed + grid + lives.
        // Driller is NOT respawned here; restart flow does that.
        world.set(GameState, { lives: 0, runState: 'leaderboard' })
        deathPhase = 'idle'
        return
      }
      respawnDrillerAtDeath(world)
      world.set(GameState, { lives: newLives, runState: 'playing' })
    } else {
      // Hero / infinite mode — always respawn at the death cell.
      respawnDrillerAtDeath(world)
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

  // Death scatter: spawn FALLING gems around the death cell. They
  // aren't frozen-in-air markers any more — gem-gravity processes
  // them as regular gems, so they tumble down the now-cleared ghost
  // chute and pile up on whatever surface catches them. Some will
  // scroll off the playfield top during the rise; that's fine.
  for (let i = 0; i < Math.min(count, 8); i++) {
    const angle = rng.next() * Math.PI * 2
    const dist = (1 + rng.next() * (SCATTER_RADIUS - 1))
    const dCol = col + Math.round(Math.cos(angle) * dist)
    const dRow = row + Math.round(Math.sin(angle) * dist)
    const color = colors[rng.intRange(0, colors.length - 1)]!
    const sizes: GemSize[] = ['small', 'medium', 'large']
    const size = sizes[rng.intRange(0, sizes.length - 1)]!
    world.spawn(
      Gem({
        col: dCol,
        row: dRow,
        prevRow: dRow,
        color,
        size,
        collected: false,
        scatteredUntilTick: 0,
        px: dCol * TILE_PX + TILE_PX / 2,
        py: dRow * TILE_PX + TILE_PX / 2,
        collectProgress: 0,
        fallCooldownMs: 0,
        stepDurationMs: 0,
      }),
    )
  }
  void tick
}

/**
 * Per-row clear used by the rising ghost beam. Wipes a 3-wide strip
 * (deathCol-1, deathCol, deathCol+1) at the given row to AIR. Any
 * tile present is destroyed instantly — soil, stone, rock,
 * explosive, fixture. Gems are left in place; they end up in AIR
 * cells and gem-gravity will tumble them down the chute.
 */
function clearGhostRow(world: World, deathCol: number, row: number): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid
  if (row < 0 || row >= rows) return
  for (let dc = -1; dc <= 1; dc++) {
    const c = deathCol + dc
    if (c < 0 || c >= cols) continue
    const idx = row * cols + c
    if (idx >= tiles.length) continue
    if (tiles[idx] === TILE_AIR) continue
    tiles[idx] = TILE_AIR
    flags[idx] = (flags[idx] ?? 0) | FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, c, row)
  }
}

/**
 * Respawn the driller AT the death position (not at the world top).
 * Top-of-world reset only happens after 3 deaths in full mode (handled
 * via the leaderboard branch in the deathSystem state machine).
 */
/** Rows the driller has to dig down past the death cell before
 *  hazard rocks are allowed to spawn again. */
const POST_RESPAWN_ROCK_COOLDOWN_ROWS = 3

function respawnDrillerAtDeath(world: World): void {
  world.spawn(
    Driller({
      col: deathCol,
      row: deathRow,
      px: deathCol * TILE_PX + TILE_PX / 2,
      py: deathRow * TILE_PX + TILE_PX / 2,
      destCol: deathCol,
      destRow: deathRow,
      facing: 1,
      drillCooldownMs: 0,
    }),
    Mood({ greed: 0.2, fear: 0.2, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    Animation({ state: 'idle', frame: 0, frameAccumMs: 0 }),
    PetEvents(),
  )
  setHazardSafeMinRow(deathRow + POST_RESPAWN_ROCK_COOLDOWN_ROWS)
}

/**
 * Hero-mode world rotation is GONE. Mr. Driller's loop is "you keep
 * falling, the next biome layer streams in below you, the world
 * never ends" — not "you teleport to the top". The streamer
 * (`streamChunks`) handles infinite descent: chunks above the camera
 * get unloaded, chunks below get generated. Memory stays bounded via
 * the row-rebase compaction in `rebaseGridIfNeeded` — the absolute
 * depth display still climbs forever, but internal row indices wrap
 * back into a reasonable working range.
 *
 * Kept as an exported no-op so existing Scene.tsx wiring still
 * resolves; remove the call site once we're sure nothing depends on
 * the symbol.
 */
export function heroWorldFallSystem(_world: World): void {
  // intentionally empty — see comment block above
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
