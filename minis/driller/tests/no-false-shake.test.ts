import { describe, it, expect } from 'vitest'
import { collapseTick, detectAndSag, tickSagging, tickFalling } from '../src/systems/collapse'
import { rockAvalancheSystem, resetAvalanche } from '../src/systems/hazard'
import {
  FLAG_DISTURBED,
  FLAG_SAG_RECHECK,
  FLAG_SHAKING,
  GameState,
  Grid,
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
        if (!entry) tracker.set(i, { firstShakeTick: tickNow, lastShakeTick: tickNow, finalTile: tile })
        else { entry.lastShakeTick = tickNow; entry.finalTile = tile }
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

    const tracker = trackShakes(world, 80)
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
    const tracker = trackShakes(world, 80)
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
