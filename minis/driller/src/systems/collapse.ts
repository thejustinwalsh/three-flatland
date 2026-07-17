import type { Entity, World } from 'koota'
import {
  type ChunkCell,
  Driller,
  FallingChunk,
  FLAG_AUTOTILE_DIRTY,
  FLAG_FALLING,
  FLAG_PRECARIOUS,
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
 * scan each tick. ABOVE is wide enough to cover the camera viewport
 * (cells the player can see above homie) plus a margin for MAX_REACH;
 * the player needs to read weakness building up there before chunks
 * fall into reach. BELOW is wider still so the streamer's just-loaded
 * chunks get evaluated for any natural cantilevers worth telegraphing
 * as the driller approaches.
 */
const SCAN_WINDOW_ROWS_ABOVE = 16
const SCAN_WINDOW_ROWS_BELOW = 192 // ~6 chunks streamed-ahead
import { detectChunks, relaxAnchorDist, type SoilChunk, unstableCells } from '../lib/chunk-detect'
import { markCellAndNeighborsDirty } from './autotile-pass'
import { isFreeFall } from '../biomes'
import { playSound } from './sounds'

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
 * Diffusion-based sag detection.
 *
 * Reads from `Grid.anchorDist` (persistent, driven each tick by
 * `relaxAnchorDist()`). A SOIL cell with `anchorDist > MAX_REACH`
 * (or INF — no anchor path) is unstable; the connected chunk it
 * belongs to gets a SaggingChunk entity that carries it through the
 * precarious → sagging → shaking → fall pipeline.
 *
 * No FLAG_SAG_RECHECK gate, no JUST_LANDED grace — the relaxation
 * model converges naturally. Quiet ticks (anchor distances unchanged)
 * still pay the chunk-detect cost, but we bound the scan window
 * around the driller so deep / unloaded rows don't churn.
 */
export function detectAndSag(world: World): void {
  const grid = world.get(Grid)
  const gs = world.get(GameState)
  if (!grid || !gs) return
  const { cols, rows, tiles, flags, anchorDist } = grid

  // Bound chunk detection to the visible-history window around the
  // driller. Cleared rows far above (after world rotation) or far below
  // (un-streamed) contain only AIR and would just churn the flood-fill
  // for nothing.
  const driller = world.queryFirst(Driller)
  const dRow = driller ? driller.get(Driller)!.row : 0
  const winTop = Math.max(0, dRow - SCAN_WINDOW_ROWS_ABOVE)
  const winBot = Math.min(rows, dRow + SCAN_WINDOW_ROWS_BELOW)

  const allChunks = detectChunks(tiles, cols, rows, winTop, winBot)
  const unstable = unstableCells(tiles, anchorDist, MAX_REACH)
  if (unstable.size === 0) return

  for (const ch of allChunks) {
    // Skip chunks already in any phase of the sag lifecycle. PRECARIOUS
    // is critical here: the precarious phase CLEARS FLAG_SAGGING (replacing
    // it with FLAG_PRECARIOUS), so without this check detectAndSag would
    // spawn a fresh SaggingChunk every tick during the 54-tick precarious
    // window — each new entity at elapsed=0 overwriting the older ones'
    // flag writes back to PRECARIOUS. The visual telegraph (sagging →
    // shaking) would never fire; cells would skip straight to release
    // when the oldest pile reached the duration boundary. FLAG_SHAKING
    // included as belt-and-suspenders.
    if (chunkHasFlag(ch, flags, FLAG_SAGGING | FLAG_FALLING | FLAG_PRECARIOUS | FLAG_SHAKING))
      continue

    const unstableIdxs = ch.cells.filter((idx) => unstable.has(idx))
    if (unstableIdxs.length === 0) continue

    const chosen = filterBottomRows(
      {
        ...ch,
        cells: unstableIdxs,
        maxRow: Math.max(...unstableIdxs.map((i) => Math.floor(i / cols))),
      },
      cols,
      MAX_CHUNK_HEIGHT
    )
    if (chosen.length === 0) continue

    // A SaggingChunk is a rigid body: every exposed bottom edge must
    // have room to move. The old at-least-one-edge guard spawned a sag
    // that the stricter shake-entry gate could never commit, causing
    // repeated spawn/cancel churn around partially-supported soil.
    const chosenCells = chosen.map((idx) => ({
      col: idx % cols,
      row: Math.floor(idx / cols),
      tile: tiles[idx]!,
    }))
    if (!sagAllBottomEdgesAir(chosenCells, cols, rows, tiles)) continue

    for (const idx of chosen) flags[idx] = (flags[idx] ?? 0) | FLAG_SAGGING
    world.spawn(
      SaggingChunk({
        cells: chosenCells,
        startTick: gs.tick,
        durationTicks: SAG_DURATION_TICKS,
        bracedUntilTick: 0,
      })
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
  tiles: Uint8Array
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

function inFlightConflictAbove(cells: ReadonlyArray<{ col: number; row: number }>): boolean {
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
export function clearChunkEntitiesInRowRange(world: World, rowStart: number, rowEnd: number): void {
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

  // Build the per-column in-flight FallingChunk lookup
  // once. Used by the SAGGING→SHAKING commit gate below.
  rebuildInFlightTopRowByCol(world, cols)

  // Cull SaggingChunk entities whose cells have
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

    // Codex rule 1 gate: once SHAKING fires, the cells visually
    // committed to a fall — cancellation at that point would leave
    // shook-but-didn't-fall cells (shake-contract violators). The
    // partial-drill re-eval below SKIPS its bottom-edge cancellation
    // in SHAKING phase; the release-tick path runs normally on
    // survivors and landAndReattach's zero-displacement detector
    // (line 651) is the belt-and-suspenders fallback if the path is
    // fully blocked at release.
    const isShakingPhase =
      elapsed >= SAG_PRECARIOUS_TICKS + SAG_SAGGING_TICKS && elapsed < sag.durationTicks

    // Partial-drill re-evaluation (codex follow-up). When the driller
    // (or any other mutator) clears one or more cells of an active
    // sag, the chunk shouldn't lose its telegraph wholesale — that
    // would mean drilling part of an unstable structure makes LESS of
    // it fall, not more. Instead:
    //
    //   1. Filter to cells whose grid tile still matches their
    //      reserved tile.
    //   2. If none survive: cancel.
    //   3. If the survivors no longer satisfy the codex bottom-edge
    //      check AND we are NOT yet in SHAKING phase: cancel
    //      (PRECARIOUS / SAGGING haven't promised motion). In SHAKING
    //      phase the cells already broadcast their commit — skip the
    //      cancellation and let release run.
    //   4. Otherwise: SHRINK the entity to its surviving cells and
    //      preserve the current phase. Drilled cells already went
    //      AIR via the driller system; clear any leftover flags on
    //      them. The remaining cells continue their PRECARIOUS /
    //      SAGGING / SHAKING countdown unchanged.
    const validCells = sag.cells.filter((cell) => {
      const idx = cell.row * cols + cell.col
      return idx >= 0 && idx < tiles.length && tiles[idx] === cell.tile
    })
    if (validCells.length === 0) {
      entity.destroy()
      return
    }
    if (validCells.length < sag.cells.length) {
      // Some cells got drilled or otherwise removed. Re-validate the
      // surviving structure — but ONLY cancel during PRECARIOUS/SAGGING.
      // In SHAKING the cells already committed; cancellation here is a
      // codex rule 1 violation (shook-but-didn't-fall).
      if (!isShakingPhase && !sagAllBottomEdgesAir(validCells, cols, rows, tiles)) {
        for (const cell of sag.cells) {
          const idx = cell.row * cols + cell.col
          if (idx >= 0 && idx < flags.length) {
            flags[idx]! &= ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
          }
        }
        entity.destroy()
        return
      }
      // Clear flags from cells that left the chunk (defensive — the
      // mutator should have already cleared their flag-byte but
      // belt-and-suspenders).
      const survivingIdxs = new Set(validCells.map((c) => c.row * cols + c.col))
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        if (!survivingIdxs.has(idx) && idx >= 0 && idx < flags.length) {
          flags[idx]! &= ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
        }
      }
      entity.set(SaggingChunk, { cells: validCells })
      // Continue with the current phase logic on the shrunk cell list.
      sag.cells = validCells
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
      elapsed < PHASE_SAG_START
        ? 'precarious'
        : elapsed < PHASE_SHAKE_START
          ? 'sagging'
          : elapsed < sag.durationTicks
            ? 'shaking'
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
        flags[idx] = (f & ~FLAG_SAGGING & ~FLAG_SHAKING) | FLAG_PRECARIOUS
      }
      return
    }
    if (phase === 'sagging') {
      for (const cell of sag.cells) {
        const idx = cell.row * cols + cell.col
        const f = flags[idx] ?? 0
        flags[idx] = (f & ~FLAG_PRECARIOUS & ~FLAG_SHAKING) | FLAG_SAGGING
      }
      return
    }
    // phase === 'shaking' or 'release': SHAKE-entry commit gate.
    // Defer if the path isn't truly clear OR a sibling will
    // intercept us. Deferral keeps us in SAGGING for ~6 more ticks.
    if (phase === 'shaking' && elapsed === PHASE_SHAKE_START) {
      if (!sagAllBottomEdgesAir(sag.cells, cols, rows, tiles)) {
        // A static obstruction cannot become clear merely by shifting the
        // sag timer. Cancel before the visible shake promise and let the
        // diffusion detector reconsider the structure after the grid
        // actually changes.
        for (const cell of sag.cells) {
          const idx = cell.row * cols + cell.col
          flags[idx] = (flags[idx] ?? 0) & ~FLAG_PRECARIOUS & ~FLAG_SAGGING & ~FLAG_SHAKING
        }
        entity.destroy()
        return
      }
      if (inFlightConflictAbove(sag.cells)) {
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
        flags[idx] = (f & ~FLAG_PRECARIOUS) | FLAG_SAGGING | FLAG_SHAKING
      }
      return
    }
    // phase === 'release' — fall through. SHAKE-entry already committed.

    for (const cell of sag.cells) {
      const idx = cell.row * cols + cell.col
      tiles[idx] = TILE_AIR
      flags[idx] = (flags[idx]! & ~FLAG_SAGGING & ~FLAG_SHAKING) | FLAG_AUTOTILE_DIRTY
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
      })
    )
    playSound(world, 'blockFall')
    entity.destroy()
  })
}

