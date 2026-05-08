import type { Entity, World } from 'koota'
import {
  type ChunkCell,
  Driller,
  FallingChunk,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_PRECARIOUS,
  FLAG_SAG_RECHECK,
  FLAG_SAGGING,
  FLAG_SHAKING,
  GameState,
  Grid,
  PlannerTarget,
  SaggingChunk,
  TILE_AIR,
} from '../traits'
import { MAX_CHUNK_HEIGHT, MAX_REACH, SAG_DURATION_TICKS, TILE_PX } from '../constants'

/**
 * How far above and below the driller's row we run the chunk-detect
 * scan each tick. Anything outside is either un-streamed (still AIR)
 * or far enough behind that any sag there would never affect the
 * play area before the world rotates anyway.
 */
const SCAN_WINDOW_ROWS_ABOVE = 96  // ~3 chunks of history
const SCAN_WINDOW_ROWS_BELOW = 192 // ~6 chunks streamed-ahead
import { detectChunks, type SoilChunk, unstableCells } from '../lib/chunk-detect'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { isFreeFall } from '../biomes'

/**
 * Connectivity-based sag detection.
 *
 * Scans 4-connected SOIL components; any chunk with zero anchor connections
 * (stone / rock / fixture / world-edge) becomes a SaggingChunk.
 *
 * The cantilever variant (distance-from-anchor) was tried and reverted: in
 * soil-dominated biomes (especially topsoil with no stones) it cascaded
 * the entire field. Pressure now comes from falling-rock hazards
 * (`hazard.ts`) and explosives (`explosive.ts`) instead.
 */
export function detectAndSag(world: World): void {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return
  const { cols, rows, tiles, flags } = grid

  // Bound chunk detection to the visible-history window around the
  // driller. Cleared rows far above (after world rotation) or far below
  // (un-streamed) contain only AIR and would just churn the flood-fill
  // for nothing.
  const driller = world.queryFirst(Driller)
  const dRow = driller ? driller.get(Driller)!.row : 0
  const winTop = Math.max(0, dRow - SCAN_WINDOW_ROWS_ABOVE)
  const winBot = Math.min(rows, dRow + SCAN_WINDOW_ROWS_BELOW)

  // Cantilever sag detection — gated by FLAG_SAG_RECHECK so we only
  // re-evaluate chunks the player has actually disturbed this tick.
  // Without the gate, fresh worldgen-loaded chunks would immediately
  // sag for the natural overhangs in their cellular-automata caves,
  // and stable chunks across the loaded world would re-trigger every
  // frame.
  const allChunks = detectChunks(tiles, cols, rows, winTop, winBot)
  for (const ch of allChunks) {
    if (chunkHasFlag(ch, flags, FLAG_SAGGING | FLAG_FALLING)) continue
    if (!chunkHasFlag(ch, flags, FLAG_SAG_RECHECK)) continue

    // Compute unstable cells once we know this chunk needs it.
    const unstable = unstableCells(tiles, cols, rows, MAX_REACH)
    const unstableIdxs = ch.cells.filter((idx) => unstable.has(idx))
    // Clear SAG_RECHECK on this chunk's cells so it doesn't re-fire
    // every tick — the gate has done its job for this disturbance.
    for (const idx of ch.cells) flags[idx]! &= ~FLAG_SAG_RECHECK
    if (unstableIdxs.length === 0) continue

    const chosen = filterBottomRows(
      { ...ch, cells: unstableIdxs, maxRow: Math.max(...unstableIdxs.map((i) => Math.floor(i / cols))) },
      cols,
      MAX_CHUNK_HEIGHT,
    )
    if (chosen.length === 0) continue

    // Guard: would these cells actually fall? At least one cell in
    // the candidate sag must have AIR directly below (and that AIR
    // can't itself be another candidate cell — interior cells don't
    // help). Without this guard we'd spawn sag entities on chunks
    // that are cantilever-unstable but already resting on bedrock —
    // they'd shake, "release", land 0px away, and look like a stuck
    // shake to the player.
    const chosenSet = new Set(chosen)
    let willFall = false
    for (const idx of chosen) {
      const c = idx % cols
      const r = Math.floor(idx / cols)
      const belowIdx = (r + 1) * cols + c
      if (chosenSet.has(belowIdx)) continue // interior, not a bottom edge
      if (r + 1 >= rows) continue // world bottom blocks
      if (tiles[belowIdx] === TILE_AIR) {
        willFall = true
        break
      }
    }
    if (!willFall) continue

    for (const idx of chosen) flags[idx] = (flags[idx] ?? 0) | FLAG_SAGGING
    world.spawn(
      SaggingChunk({
        cells: chosen.map((idx) => ({
          col: idx % cols,
          row: Math.floor(idx / cols),
          tile: tiles[idx]!,
        })),
        startTick: gs.tick,
        durationTicks: SAG_DURATION_TICKS,
        bracedUntilTick: 0,
      }),
    )
  }

  // Second pass: PRECARIOUS prediction — "if the driller drills its
  // current planner target, what would become unsupported?". Re-runs
  // chunk detection on a temp tile array with the target cell punched
  // to AIR and flags any newly-unsupported chunk's cells with
  // FLAG_PRECARIOUS so the renderer can flash a "danger ahead" tint.
  // Always cleared first — the warning is per-tick and per-target.
  // Bound the clear sweep to the same scan window as the detection.
  const clearStart = winTop * cols
  const clearEnd = Math.min(flags.length, winBot * cols)
  for (let i = clearStart; i < clearEnd; i++) {
    if ((flags[i]! & FLAG_PRECARIOUS) !== 0) flags[i]! &= ~FLAG_PRECARIOUS
  }
  if (!driller) return
  const d = driller.get(Driller)!
  const target = driller.get(PlannerTarget)
  if (!target) return
  // Predict only if the target cell currently holds something
  // diggable (SOIL/ROCK). Driller's already-AIR moves don't change
  // support topology.
  const tIdx = target.row * cols + target.col
  const tTile = tiles[tIdx]
  if (tTile === undefined || tTile === TILE_AIR) return
  if (target.col === d.col && target.row === d.row) return

  const sim = new Uint8Array(tiles)
  sim[tIdx] = TILE_AIR
  const simUnstable = unstableCells(sim, cols, rows, MAX_REACH)
  const simChunks = detectChunks(sim, cols, rows, winTop, winBot)
  for (const ch of simChunks) {
    if (chunkHasFlag(ch, flags, FLAG_SAGGING | FLAG_FALLING)) continue
    let anyUnstable = false
    for (const idx of ch.cells) {
      if (simUnstable.has(idx)) {
        flags[idx] = (flags[idx] ?? 0) | FLAG_PRECARIOUS
        anyUnstable = true
      }
    }
    void anyUnstable
  }
}

