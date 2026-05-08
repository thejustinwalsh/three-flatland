import type { World } from 'koota'
import {
  type ChunkCell,
  Driller,
  FallingChunk,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_SAGGING,
  GameState,
  Grid,
  SaggingChunk,
  TILE_AIR,
} from '../traits'
import { MAX_CHUNK_HEIGHT, SAG_DURATION_TICKS, TILE_PX } from '../constants'
import { detectChunks, isSupported, type SoilChunk } from '../lib/chunk-detect'
import { markCellAndNeighborsDirty } from './autotile-pass'

/**
 * Pass A: scan the grid for SOIL components that have lost support and
 * spawn SaggingChunk entities for them. Cells already part of an active
 * sag/fall are skipped via FLAG_SAGGING / FLAG_FALLING bits.
 */
export function detectAndSag(world: World): void {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return
  const { cols, rows, tiles, flags } = grid

  const allChunks = detectChunks(tiles, cols, rows)
  for (const ch of allChunks) {
    if (chunkHasFlag(ch, flags, FLAG_SAGGING | FLAG_FALLING)) continue
    if (isSupported(ch, tiles, cols, rows)) continue

    // Apply MAX_CHUNK_HEIGHT cap — only the bottom N rows enter the sag body.
    const chosen = filterBottomRows(ch, cols, MAX_CHUNK_HEIGHT)
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
}

function chunkHasFlag(chunk: SoilChunk, flags: Uint8Array, mask: number): boolean {
  for (const idx of chunk.cells) {
    const f = flags[idx]
    if (f !== undefined && (f & mask) !== 0) return true
  }
  return false
}

function filterBottomRows(chunk: SoilChunk, _cols: number, maxHeight: number): number[] {
  const minRowKept = chunk.maxRow - maxHeight + 1
  return chunk.cells.filter((idx) => Math.floor(idx / _cols) >= minRowKept)
}

/**
 * Pass B: advance SaggingChunk timers. Bracing pauses the timer; on
 * expiry the chunk releases as a FallingChunk (cells are removed from
 * the grid and replaced with AIR; the falling body owns the cells now).
 */
export function tickSagging(world: World): void {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return
  const { cols, tiles, flags } = grid
  const tick = gs.tick

  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)!
    if (tick < sag.bracedUntilTick) return
    const elapsed = tick - sag.startTick
    if (elapsed < sag.durationTicks) return

    // Release: convert cells to AIR in grid; mark dirty; spawn FallingChunk.
    for (const cell of sag.cells) {
      const idx = cell.row * cols + cell.col
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx]! & ~FLAG_SAGGING) | FLAG_AUTOTILE_DIRTY
      markCellAndNeighborsDirty(world, cell.col, cell.row)
    }

    // The falling body's pixel origin is the bounding-box top-left.
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

/** Gravity per frame for falling bodies (pixels / frame, 60Hz). */
const GRAVITY_PX = 0.6
const TERMINAL_PX = 24

/**
 * Pass C: advance FallingChunk bodies under gravity; when the bottom of
 * the body touches anchored geometry, snap to the grid and despawn.
 */
export function tickFalling(world: World): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, rows, tiles, flags, frameIndex } = grid

  world.query(FallingChunk).forEach((entity) => {
    const fall = entity.get(FallingChunk)!

    // Integrate
    fall.vy = Math.min(fall.vy + GRAVITY_PX, TERMINAL_PX)
    fall.py += fall.vy

    // Translate to grid coordinates (top-left of body in cells, may be fractional).
    const baseCellRow = fall.py / TILE_PX
    const baseCellCol = fall.px / TILE_PX

    // Find the deepest row the body would occupy.
    let maxBodyRow = -Infinity
    for (const c of fall.cells) {
      const r = baseCellRow + c.row
      if (r > maxBodyRow) maxBodyRow = r
    }

    const nextRowFloor = Math.floor(maxBodyRow) + 1

    // Collision check: is any cell directly below the body solid?
    let landed = false
    for (const c of fall.cells) {
      const cellCol = Math.floor(baseCellCol) + c.col
      const cellRow = Math.floor(baseCellRow) + c.row + 1
      if (cellRow >= rows || cellCol < 0 || cellCol >= cols) continue
      // Skip cells inside the same body (the cell directly below this one
      // might be another body cell — only outside cells count).
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

    // Also land if we'd run off the bottom of the world.
    if (nextRowFloor >= rows) landed = true

    if (landed) {
      landAndReattach(world, entity, fall, cols, tiles, flags, frameIndex)
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
  entity: ReturnType<World['spawn']>,
  fall: FallingChunkData,
  cols: number,
  tiles: Uint8Array,
  flags: Uint8Array,
  _frameIndex: Uint8Array,
): void {
  const baseCellRow = Math.round(fall.py / TILE_PX)
  const baseCellCol = Math.round(fall.px / TILE_PX)

  // Crush check: did the body land on the driller's cell?
  const driller = world.queryFirst(Driller)
  let crushed = false
  if (driller) {
    const d = driller.get(Driller)!
    for (const c of fall.cells) {
      const r = baseCellRow + c.row
      const cc = baseCellCol + c.col
      if (r === d.row && cc === d.col) {
        crushed = true
        break
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

  // Crush handling: signal death system. We tag the GameState runState
  // here; the death system in Phase 10 picks it up and runs the full
  // ghost-chute / scatter / respawn sequence.
  if (crushed) {
    const gs = world.get(GameState)
    if (gs) gs.runState = 'dying'
  }
}

/** Run the full collapse pipeline once per tick. */
export function collapseTick(world: World): void {
  detectAndSag(world)
  tickSagging(world)
  tickFalling(world)
}
