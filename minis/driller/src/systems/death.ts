import type { World } from 'koota'
import {
  Animation,
  Camera,
  Driller,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Gem,
  Grid,
  Mood,
  PetEvents,
  PlannerTarget,
  TILE_AIR,
} from '../traits'
import type { GemColor, GemSize } from '../atlas-regions'
import { TILE_PX } from '../constants'
import { createRng } from '../lib/rng'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { clearAllChunkEntities } from './collapse'
import { setHazardSafeMinRow } from './hazard'
import { playSound } from './sounds'

/**
 * Death sequence:
 *   idle       — driller is alive, no death in progress
 *   settle     — driller just got squished. Body is rendered as a
 *                corpse on the death cell; camera continues to track
 *                it. Lasts SETTLE_TICKS so the player sees WHERE they
 *                died and the world acknowledges the failure before
 *                the spectacle starts.
 *   scatter    — corpse despawns, gems scatter, brief beat
 *   ghost      — sine-wave ghost beam rises, clearing the column
 *   respawn    — new driller spawned at the death cell
 */
let deathPhase: 'idle' | 'settle' | 'scatter' | 'ghost' | 'respawn' = 'idle'
let deathTick = 0
let deathCol = 9
let deathRow = 0
let ghostRow = 0
const SETTLE_TICKS = 36 // ~600ms — body lies there before the ghost

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
  startRow: 0,
  fullScaleRow: 0,
  startTick: 0,
  elapsedTicks: 0,
}

/** Reset module-owned death/ghost state at a full run boundary. */
export function resetDeathSystem(): void {
  deathPhase = 'idle'
  deathTick = 0
  deathCol = 9
  deathRow = 0
  ghostRow = 0
  ghostBeam.active = false
  ghostBeam.col = 9
  ghostBeam.row = 0
  ghostBeam.startRow = 0
  ghostBeam.fullScaleRow = 0
  ghostBeam.startTick = 0
  ghostBeam.elapsedTicks = 0
}

export function deathSystem(world: World): void {
  const gs = world.get(GameState)
  if (!gs) return

  if (gs.runState !== 'dying' && deathPhase === 'idle') return

  if (deathPhase === 'idle' && gs.runState === 'dying') {
    playSound(world, 'crush')
    // Driller just got squished. KEEP the entity alive (in 'trip'
    // animation) so the camera continues to track the body lying on
    // the earth where it died. Don't scatter gems yet, don't spawn
    // the ghost yet — the player needs a moment to read "yep, I
    // died here". After SETTLE_TICKS the corpse is removed and
    // scatter / ghost run.
    const drillerEntity = world.queryFirst(Driller)
    if (drillerEntity) {
      const d = drillerEntity.get(Driller)!
      deathCol = d.col
      deathRow = d.row
      drillerEntity.set(Animation, { state: 'trip' })
      // Pin destination to current cell so the corpse doesn't try to
      // move under any leftover planner target.
      drillerEntity.set(Driller, { destCol: d.col, destRow: d.row })
      drillerEntity.set(PlannerTarget, { col: d.col, row: d.row, reservedAtTick: gs.tick })
    }
    // Wipe in-flight chunk entities. The chunk that just killed the
    // driller (or any other sag/fall in-progress) MUST NOT survive
    // into respawn — otherwise it lands again on top of the new
    // driller exactly where we put them.
    clearAllChunkEntities(world)
    deathPhase = 'settle'
    deathTick = gs.tick
    ghostRow = deathRow
    return
  }

  if (deathPhase === 'settle') {
    // Corpse lies on the earth; camera tracks it. After SETTLE_TICKS
    // we transition to scatter (which despawns the corpse + spawns
    // scatter gems).
    if (gs.tick - deathTick >= SETTLE_TICKS) {
      const drillerEntity = world.queryFirst(Driller)
      if (drillerEntity) {
        scatterGems(world, gs.gems, deathCol, deathRow, gs.tick)
        drillerEntity.destroy()
      }
      deathPhase = 'scatter'
      deathTick = gs.tick
    }
    return
  }

  if (deathPhase === 'scatter') {
    if (gs.tick - deathTick >= 12) {
      deathPhase = 'ghost'
      playSound(world, 'ghostWhoosh')
      deathTick = gs.tick
      ghostRow = deathRow
      ghostBeam.active = true
      ghostBeam.col = deathCol
      ghostBeam.row = ghostRow
      ghostBeam.startRow = ghostRow
      // Reach full size one row before the beam exits so the 2× silhouette
      // is actually visible for a frame instead of disappearing on the same
      // simulation tick that crosses the viewport/ceiling boundary.
      const cam = world.get(Camera)
      const cameraTopRow = cam ? Math.floor(cam.y / TILE_PX) - 2 : -10
      const exitRow = Math.min(ghostRow, Math.max(0, cameraTopRow, ghostRow - GHOST_MAX_ROWS))
      ghostBeam.fullScaleRow = Math.min(ghostRow, exitRow + 1)
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
      // Final pass: instant-clear all remaining rows up to row 0 in
      // the column. The user shouldn't be hit by something from the
      // "ancient past" falling back down through the cleared chute
      // after respawn — the entire column above the death cell is
      // sterilised before the driller comes back.
      for (let r = ghostRow - 1; r >= 0; r--) {
        clearGhostRow(world, deathCol, r)
      }
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
      playSound(world, 'respawn')
    } else {
      // Hero / infinite mode — always respawn at the death cell.
      respawnDrillerAtDeath(world)
      world.set(GameState, { runState: 'playing' })
      playSound(world, 'respawn')
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
    const dist = 1 + rng.next() * (SCATTER_RADIUS - 1)
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
      })
    )
  }
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
const POST_RESPAWN_ROCK_COOLDOWN_ROWS = 4

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
    PetEvents()
  )
  setHazardSafeMinRow(deathRow + POST_RESPAWN_ROCK_COOLDOWN_ROWS)
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
