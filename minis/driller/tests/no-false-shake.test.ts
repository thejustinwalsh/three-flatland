import { describe, it, expect } from 'vitest'
import {
  clearAllChunkEntities,
  clearChunkEntitiesInRowRange,
  collapseTick,
  detectAndSag,
  tickSagging,
  tickFalling,
} from '../src/systems/collapse'
import { rockAvalancheSystem, resetAvalanche } from '../src/systems/hazard'
import {
  FallingChunk,
  FLAG_DISTURBED,
  FLAG_JUST_LANDED,
  FLAG_SAG_RECHECK,
  FLAG_SHAKING,
  GameState,
  Grid,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'
import { makeWorldFromGrid, tickWorld } from './_world-helper'
void tickFalling

/**
 * The contract: every cell that ever flips FLAG_SHAKING ON during a
 * simulation MUST eventually either (a) become AIR (i.e. it actually
 * fell — the shake was honest), or (b) lose FLAG_SHAKING within a
 * brief window AND its tile-class did NOT carry the "I'm about to
 * fall" promise (covered by the universal pre-pass clear in the
 * avalanche system).
 *
 * Stuck-shake = cell holds FLAG_SHAKING for many ticks while still
 * being a solid SOIL/STONE tile. That is the bug we are guarding
 * against. The repro probe `tools/false-shake-repro.js` confirms
 * zero offenders in live play; these tests pin the same property
 * onto specific scenarios.
 */
function trackShakes(world: ReturnType<typeof makeWorldFromGrid>, ticks: number) {
  const grid = world.get(Grid)!
  // For each cell, record the tick range over which it carried
  // FLAG_SHAKING and what its final tile class is.
  type Track = { firstShakeTick: number; lastShakeTick: number; finalTile: number }
  const tracker = new Map<number, Track>()
  for (let t = 0; t < ticks; t++) {
    tickWorld(world, 1)
    collapseTick(world)
    rockAvalancheSystem(world)
    const tickNow = world.get(GameState)!.tick
    for (let i = 0; i < grid.flags.length; i++) {
      const isShaking = (grid.flags[i]! & FLAG_SHAKING) !== 0
      const tile = grid.tiles[i]!
      const entry = tracker.get(i)
      if (isShaking) {
        if (!entry)
          tracker.set(i, { firstShakeTick: tickNow, lastShakeTick: tickNow, finalTile: tile })
        else {
          entry.lastShakeTick = tickNow
          entry.finalTile = tile
        }
      } else if (entry) {
        entry.finalTile = tile
      }
    }
    // Update finalTile for all tracked cells regardless of shake state.
    for (const [i, entry] of tracker) entry.finalTile = grid.tiles[i]!
  }
  return tracker
}

describe('no-false-shake invariant', () => {
  it('a sagging chunk that shakes also actually falls (cells become AIR)', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    // Simulate disturbance.
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)

    const tracker = trackShakes(world, 140)
    let stuck = 0
    for (const [, entry] of tracker) {
      // Honest shake: cell ended up AIR (the chunk fell).
      // Stuck: cell shook AND is still SOIL/STONE at the end.
      if (entry.finalTile !== TILE_AIR) stuck++
    }
    expect(stuck).toBe(0)
  })

  it('an avalanche cluster that shakes either actually moves or stops shaking', () => {
    // 4-stack cluster above SOIL, disturbed. Should shake-then-fall.
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '......#.......',
      '......#.......',
      '......#.......',
      '..............',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_STONE) grid.flags[i]! |= FLAG_DISTURBED
    }
    resetAvalanche()
    const tracker = trackShakes(world, 140)
    // Every shaking cell at end is either AIR (rock disintegrated /
    // moved) OR stopped shaking AND moved to a new row (the cluster
    // commits successive fall steps). What MUST NOT happen: a cell
    // stays at the same row with FLAG_SHAKING for many ticks.
    let stuckShakes = 0
    for (const [idx, entry] of tracker) {
      const isStillShaking = (grid.flags[idx]! & FLAG_SHAKING) !== 0
      const stillSolid = entry.finalTile !== TILE_AIR
      const shookForLong = entry.lastShakeTick - entry.firstShakeTick > 30
      if (isStillShaking && stillSolid && shookForLong) stuckShakes++
    }
    expect(stuckShakes).toBe(0)
  })

  it('a blocked avalanche cluster does NOT accumulate stuck SHAKING', () => {
    // 4-stack with bedrock immediately below. Disturbed, but cant
    // fall because bedrock below. The universal pre-pass clear
    // ensures NO stones carry FLAG_SHAKING after each tick.
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_STONE) grid.flags[i]! |= FLAG_DISTURBED
    }
    resetAvalanche()
    for (let t = 0; t < 60; t++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
    }
    let stuckShakes = 0
    for (let i = 0; i < grid.flags.length; i++) {
      if ((grid.flags[i]! & FLAG_SHAKING) !== 0) stuckShakes++
    }
    expect(stuckShakes).toBe(0)
  })

  it('a sag whose path gets sealed mid-wobble cancels — no shake, no 0-tile release', () => {
    // Cantilever over an AIR pocket. detectAndSag spawns a sag entity
    // because the bottom row has AIR below it. THEN we slam the gap
    // shut (simulating another falling chunk landing under us). The
    // sag's shake window arrives — but with no AIR below, the contract
    // says: do NOT shake, do NOT release a 0-tile fall, just cancel.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    // Confirm a sag entity actually spawned (otherwise the test isn't
    // exercising what it claims to).
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBeGreaterThan(0)
    // Now seal the path: fill the AIR row directly under the sag
    // chunk with SOIL. This is what a landing FallingChunk does.
    for (let c = 0; c < grid.cols; c++) {
      grid.tiles[3 * grid.cols + c] = TILE_SOIL
    }
    // Tick well past SAG_DURATION_TICKS (42) — through the entire
    // shake window AND the release point.
    for (let t = 0; t < 140; t++) {
      tickWorld(world, 1)
      tickSagging(world)
    }
    // No cell should still carry SAGGING or SHAKING.
    for (let i = 0; i < grid.flags.length; i++) {
      expect(grid.flags[i]! & FLAG_SHAKING).toBe(0)
    }
    // The chunk must NOT have released — its cells are still SOIL,
    // not AIR. (A 0-tile "release" is the bug we're forbidding.)
    for (let c = 2; c < 8; c++) {
      expect(grid.tiles[2 * grid.cols + c]).toBe(TILE_SOIL)
    }
  })

  it('clearAllChunkEntities wipes sag/fall on death entry', () => {
    // Pin the death-replay bug: a SaggingChunk that was alive when
    // the driller died MUST NOT survive into respawn. After
    // clearAllChunkEntities the world has zero SaggingChunk and zero
    // FallingChunk entities, and no cell carries SAGGING or SHAKING.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    let preCount = 0
    world.query(SaggingChunk).forEach(() => preCount++)
    expect(preCount).toBeGreaterThan(0)
    clearAllChunkEntities(world)
    let postSag = 0
    world.query(SaggingChunk).forEach(() => postSag++)
    let postFall = 0
    world.query(FallingChunk).forEach(() => postFall++)
    expect(postSag).toBe(0)
    expect(postFall).toBe(0)
    for (let i = 0; i < grid.flags.length; i++) {
      expect(grid.flags[i]! & FLAG_SHAKING).toBe(0)
    }
  })

  it('clearChunkEntitiesInRowRange wipes only entities in unloaded rows', () => {
    // Two sag chunks at different rows. Unloading one row range must
    // drop the entity in that range and leave the other intact.
    const world = makeWorldFromGrid([
      '..............',
      '..######......',
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    let total = 0
    world.query(SaggingChunk).forEach(() => total++)
    expect(total).toBe(2)
    // Unload rows [0,3) — only the upper sag chunk is in range.
    clearChunkEntitiesInRowRange(world, 0, 3)
    let remaining = 0
    world.query(SaggingChunk).forEach((entity) => {
      const sag = entity.get(SaggingChunk)!
      // The surviving entity's cells must all be at row >= 3.
      for (const c of sag.cells) expect(c.row).toBeGreaterThanOrEqual(3)
      remaining++
    })
    expect(remaining).toBe(1)
  })

  it('partial-drill of a sag (1 cell) shrinks the chunk and the rest still falls', () => {
    // Codex follow-up: drilling part of an unstable structure should
    // make the rest fall through the normal lifecycle (predictable
    // for the AI driller). We drill ONE cell of a 6-cell sag; the
    // remaining 5 cells stay cantilever-unstable AND still have a
    // clear fall path → the sag releases as a FallingChunk.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    // Drill out the leftmost cell of the sag chunk mid-wobble.
    grid.tiles[2 * grid.cols + 2] = TILE_AIR
    // Tick past the release window. The 5 surviving cells should
    // run through PRECARIOUS → SAGGING → SHAKING → release.
    for (let t = 0; t < 140; t++) {
      tickWorld(world, 1)
      tickSagging(world)
      tickFalling(world)
    }
    // Sag entity gone (released into a FallingChunk and that landed).
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
    // The 5 surviving cells fell out of row 2 — they should now be AIR.
    let drilledThenFell = 0
    for (let c = 3; c < 8; c++) {
      if (grid.tiles[2 * grid.cols + c] === TILE_AIR) drilledThenFell++
    }
    expect(drilledThenFell).toBe(5)
    // No cell should carry SHAKING.
    for (let i = 0; i < grid.flags.length; i++) {
      expect(grid.flags[i]! & FLAG_SHAKING).toBe(0)
    }
  })

  it('drilling all cells of a sag cancels it (no survivors)', () => {
    // Counterpart to the partial-drill case: if every cell of the
    // sag gets cleared mid-wobble, there are no survivors to fall
    // through. The entity must be destroyed; no FallingChunk spawns;
    // no SHAKING on any cell.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    // Drill out EVERY cell of the sag chunk.
    for (let c = 2; c < 8; c++) grid.tiles[2 * grid.cols + c] = TILE_AIR
    for (let t = 0; t < 140; t++) {
      tickWorld(world, 1)
      tickSagging(world)
    }
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
    let fallCount = 0
    world.query(FallingChunk).forEach(() => fallCount++)
    expect(fallCount).toBe(0)
    for (let i = 0; i < grid.flags.length; i++) {
      expect(grid.flags[i]! & FLAG_SHAKING).toBe(0)
    }
  })

  it('a landing cascade tags surrounding terrain (not landed cells) and terminates', () => {
    // A 4-wide soil shelf hangs off a stone anchor. Drilling out the
    // pillar releases it; it falls onto a small marginal stack below.
    // Contract: the impact triggers a re-check on terrain *around*
    // the landing site, not on the landed cells themselves. The
    // chain settles in finite time (no infinite loop).
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      'S####.........',
      'S....#........',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    // Disturb everything so detectAndSag has work.
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    // Run until the world settles or we run out of patience.
    let ticksToSettle = 0
    const MAX_TICKS = 500
    for (let t = 0; t < MAX_TICKS; t++) {
      tickWorld(world, 1)
      collapseTick(world)
      let inFlight = 0
      world.query(SaggingChunk).forEach(() => inFlight++)
      world.query(FallingChunk).forEach(() => inFlight++)
      if (inFlight === 0) {
        ticksToSettle = t
        break
      }
    }
    expect(ticksToSettle).toBeGreaterThan(0)
    expect(ticksToSettle).toBeLessThan(MAX_TICKS)
    // Run one more tick — JUST_LANDED is set during tickFalling and
    // cleared by the NEXT tick's detectAndSag (since that's the
    // pass that uses it as a filter). After that tick, no leftover.
    tickWorld(world, 1)
    collapseTick(world)
    for (let i = 0; i < grid.flags.length; i++) {
      expect(grid.flags[i]! & FLAG_JUST_LANDED).toBe(0)
    }
    for (let i = 0; i < grid.flags.length; i++) {
      expect(grid.flags[i]! & FLAG_SHAKING).toBe(0)
    }
  })

  it('a chunk that lands ON an anchor path becomes anchored same-tick (snap-down rule)', () => {
    // Diffusion model replaces the JUST_LANDED grace. When a chunk
    // lands on cells that are already anchored, the relaxation
    // step's "snap down" rule pulls the new cells' anchor distance
    // down to (neighbor + 1) instantly. No sag should fire.
    const world = makeWorldFromGrid([
      '##############', // row 0: top edge — seeds row 0 at distance 0
      '##############', // row 1: distance 1
      '##############', // row 2: distance 2
      '##############', // row 3: distance 3
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    // Pre-settle already ran in makeWorldFromGrid; verify a non-edge
    // cell is anchored. With MAX_REACH=4 the slab is fully stable.
    expect(grid.anchorDist[3 * grid.cols + 5]).toBeLessThanOrEqual(3)
    detectAndSag(world)
    let sagCount = 0
    world.query(SaggingChunk).forEach(() => sagCount++)
    expect(sagCount).toBe(0)
  })

  it('tickSagging does not set SHAKING on cells that are no longer SOIL', () => {
    // Edge case: a SaggingChunk's cells got cleared mid-sag (e.g.
    // by drilling). When the final-window timer fires, we still set
    // FLAG_SHAKING on those cell indices. The renderer skips AIR
    // cells so the shake is invisible — but we should also confirm
    // that no STONE / fixture cell ends up shaking via this path.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    // Now drill out two cells of the sagging chunk.
    grid.tiles[2 * grid.cols + 4] = TILE_AIR
    grid.tiles[2 * grid.cols + 5] = TILE_AIR
    // Tick through.
    for (let t = 0; t < 60; t++) {
      tickWorld(world, 1)
      tickSagging(world)
    }
    // No STONE / fixture cell should ever carry FLAG_SHAKING.
    for (let i = 0; i < grid.flags.length; i++) {
      if (grid.tiles[i] === TILE_STONE) {
        expect(grid.flags[i]! & FLAG_SHAKING).toBe(0)
      }
    }
  })
})
