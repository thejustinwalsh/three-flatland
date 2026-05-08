import type { Entity, World } from 'koota'
import {
  type ChunkCell,
  Driller,
  FallingChunk,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_JUST_LANDED,
  FLAG_PRECARIOUS,
  FLAG_SAG_RECHECK,
  FLAG_SAGGING,
  FLAG_SHAKING,
  GameState,
  Grid,
  SaggingChunk,
  TILE_AIR,
} from '../traits'
import {
  MAX_CHUNK_HEIGHT,
  MAX_REACH,
  SAG_DURATION_TICKS,
  SAG_PRECARIOUS_TICKS,
  SAG_SAGGING_TICKS,
  TILE_PX,
} from '../constants'

/**
 * How far above and below the driller's row we run the chunk-detect
 * scan each tick. ABOVE is tight: anything more than a handful of
 * rows above the driller is "out of play" and the player's drilling
 * shouldn't be re-triggering sag detection there. BELOW is wider so
 * the streamer's just-loaded chunks get evaluated for any natural
 * cantilevers worth telegraphing as the driller approaches.
 *
 * The above value is intentionally a hair larger than
 * PLAYFIELD_TOP_OFFSET_ROWS (8): cantilever cells reach up to
 * MAX_REACH=10 from their anchor, so we want enough margin that a
 * chunk's anchor at row=dRow-PLAYFIELD_TOP-1 is still seen. Anything
 * further up is rendered as history but not load-bearing for the
 * cantilever check.
 */
const SCAN_WINDOW_ROWS_ABOVE = 16
const SCAN_WINDOW_ROWS_BELOW = 192 // ~6 chunks streamed-ahead
import { detectChunks, type SoilChunk, unstableCells } from '../lib/chunk-detect'
import {
  markCellAndNeighborsDirty,
  markCellAndNeighborsDirtyExcept,
} from './autotile-pass'
import { isFreeFall } from '../biomes'

/**
 * Game-side counters exposed to integration probes via
 * `window.__drillerStats`. The shake-codex tests read these to
 * distinguish "0-displacement landing actually happened in the
 * sim" from "a cell happened to be re-solidified by a sibling
 * chunk landing on top". Probes that scrape grid state can't
 * reliably tell the two apart.
 *
 * Counters are monotonically increasing for the life of the page.
 * Tests sample (after, before) deltas around their observation
 * window to get an accurate count.
 */
interface DrillerStats {
  /** A FallingChunk landed at its release row (rule 1 violation;
   *  the restore branch fired). Should be 0 in healthy play. */
  zeroDisplacementRestores: number
  /** A FallingChunk landed at row > release row (the normal
   *  case). For sanity-checking that the suite is exercising the
   *  feature at all. */
  properLandings: number
}

declare global {
  interface Window {
    __drillerStats?: DrillerStats
  }
}

