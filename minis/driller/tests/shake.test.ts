import { describe, it, expect } from 'vitest'
import { collapseTick, detectAndSag, tickSagging } from '../src/systems/collapse'
import { rockAvalancheSystem, resetAvalanche } from '../src/systems/hazard'
import {
  FLAG_DISTURBED,
  FLAG_SAG_RECHECK,
  FLAG_SAGGING,
  FLAG_SHAKING,
  GameState,
  Grid,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'
import { SAG_DURATION_TICKS } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function tagSagRecheck(world: ReturnType<typeof makeWorldFromGrid>): void {
  const grid = world.get(Grid)!
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] === TILE_SOIL) grid.flags[i]! |= FLAG_SAG_RECHECK
  }
}

function disturbAllStones(world: ReturnType<typeof makeWorldFromGrid>): void {
  const grid = world.get(Grid)!
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] === TILE_STONE) grid.flags[i]! |= FLAG_DISTURBED
  }
}

function countShaking(world: ReturnType<typeof makeWorldFromGrid>): number {
  const grid = world.get(Grid)!
  let n = 0
  for (let i = 0; i < grid.flags.length; i++) {
    if ((grid.flags[i]! & FLAG_SHAKING) !== 0) n++
  }
  return n
}

function countSagging(world: ReturnType<typeof makeWorldFromGrid>): number {
  const grid = world.get(Grid)!
  let n = 0
  for (let i = 0; i < grid.flags.length; i++) {
    if ((grid.flags[i]! & FLAG_SAGGING) !== 0) n++
  }
  return n
}

describe('shake telegraph rules', () => {
  it('SAGGING is set without SHAKING for the early portion of the sag countdown', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    tagSagRecheck(world)
    detectAndSag(world)
    expect(countSagging(world)).toBeGreaterThan(0)
    expect(countShaking(world)).toBe(0) // early-window: no shake
    // Tick a few ticks of sag — still no shake.
    for (let i = 0; i < 4; i++) {
      tickWorld(world, 1)
      tickSagging(world)
    }
    expect(countShaking(world)).toBe(0)
  })

  it('SHAKING turns on only in the final SAG_SHAKE_LEAD_TICKS of the sag', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    tagSagRecheck(world)
    detectAndSag(world)
    // Advance to just inside the shake window.
    for (let i = 0; i < SAG_DURATION_TICKS - 4; i++) {
      tickWorld(world, 1)
      tickSagging(world)
    }
    expect(countShaking(world)).toBeGreaterThan(0)
  })

  it('FLAG_SHAKING is cleared on release (no stuck shake)', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    tagSagRecheck(world)
    detectAndSag(world)
    // Run the full sag countdown + a few extra ticks for release.
    for (let i = 0; i < SAG_DURATION_TICKS + 5; i++) {
      tickWorld(world, 1)
      collapseTick(world)
    }
    // After release the original sag cells should no longer have
    // FLAG_SHAKING — they're either AIR (released) or in the
    // FallingChunk which doesn't render via TileRenderer.
    expect(countShaking(world)).toBe(0)
  })

  it('avalanche shake clears on every tick via universal pre-pass', () => {
    // Build a 4-stack rock cluster that's anchored below — disturbed,
    // can't fall (canFall=false). The pre-pass must clear FLAG_SHAKING
    // so it doesn't accumulate.
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      'SSSSSSSSSSSSSS', // floor everywhere → cluster bottom blocked
    ])
    disturbAllStones(world)
    resetAvalanche()
    // Run avalanche several times — the cluster's bottom stone has
    // STONE below (not AIR/SOIL) so canFall=false. SHAKE must NOT
    // accumulate.
    for (let i = 0; i < 30; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
    }
    expect(countShaking(world)).toBe(0)
  })
})

describe('diffusion-based sag detection', () => {
  it('a chunk with no anchor path enters the sag pipeline (post-pre-settle)', () => {
    // Floating slab — pre-settle assigns INF anchor distance to its
    // cells (no path to top edge or any fixture). On detectAndSag,
    // the chunk should immediately become a SaggingChunk.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    detectAndSag(world)
    expect(countSagging(world)).toBeGreaterThan(0)
  })

  it('does not double-spawn the same chunk if detectAndSag runs twice with no mutations', () => {
    // First call spawns a SaggingChunk; the cells get FLAG_SAGGING.
    // Second call sees the FLAG_SAGGING and skips re-spawning (the
    // chunkHasFlag(FLAG_SAGGING|FLAG_FALLING) check).
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    detectAndSag(world)
    const after1 = countSagging(world)
    detectAndSag(world)
    expect(countSagging(world)).toBe(after1)
  })
})

describe('GameState scaffolding', () => {
  it('tickWorld helper increments tick', () => {
    const world = makeWorldFromGrid(['##', '##'])
    expect(world.get(GameState)!.tick).toBe(0)
    tickWorld(world, 5)
    expect(world.get(GameState)!.tick).toBe(5)
  })
})
