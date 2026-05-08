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
 * Plan 1 item E — drill / sag-release / explosion / hazard land must
 * disturb adjacent rock cells so otherwise-inert clusters wake up.
 *
 * The change extends `markCellAndNeighborsDirty` (and …Except) to set
 * FLAG_DISTURBED on 4-neighbor TILE_STONE cells, in addition to the
 * existing FLAG_SAG_RECHECK on 4-neighbor SOIL cells. Without this,
 * world-gen rock piles only fall when a hazard happens to land
 * directly adjacent — the player drilling next to them does nothing.
 */

describe('markCellAndNeighborsDirty disturbs adjacent stones', () => {
  it('drilled cell sets FLAG_DISTURBED on adjacent TILE_STONE', () => {
    // Layout: AIR cell at (5, 2). STONE at (6, 2) (right neighbor).
    // After marking the AIR cell dirty, the right-neighbor stone
    // should carry FLAG_DISTURBED.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '.....S........',
      '..............',
    ])
    const grid = world.get(Grid)!
    // Move the stone to col 6 (adjacent to col 5).
    grid.tiles[2 * grid.cols + 5] = TILE_AIR
    grid.tiles[2 * grid.cols + 6] = TILE_STONE

    const stoneIdx = 2 * grid.cols + 6
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)

    markCellAndNeighborsDirty(world, 5, 2)
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(true)
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

  it('the …Except variant also disturbs adjacent stones (chain reactions)', () => {
    const world = makeWorldFromGrid([
      '..............',
      '......S.......',
      '..............',
    ])
    const grid = world.get(Grid)!
    const stoneIdx = 1 * grid.cols + 6
    expect((grid.flags[stoneIdx]! & FLAG_DISTURBED) !== 0).toBe(false)
    // Excluding an unrelated cell so the stone is not in the exclude set.
    markCellAndNeighborsDirtyExcept(world, 5, 1, new Set<number>([99999]))
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
    markCellAndNeighborsDirtyExcept(world, 5, 1, new Set<number>([stoneIdx]))
    // Excluded — must NOT be disturbed.
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