function bumpStat(key: keyof DrillerStats): void {
  if (typeof window === 'undefined') return
  if (!window.__drillerStats) {
    window.__drillerStats = { zeroDisplacementRestores: 0, properLandings: 0 }
  }
  window.__drillerStats[key]++
}

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

  // PERF — Phase 0: short-circuit the entire BFS if no cells in the
  // window have FLAG_SAG_RECHECK set. The flag is only written by
  // markCellAndNeighborsDirty / markCellAndNeighborsDirtyExcept, both
  // called on player-driven mutations (drill, hazard land, explosion,
  // sag release, fall land). On quiet ticks (no recent disturbance)
  // we skip detectChunks + unstableCells entirely.
  let anyRecheck = false
  {
    const startIdx = winTop * cols
    const endIdx = Math.min(flags.length, winBot * cols)
    for (let i = startIdx; i < endIdx; i++) {
      if ((flags[i]! & FLAG_SAG_RECHECK) !== 0) {
        anyRecheck = true
        break
      }
    }
  }
  if (!anyRecheck) {
    // Still need to clear JUST_LANDED for cells in the window so
    // the grace period expires deterministically. (Cheap: most ticks
    // there's nothing to clear.)
    clearJustLandedInWindow(flags, winTop, winBot, cols)
    return
  }

  // Cantilever sag detection — gated by FLAG_SAG_RECHECK so we only
  // re-evaluate chunks the player has actually disturbed this tick.
  // PERF — Phase 0: hoist unstableCells out of the per-chunk loop.
  // It's a flood-fill BFS over the entire window (~3.7k cells); doing
  // it per-chunk multiplied that by N. Single tick-cached query now.
  const allChunks = detectChunks(tiles, cols, rows, winTop, winBot)
  const unstable = unstableCells(tiles, cols, rows, MAX_REACH)
  for (const ch of allChunks) {
    if (chunkHasFlag(ch, flags, FLAG_SAGGING | FLAG_FALLING)) continue
    if (!chunkHasFlag(ch, flags, FLAG_SAG_RECHECK)) continue

    // JUST_LANDED grace: cells stamped by a FallingChunk this tick
    // are excluded from the unstable set for one detect pass. They
    // still drive cascades (the impact tagged SAG_RECHECK on
    // surrounding terrain), but the just-settled cells themselves
    // aren't immediately re-sagged. They become full participants on
    // the NEXT tick, with the standard story.
    const unstableIdxs = ch.cells.filter(
      (idx) => unstable.has(idx) && (flags[idx]! & FLAG_JUST_LANDED) === 0,
    )
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

  clearJustLandedInWindow(flags, winTop, winBot, cols)
}

/**
 * Per-tick JUST_LANDED clear. Phase 0 follow-up: the dirty cells
 * are explicitly tracked in `recentlyLandedIdxs` so this becomes
 * an O(1)-per-cell loop over a tiny list (typically 0–30 entries)
 * rather than an O(window) scan over ~3.7k cells. Falls back to a
 * windowed scan only if the dirty list is unavailable.
 */
function clearJustLandedInWindow(
  flags: Uint8Array,
  winTop: number,
  winBot: number,
  cols: number,
): void {
  if (recentlyLandedIdxs.length > 0) {
    for (const idx of recentlyLandedIdxs) {
      if (idx >= 0 && idx < flags.length) flags[idx]! &= ~FLAG_JUST_LANDED
    }
    recentlyLandedIdxs.length = 0
    return
  }
  const jlClearStart = winTop * cols
  const jlClearEnd = Math.min(flags.length, winBot * cols)
  for (let i = jlClearStart; i < jlClearEnd; i++) {
    if ((flags[i]! & FLAG_JUST_LANDED) !== 0) flags[i]! &= ~FLAG_JUST_LANDED
  }
}

/**
 * Module-level dirty list of cells that were stamped JUST_LANDED
 * this tick. Pushed by `landAndReattach`, drained by `detectAndSag`
 * via `clearJustLandedInWindow`. Avoids a per-tick window-wide scan.
 */
const recentlyLandedIdxs: number[] = []

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
 * Returns true iff at least one cell on the sag chunk's bottom edge
 * still has AIR directly below it RIGHT NOW. The sag's spawn-time
 * willFall guard can go stale: another chunk lands in the gap during
 * the 700ms wobble, sealing the path. We re-check before shaking and
 * before releasing — the rule is "if it shakes, it WILL fall by ≥1
 * tile."
 */
/**
 * Returns true iff EVERY bottom-edge cell of the sag chunk has AIR
 * directly below it RIGHT NOW.
 *
 * The earlier "at least one bottom edge has AIR" check passed in
 * cases where the chunk would still 0-displacement land: 5 cells
 * across, 4 with AIR below, 1 with SOIL below → the FallingChunk's
 * landing detection fires on tick 1 (the one SOIL cell triggers
 * `landed=true`) and the chunk lands at its release row. Shake
 * with no fall — rule 1 violation. Strict semantics: ALL bottom
 * edges must be clear or the chunk is too constrained to displace.
 */
