import { describe, expect, it } from 'vitest'
import {
  markCellAndNeighborsDirty,
  markCellAndNeighborsDirtyExcept,
} from '../src/systems/autotile-pass'
import {
  FLAG_DISTURBED,
  FLAG_SAG_RECHECK,
  Grid,
  TILE_AIR,
  TILE_SOIL,
  TILE_STONE,
} from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Disturbance is DIRECTIONAL — only stones DIRECTLY ABOVE the changed
 * cell get FLAG_DISTURBED. Stones to the sides or below ignore the
 * event. This mirrors the directional anchoring rule (stones anchor
 * only what's directly above them) and prevents the "rocks fall when
 * the driller walks past them" failure mode: rocks only fall when
 * their actual support (the cell beneath them) changes.
 */

describe('markCellAndNeighborsDirty disturbs the stone DIRECTLY ABOVE', () => {
  it('drilling the cell directly under a stone disturbs it', () => {
    // Layout: STONE at (5, 2). AIR at (5, 3) below it. After marking
    // (5, 3) dirty (e.g. it was just drilled), the stone above it
    // should carry FLAG_DISTURBED — its support changed.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '.....S........',
      '..............',
    ])
    const grid = world.get(Grid)!
    const stoneIdx = 2 * grid.cols + 5
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)

    markCellAndNeighborsDirty(world, 5, 3)
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(true)
  })

  it('drilling NEXT TO a stone (sideways) does NOT disturb it', () => {
    // Stone at (6, 2). Drill the cell to its left at (5, 2). The stone
    // is in a SIDE neighbor of the drilled cell — directional rule
    // says no disturbance.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '......S.......',
      '..............',
    ])
    const grid = world.get(Grid)!
    const stoneIdx = 2 * grid.cols + 6
    grid.tiles[2 * grid.cols + 5] = TILE_AIR
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)

    markCellAndNeighborsDirty(world, 5, 2)
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)
  })

  it('drilling ABOVE a stone does NOT disturb it', () => {
    // Stone at (5, 2). Drill the cell above at (5, 1). The stone is
    // in the SOUTH neighbor of the drilled cell — no disturbance.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '.....S........',
      '..............',
    ])
    const grid = world.get(Grid)!
    const stoneIdx = 2 * grid.cols + 5
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)

    markCellAndNeighborsDirty(world, 5, 1)
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)
  })

  it('drilled cell sets FLAG_SAG_RECHECK on adjacent TILE_SOIL (existing behavior)', () => {
    const world = makeWorldFromGrid([
      '.....#........',
      '..............',
    ])
    const grid = world.get(Grid)!
    const soilIdx = 0 * grid.cols + 5
    expect((grid.flags[soilIdx]! & FLAG_SAG_RECHECK) !== 0).toBe(false)
    markCellAndNeighborsDirty(world, 5, 1) // 4-neighbor of (5, 0)
    expect((grid.flags[soilIdx]! & FLAG_SAG_RECHECK) !== 0).toBe(true)
  })

  it('the …Except variant disturbs the stone above the changed cell (chain reactions)', () => {
    // Stone at (6, 1). When a chunk lands at (6, 2) directly below it,
    // markCellAndNeighborsDirtyExcept fires for that cell — the stone
    // above gets disturbed.
    const world = makeWorldFromGrid([
      '..............',
      '......S.......',
      '..............',
    ])
    const grid = world.get(Grid)!
    const stoneIdx = 1 * grid.cols + 6
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)
    markCellAndNeighborsDirtyExcept(world, 6, 2, new Set<number>([99999]))
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(true)
  })

  it('the …Except variant respects the exclude set (no disturb on excluded stones)', () => {
    const world = makeWorldFromGrid([
      '..............',
      '......S.......',
      '..............',
    ])
    const grid = world.get(Grid)!
    const stoneIdx = 1 * grid.cols + 6
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)
    markCellAndNeighborsDirtyExcept(world, 6, 2, new Set<number>([stoneIdx]))
    // Excluded — must NOT be disturbed even though it's directly above.
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)
  })

  it('non-stone non-soil neighbors (fixture, AIR) are untouched', () => {
    // Sanity: only stones and soil get topology bits. AIR / fixture
    // 4-neighbors should NOT pick up SAG_RECHECK or DISTURBED.
    const world = makeWorldFromGrid([
      '......F.......',
      '..............',
      '..............',
    ])
    const grid = world.get(Grid)!
    const fixtureIdx = 0 * grid.cols + 6
    const fixtureFlagsBefore = grid.flags[fixtureIdx]!
    markCellAndNeighborsDirty(world, 5, 0)
    const fixtureFlagsAfter = grid.flags[fixtureIdx]!
    // Fixture should not have gained DISTURBED or SAG_RECHECK.
    expect((fixtureFlagsAfter & (FLAG_DISTURBED | FLAG_SAG_RECHECK))).toBe(0)
    // (autotile-dirty IS allowed — the 8-neighbor halo includes it.)
    void fixtureFlagsBefore
  })
})