function chunkHasFlag(chunk: SoilChunk, flags: Uint8Array, mask: number): boolean {
  for (const idx of chunk.cells) {
    const f = flags[idx]
    if (f !== undefined && (f & mask) !== 0) return true
  }
  return false
}

function filterBottomRows(chunk: SoilChunk, cols: number, maxHeight: number): number[] {
  const minRowKept = chunk.maxRow - maxHeight + 1
  return chunk.cells.filter((idx) => Math.floor(idx / cols) >= minRowKept)
}

/**
 * Final-window ticks during which a sagging chunk gets FLAG_SHAKING
 * set on its cells — the lock-in rumble right before release. Tuned
 * to roughly match the avalanche shake duration so soil and rock
 * telegraph at the same cadence.
 */
const SAG_SHAKE_LEAD_TICKS = 18

export function tickSagging(world: World): void {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return
  const { cols, tiles, flags } = grid
  const tick = gs.tick

  // In the void: sag is inert. Despawn any in-progress wobbles and
  // strip the SAGGING / SHAKING flags so the cells stop signalling.
  const drillerVoid = world.queryFirst(Driller)
  if (drillerVoid && isFreeFall(drillerVoid.get(Driller)!.row)) {
    world.query(SaggingChunk).forEach((entity) => {
      const sag = entity.get(SaggingChunk)!
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        flags[idx] = (flags[idx] ?? 0) & ~FLAG_SAGGING & ~FLAG_SHAKING
      }
      entity.destroy()
    })
    return
  }

  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)!
    if (tick < sag.bracedUntilTick) return
    const elapsed = tick - sag.startTick

    // Final-window shake: in the last SAG_SHAKE_LEAD_TICKS before
    // release, mark cells as SHAKING so the renderer rumbles them.
    // Sag chunks that get braced or never reach this window stay
    // mid-wobble (color tint) without the rumble — only chunks that
    // are ABOUT to drop get the shake telegraph.
    if (elapsed >= sag.durationTicks - SAG_SHAKE_LEAD_TICKS) {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        flags[idx] = (flags[idx] ?? 0) | FLAG_SHAKING
      }
    }
    if (elapsed < sag.durationTicks) return

    for (const cell of sag.cells) {
      const idx = cell.row * cols + cell.col
      tiles[idx] = TILE_AIR
      flags[idx] = ((flags[idx]! & ~FLAG_SAGGING & ~FLAG_SHAKING) | FLAG_AUTOTILE_DIRTY) as number
      markCellAndNeighborsDirty(world, cell.col, cell.row)
    }

    let minR = Infinity
    let minC = Infinity
    for (const cell of sag.cells) {
      if (cell.row < minR) minR = cell.row
      if (cell.col < minC) minC = cell.col
    }
    const px = minC * TILE_PX
    const py = minR * TILE_PX

    world.spawn(
      FallingChunk({
        cells: sag.cells.map((c) => ({
          col: c.col - minC,
          row: c.row - minR,
          tile: c.tile,
        })),
        px,
        py,
        vy: 0,
      }),
    )
    entity.destroy()
  })
}