function sagAllBottomEdgesAir(
  cells: ReadonlyArray<{ col: number; row: number }>,
  cols: number,
  rows: number,
  tiles: Uint8Array,
): boolean {
  const occupied = new Set<number>()
  for (const c of cells) occupied.add(c.row * cols + c.col)
  for (const c of cells) {
    if (c.row + 1 >= rows) return false // world-floor blocks
    const belowIdx = (c.row + 1) * cols + c.col
    if (occupied.has(belowIdx)) continue // interior, doesn't count
    if (tiles[belowIdx] !== TILE_AIR) return false
  }
  return true
}

/**
 * Returns true iff some other in-flight FallingChunk is positioned
 * such that it could land in our chunk's release area BEFORE our
 * own first physics tick — i.e., there's a sibling above us in any
 * of our columns at or above our top row. If so, we defer entering
 * SHAKE: committing now risks a 0-displacement landing once that
 * sibling's cells become solid in the row directly below us.
 *
 * Used at the PRECARIOUS→SAGGING and SAGGING→SHAKING phase boundaries.
 * A deferred sag stays in its current phase for one tick and re-checks
 * next tick. By then either the conflicting chunk has landed (path
 * either becomes truly clear, in which case we proceed; or becomes
 * blocked, in which case we cancel) or it has moved on.
 */
/**
 * Per-tick cache: for each grid column, the LOWEST current-row of any
 * in-flight FallingChunk in that column. `Infinity` if no chunk is in
 * that column. Used by the SAGGING→SHAKING commit gate to detect a
 * sibling about to seal our path. Built once at the top of
 * `tickSagging` so the boundary check is an O(1) array read instead
 * of a per-call query+nested-loop.
 */
const inFlightTopRowByCol = new Int32Array(64) // grown lazily; PLAY_COLS=18 fits

function rebuildInFlightTopRowByCol(world: World, cols: number): void {
  for (let i = 0; i < cols; i++) inFlightTopRowByCol[i] = 0x7fffffff
  world.query(FallingChunk).forEach((entity) => {
    const fall = entity.get(FallingChunk)
    if (!fall) return
    const baseRow = Math.floor(fall.py / TILE_PX)
    const baseCol = Math.floor(fall.px / TILE_PX)
    for (const c of fall.cells) {
      const fc = baseCol + c.col
      const fr = baseRow + c.row
      if (fc < 0 || fc >= cols) continue
      if (fr < inFlightTopRowByCol[fc]!) inFlightTopRowByCol[fc] = fr
    }
  })
}

function inFlightConflictAbove(
  cells: ReadonlyArray<{ col: number; row: number }>,
): boolean {
  let topRow = Infinity
  for (const c of cells) {
    if (c.row < topRow) topRow = c.row
  }
  for (const c of cells) {
    const inFlightTop = inFlightTopRowByCol[c.col]
    if (inFlightTop !== undefined && inFlightTop <= topRow) return true
  }
  return false
}

/**
 * Despawn every SaggingChunk and FallingChunk entity in the world,
 * clearing FLAG_SAGGING / FLAG_SHAKING / FLAG_FALLING from any cells
 * those entities reference. Use at lifecycle boundaries that
 * invalidate the entities' assumptions:
 *   - death entry (so a chunk that just killed the driller doesn't
 *     keep falling onto the respawn cell)
 *   - chunk unload (so a sag/fall entity tied to unloaded rows doesn't
 *     re-stamp stale tiles into now-AIR territory)
 */
export function clearAllChunkEntities(world: World): void {
  const grid = world.get(Grid)
  if (!grid) return
  const { cols, flags } = grid
  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)
    if (sag) {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        if (idx >= 0 && idx < flags.length) {
          flags[idx]! &= ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
        }
      }
    }
    entity.destroy()
  })
  world.query(FallingChunk).forEach((entity) => entity.destroy())
}