const GRAVITY_PX = 0.6
const TERMINAL_PX = 24

function firstLandingBaseRow(
  fall: FallingChunkData,
  targetPy: number,
  cols: number,
  rows: number,
  tiles: Uint8Array
): number | null {
  const baseCol = Math.floor(fall.px / TILE_PX)
  const fromBaseRow = Math.floor(fall.py / TILE_PX)
  const toBaseRow = Math.floor(targetPy / TILE_PX)
  const occupied = new Set<number>()
  for (const cell of fall.cells) occupied.add(cell.row * cols + cell.col)
  const bottomCells = fall.cells.filter((cell) => !occupied.has((cell.row + 1) * cols + cell.col))

  for (let baseRow = fromBaseRow; baseRow <= toBaseRow; baseRow++) {
    for (const cell of bottomCells) {
      const supportCol = baseCol + cell.col
      const supportRow = baseRow + cell.row + 1
      if (supportRow >= rows) return baseRow
      if (supportCol < 0 || supportCol >= cols) continue
      if (tiles[supportRow * cols + supportCol] !== TILE_AIR) return baseRow
    }
  }
  return null
}

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

    // Sweep every crossed grid row. At terminal velocity a chunk can
    // move 24 px in one tick (1.5 tiles); checking only the destination
    // row tunnels through one-tile supports and leaves the chunk in a
    // perpetual falling loop.
    const landingBaseRow = firstLandingBaseRow(fall, newPy, cols, rows, tiles)
    if (landingBaseRow !== null) {
      landAndReattach(
        world,
        entity,
        { ...fall, py: landingBaseRow * TILE_PX, vy: newVy },
        cols,
        tiles,
        flags
      )
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
  flags: Uint8Array
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
      flags[idx] = (flags[idx]! & ~FLAG_FALLING) | FLAG_AUTOTILE_DIRTY
      // Re-cascade so the area gets another evaluation pass: cells
      // around us probably changed (a sibling chunk landed below us),
      // so neighbours need to re-check stability.
      markCellAndNeighborsDirty(world, cc, r)
    }
    entity.destroy()
    return
  }
  bumpStat('properLandings')
  playSound(world, 'blockLand')

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

  // Stamp cells back into the grid. The diffusion model handles the
  // rest: landed cells start at INF anchor distance (they came from
  // AIR), and `relaxAnchorDist()` will pull them down toward their
  // true value over the next few ticks via the snap-down rule (target
  // < stored snaps instantly), so a chunk that lands ON AN ANCHOR
  // PATH becomes anchored same-tick. A chunk that lands in mid-air
  // with no anchor path stays at INF and re-enters the sag pipeline
  // naturally — no JUST_LANDED grace needed.
  for (const c of fall.cells) {
    const r = baseCellRow + c.row
    const cc = baseCellCol + c.col
    if (r < 0 || cc < 0 || cc >= cols) continue
    const idx = r * cols + cc
    if (idx >= tiles.length) continue
    tiles[idx] = c.tile
    flags[idx] = (flags[idx]! & ~FLAG_FALLING) | FLAG_AUTOTILE_DIRTY
    markCellAndNeighborsDirty(world, cc, r)
  }

  entity.destroy()

  if (crushed) {
    world.set(GameState, { runState: 'dying' })
  }
}

export function collapseTick(world: World): void {
  // Diffusion step first: this tick's anchor-distance updates feed
  // the sag detector. Variant C: weakness propagates 1 cell/tick
  // (rising); strength snaps instantly (falling). Drilled cells from
  // the previous tick begin their wavefront here.
  const grid = world.get(Grid)
  if (grid && grid.anchorDist.length === grid.tiles.length) {
    relaxAnchorDist(grid.tiles, grid.anchorDist, grid.cols, grid.rows, grid.topRow)
  }
  detectAndSag(world)
  tickSagging(world)
  tickFalling(world)
}
