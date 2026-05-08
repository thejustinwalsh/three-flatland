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

describe('SAG_RECHECK gate', () => {
  it('does NOT sag on the FIRST tick after worldgen (no SAG_RECHECK on cells)', () => {
    // Floating slab — cantilever-unstable, willFall = true. But
    // without FLAG_SAG_RECHECK on any of its cells, detectAndSag
    // must skip it entirely.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    detectAndSag(world)
    expect(countSagging(world)).toBe(0)
  })

  it('clears FLAG_SAG_RECHECK after processing so the chunk does not re-sag every tick', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    tagSagRecheck(world)
    detectAndSag(world)
    // After detectAndSag, FLAG_SAG_RECHECK should be cleared on the
    // chunk's cells — re-running detectAndSag on the same world (no
    // new mutations) must not spawn additional sags.
    const sagCountAfterFirst = countSagging(world)
    detectAndSag(world)
    expect(countSagging(world)).toBe(sagCountAfterFirst)
    // FLAG_SAG_RECHECK should be 0 on every soil cell at this point.
    const grid = world.get(Grid)!
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_SOIL) {
        expect(grid.flags[i]! & FLAG_SAG_RECHECK).toBe(0)
      }
    }
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