/**
 * Despawn SaggingChunk entities whose cells fall in [rowStart, rowEnd).
 * Called by `unloadChunk`. Without this, a sag entity tagged with
 * absolute row indices in an unloaded chunk keeps living: the unloader
 * resets `tiles[i] = TILE_AIR` and `flags[i] = AUTOTILE_DIRTY`, but
 * the entity persists with stale references. On its next tick it
 * spawns a FallingChunk into formerly-loaded territory, which
 * re-stamps SOIL into a chunk that should be unloaded.
 */
export function clearChunkEntitiesInRowRange(
  world: World,
  rowStart: number,
  rowEnd: number,
): void {
  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)
    if (!sag) return
    for (const cell of sag.cells) {
      if (cell.row >= rowStart && cell.row < rowEnd) {
        entity.destroy()
        return
      }
    }
  })
  world.query(FallingChunk).forEach((entity) => {
    const fall = entity.get(FallingChunk)
    if (!fall) return
    const baseRow = fall.py / TILE_PX
    for (const c of fall.cells) {
      const r = baseRow + c.row
      if (r >= rowStart && r < rowEnd) {
        entity.destroy()
        return
      }
    }
  })
}

export function tickSagging(world: World): void {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return
  const { cols, rows, tiles, flags } = grid
  const tick = gs.tick

  // In the void: sag is inert. Despawn any in-progress wobbles and
  // strip the SAGGING / SHAKING flags so the cells stop signalling.
  const drillerVoid = world.queryFirst(Driller)
  if (drillerVoid && isFreeFall(drillerVoid.get(Driller)!.row)) {
    world.query(SaggingChunk).forEach((entity) => {
      const sag = entity.get(SaggingChunk)!
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        flags[idx] = (flags[idx] ?? 0) & ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
      }
      entity.destroy()
    })
    return
  }

  // Phase 0 perf: build the per-column in-flight FallingChunk lookup
  // once. Used by the SAGGING→SHAKING commit gate below.
  rebuildInFlightTopRowByCol(world, cols)

  // Phase 0 correctness: cull SaggingChunk entities whose cells have
  // drifted well above the playfield top — they can no longer affect
  // the player and (when their elapsed-tick crosses the SHAKE phase
  // boundary) they paint FLAG_SHAKING on cells that are far above
  // the camera but still in the rendered out-of-play history. The
  // offscreen-shake integration test catches this.
  const dRow = drillerVoid ? drillerVoid.get(Driller)!.row : 0
  const cullAboveRow = dRow - SCAN_WINDOW_ROWS_ABOVE
  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)
    if (!sag) return
    let maxRow = -Infinity
    for (const c of sag.cells) if (c.row > maxRow) maxRow = c.row
    if (maxRow < cullAboveRow) {
      for (const c of sag.cells) {
        const idx = c.row * cols + c.col
        if (idx >= 0 && idx < flags.length) {
          flags[idx]! &= ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
        }
      }
      entity.destroy()
    }
  })

  world.query(SaggingChunk).forEach((entity) => {
    const sag = entity.get(SaggingChunk)!
    if (tick < sag.bracedUntilTick) return
    const elapsed = tick - sag.startTick

    // Tile-class invariant: every cell in this sag must still hold
    // the tile it reserved at spawn. If any cell got drilled,
    // ghost-cleared, or unloaded under our feet, the chunk is stale.
    // Without this guard the entity keeps ticking against AIR cells,
    // re-stamps SOIL via FallingChunk, and produces phantom shakes /
    // re-grown chunks far from where the player is acting.
    let stale = false
    for (const cell of sag.cells) {
      const idx = cell.row * cols + cell.col
      if (idx < 0 || idx >= tiles.length || tiles[idx] !== cell.tile) {
        stale = true
        break
      }
    }
    if (stale) {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        if (idx >= 0 && idx < flags.length) {
          flags[idx]! &= ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
        }
      }
      entity.destroy()
      return
    }

    // 3-phase state machine driven by elapsed-tick arithmetic. One
    // entity, three visual tiers — each well above the human change-
    // detection threshold (~300ms) so the player reads them as
    // distinct beats, not a blur.
    //
    //   [0, SAG_PRECARIOUS_TICKS)              → PRECARIOUS only
    //   [SAG_PRECARIOUS_TICKS, +SAG_SAGGING)   → SAGGING only
    //   […, durationTicks)                     → SAGGING + SHAKING
    //   elapsed >= durationTicks               → release (fall)
    const PHASE_SAG_START = SAG_PRECARIOUS_TICKS
    const PHASE_SHAKE_START = SAG_PRECARIOUS_TICKS + SAG_SAGGING_TICKS
    const phase: 'precarious' | 'sagging' | 'shaking' | 'release' =
      elapsed < PHASE_SAG_START ? 'precarious'
      : elapsed < PHASE_SHAKE_START ? 'sagging'
      : elapsed < sag.durationTicks ? 'shaking'
      : 'release'

    // Codex enforcement (PRECARIOUS / SAGGING entry):
    //   - PRECARIOUS→SAGGING boundary: cancel if path no longer
    //     clear. PRECARIOUS doesn't promise motion so cancelling is
    //     fine. Cells return to inert SOIL.
    //   - SAGGING→SHAKING boundary: this is the COMMIT point. Run
    //     two strict checks:
    //       (a) all bottom-edge cells have AIR directly below
    //       (b) no in-flight FallingChunk converges into our
    //           release area
    //     If EITHER fails, we DEFER — extend bracedUntilTick by 6
    //     ticks (~100ms) and re-evaluate at next tick. The chunk
    //     stays in SAGGING phase visually. Only when both pass do
    //     we enter SHAKING; once SHAKING, the fall WILL happen
    //     (rule 1: shake = real fall; rule 3: shake at most once).
    if (phase === 'sagging' && elapsed === PHASE_SAG_START) {
      if (!sagAllBottomEdgesAir(sag.cells, cols, rows, tiles)) {
        for (const cell of sag.cells) {
          const idx = cell.row * cols + cell.col
          flags[idx] = (flags[idx] ?? 0) & ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
        }
        entity.destroy()
        return
      }
    }

    if (phase === 'precarious') {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        const f = flags[idx] ?? 0
        flags[idx] = (((f & ~FLAG_SAGGING) & ~FLAG_SHAKING) | FLAG_PRECARIOUS) as number
      }
      return
    }
    if (phase === 'sagging') {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        const f = flags[idx] ?? 0
        flags[idx] = (((f & ~FLAG_PRECARIOUS) & ~FLAG_SHAKING) | FLAG_SAGGING) as number
      }
      return
    }
    // phase === 'shaking' or 'release': SHAKE-entry commit gate.
    // Defer if the path isn't truly clear OR a sibling will
    // intercept us. Deferral keeps us in SAGGING for ~6 more ticks.
    if (phase === 'shaking' && elapsed === PHASE_SHAKE_START) {
      if (
        !sagAllBottomEdgesAir(sag.cells, cols, rows, tiles) ||
        inFlightConflictAbove(sag.cells)
      ) {
        // Reverse one tick so we re-enter the SAGGING-end check
        // next tick; bracedUntilTick freezes elapsed-tick advance
        // for 6 ticks.
        entity.set(SaggingChunk, {
          startTick: sag.startTick + 6, // shift forward → re-evaluate phase
          bracedUntilTick: tick + 6,
        })
        return
      }
    }
    if (phase === 'shaking') {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        const f = flags[idx] ?? 0
        flags[idx] = ((f & ~FLAG_PRECARIOUS) | FLAG_SAGGING | FLAG_SHAKING) as number
      }
      return
    }
    // phase === 'release' — fall through. SHAKE-entry already committed.

    for (const cell of sag.cells) {
      const idx = cell.row * cols + cell.col
      tiles[idx] = TILE_AIR
      flags[idx] = ((flags[idx]! & ~FLAG_SAGGING & ~FLAG_SHAKING) | FLAG_AUTOTILE_DIRTY) as number
      // Sag release IS a destabilising event: cells that depended on
      // these for support need re-evaluation. The released cells are
      // now AIR (not SOIL) so they don't accumulate SAG_RECHECK
      // themselves; only neighboring SOIL cells get the flag, which
      // is exactly the cascade we want.
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
        releaseRow: minR,
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
  releaseRow: number
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

  // CODEX RULE 1: a chunk that shook MUST have moved by ≥1 cell. If
  // the SHAKE-entry guards (sagAllBottomEdgesAir + inFlightConflict
  // Above) somehow let through a fall whose landing row equals its
  // release row, we're producing a "shake without fall in same grid
  // location" — the bug. Restore cells silently rather than re-stamp
  // SOIL at the same location. This is a belt-and-suspenders fallback;
  // the test suite asserts the count stays at zero in real play.
  if (baseCellRow === fall.releaseRow) {
    bumpStat('zeroDisplacementRestores')
    for (const c of fall.cells) {
      const r = baseCellRow + c.row
      const cc = baseCellCol + c.col
      if (r < 0 || cc < 0 || cc >= cols) continue
      const idx = r * cols + cc
      if (idx >= tiles.length) continue
      tiles[idx] = c.tile
      flags[idx] = ((flags[idx]! & ~FLAG_FALLING) | FLAG_AUTOTILE_DIRTY) as number
      // Re-cascade so the area gets another evaluation pass: cells
      // around us probably changed (a sibling chunk landed below us),
      // so neighbours need to re-check stability.
      markCellAndNeighborsDirty(world, cc, r)
    }
    entity.destroy()
    return
  }
  bumpStat('properLandings')

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

  // Build the landed-cell index set first so cascade propagation can
  // exclude these from SAG_RECHECK on each other (otherwise the
  // landed group is immediately re-evaluated as one unstable chunk).
  const landedSet = new Set<number>()
  for (const c of fall.cells) {
    const r = baseCellRow + c.row
    const cc = baseCellCol + c.col
    if (r < 0 || cc < 0 || cc >= cols) continue
    const idx = r * cols + cc
    if (idx >= tiles.length) continue
    landedSet.add(idx)
  }

  // Stamp cells back into the grid + mark JUST_LANDED on each so
  // detectAndSag's grace pass excludes them for one tick. The
  // cascade IS propagated (chain reactions are part of the genre):
  // markCellAndNeighborsDirtyExcept tags SAG_RECHECK on neighboring
  // SOIL cells that are NOT also landed cells. Result: surrounding
  // terrain destabilises through the standard story (darken → shake
  // → fall) while the just-settled cells get one tick to breathe.
  // Phase 0 perf: push each idx onto recentlyLandedIdxs so the next
  // detectAndSag pass clears JUST_LANDED via a tiny dirty list
  // instead of a window-wide scan.
  for (const c of fall.cells) {
    const r = baseCellRow + c.row
    const cc = baseCellCol + c.col
    if (r < 0 || cc < 0 || cc >= cols) continue
    const idx = r * cols + cc
    if (idx >= tiles.length) continue
    tiles[idx] = c.tile
    flags[idx] = ((flags[idx]! & ~FLAG_FALLING) | FLAG_AUTOTILE_DIRTY | FLAG_JUST_LANDED) as number
    recentlyLandedIdxs.push(idx)
    markCellAndNeighborsDirtyExcept(world, cc, r, landedSet)
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