const GRAVITY_PX = 0.6
const TERMINAL_PX = 24

export function tickFalling(world: World): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags } = grid

  // In the void: in-flight chunks are inert. Despawn so they don't
  // chase the driller into the gem shower.
  const drillerVoid = world.queryFirst(Driller)
  if (drillerVoid && isFreeFall(drillerVoid.get(Driller)!.row)) {
    world.query(FallingChunk).forEach((e) => e.destroy())
    return
  }

  world.query(FallingChunk).forEach((entity) => {
    const fall = entity.get(FallingChunk)!

    const newVy = Math.min(fall.vy + GRAVITY_PX, TERMINAL_PX)
    const newPy = fall.py + newVy

    const baseCellRow = newPy / TILE_PX
    const baseCellCol = fall.px / TILE_PX

    let landed = false
    for (const c of fall.cells) {
      const cellCol = Math.floor(baseCellCol) + c.col
      const cellRow = Math.floor(baseCellRow) + c.row + 1
      if (cellRow >= rows || cellCol < 0 || cellCol >= cols) continue
      const isInBody = fall.cells.some(
        (other) => other.col === c.col && other.row === c.row + 1,
      )
      if (isInBody) continue
      const idx = cellRow * cols + cellCol
      const t = tiles[idx]!
      if (t !== TILE_AIR) {
        landed = true
        break
      }
    }

    if (Math.floor(baseCellRow) + 1 >= rows) landed = true

    if (landed) {
      landAndReattach(world, entity, { ...fall, py: newPy, vy: newVy }, cols, tiles, flags)
    } else {
      entity.set(FallingChunk, { py: newPy, vy: newVy })
    }
  })
}

interface FallingChunkData {
  cells: ChunkCell[]
  px: number
  py: number
  vy: number
}

function landAndReattach(
  world: World,
  entity: Entity,
  fall: FallingChunkData,
  cols: number,
  tiles: Uint8Array,
  flags: Uint8Array,
): void {
  const baseCellRow = Math.round(fall.py / TILE_PX)
  const baseCellCol = Math.round(fall.px / TILE_PX)

  // Squish check. A falling chunk only KILLS if the driller is in a
  // cell the chunk lands on AND the driller is on ground (can't
  // escape further down). A driller mid-fall in the same column is
  // a near miss — the chunk and driller fall together; both end up on
  // the same surface but the chunk doesn't pin them.
  const driller = world.queryFirst(Driller)
  let crushed = false
  if (driller) {
    const d = driller.get(Driller)!
    const supportRow = d.row + 1
    const supportIdx = supportRow * cols + d.col
    const drillerOnGround =
      supportRow * cols >= tiles.length ||
      (tiles[supportIdx] !== undefined && tiles[supportIdx] !== TILE_AIR)
    if (drillerOnGround) {
      for (const c of fall.cells) {
        const r = baseCellRow + c.row
        const cc = baseCellCol + c.col
        if (r === d.row && cc === d.col) {
          crushed = true
          break
        }
      }
    }
  }

  // Stamp cells back into the grid.
  for (const c of fall.cells) {
    const r = baseCellRow + c.row
    const cc = baseCellCol + c.col
    if (r < 0 || cc < 0 || cc >= cols) continue
    const idx = r * cols + cc
    if (idx >= tiles.length) continue
    tiles[idx] = c.tile
    flags[idx] = ((flags[idx]! & ~FLAG_FALLING) | FLAG_AUTOTILE_DIRTY) as number
    markCellAndNeighborsDirty(world, cc, r)
  }

  entity.destroy()

  if (crushed) {
    world.set(GameState, { runState: 'dying' })
  }
}

export function collapseTick(world: World): void {
  detectAndSag(world)
  tickSagging(world)
  tickFalling(world)
}
