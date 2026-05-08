import { describe, it, expect } from 'vitest'
import { collapseTick, detectAndSag } from '../src/systems/collapse'
import {
  Camera,
  Driller,
  FallingChunk,
  FLAG_SAG_RECHECK,
  FLAG_SAGGING,
  FLAG_SHAKING,
  Grid,
  SaggingChunk,
  TILE_AIR,
  TILE_SOIL,
} from '../src/traits'
import { markCellAndNeighborsDirty } from '../src/systems/autotile-pass'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

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

/** Simulate a single drill action: cell becomes AIR, neighbours
 *  marked via markCellAndNeighborsDirty (which tags SAG_RECHECK on
 *  4-neighbor SOIL cells). */
function drill(world: ReturnType<typeof makeWorldFromGrid>, col: number, row: number) {
  const grid = world.get(Grid)!
  grid.tiles[row * grid.cols + col] = TILE_AIR
  markCellAndNeighborsDirty(world, col, row)
}

describe('integration: drill + cantilever sag', () => {
  it('drilling one cell of a wall fully anchored on both sides does NOT sag', () => {
    // 14-wide world; wide soil wall touching both side walls. Drill
    // the cell at col 7, row 1. The chunk is now (row 1 minus col 7)
    // — still touching both side walls — middle distance from wall
    // is 6 cells, well within MAX_REACH=10. NO SAG.
    const world = makeWorldFromGrid([
      '..............',
      '##############',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    drill(world, 7, 1)
    detectAndSag(world)
    expect(countSagging(world)).toBe(0)
    expect(countShaking(world)).toBe(0)
  })

  it('drilling a single cell next to a small floating slab does not stuck-shake', () => {
    // Floating slab in the middle of an open area. Drilling a cell
    // adjacent to it (which is AIR already) should not cause the
    // slab to shake without falling — willFall guard handles this.
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '##############',
      'SSSSSSSSSSSSSS',
    ])
    // Slab at row 2 cols 2-7. SOIL row at row 3 fully spans.
    // Drilling at (4, 3) reveals AIR below the slab.
    drill(world, 4, 3)
    detectAndSag(world)
    // The slab is anchored to the side walls via row 3 was solid →
    // wait now it's drilled. The slab itself doesn't touch side walls,
    // so it's now potentially unstable. But its bottom (row 3) is
    // mostly SOIL (only col 4 is now AIR). willFall guard checks
    // bottom-edge of the SAG cells.
    // Either it sags or doesn't — we just want NO stuck shake without
    // resolution. After many ticks, if it sagged it must have either
    // released or remained stable.
    for (let i = 0; i < 200; i++) {
      tickWorld(world, 1)
      collapseTick(world)
    }
    // No leftover SHAKING — either it fell, or it never started.
    expect(countShaking(world)).toBe(0)
  })

  it('drilling does NOT spread SAG_RECHECK across the entire world', () => {
    // Drill one cell. After the next detectAndSag pass, only the
    // chunk containing the drilled cell's neighbors should have had
    // SAG_RECHECK fire and get cleared. Distant chunks must still
    // have FLAG_SAG_RECHECK = 0.
    const world = makeWorldFromGrid([
      '..............',
      '##############',
      '..............',
      '##############',
      'SSSSSSSSSSSSSS',
    ])
    drill(world, 7, 1)
    detectAndSag(world)
    // The chunk at row 3 (separate from row 1's chunk) should have
    // NO SAG_RECHECK on it because nothing near it changed.
    const grid = world.get(Grid)!
    for (let c = 0; c < grid.cols; c++) {
      const idx = 3 * grid.cols + c
      if (grid.tiles[idx] === TILE_SOIL) {
        expect(grid.flags[idx]! & FLAG_SAG_RECHECK).toBe(0)
      }
    }
  })

  it('a falling chunk landing on solid does not leave the landed cells shaking', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..######......',
      '..............',
      'SSSSSSSSSSSSSS',
    ])
    // Force the slab to sag immediately.
    const grid = world.get(Grid)!
    for (let c = 2; c < 8; c++) {
      grid.flags[2 * grid.cols + c]! |= FLAG_SAG_RECHECK
    }
    detectAndSag(world)
    // Run enough ticks for the sag to release and the FallingChunk
    // to land back on bedrock.
    for (let i = 0; i < 200; i++) {
      tickWorld(world, 1)
      collapseTick(world)
    }
    // Once the dust settles, no FallingChunk + no SHAKING.
    let chunks = 0
    world.query(FallingChunk).forEach(() => chunks++)
    expect(chunks).toBe(0)
    expect(countShaking(world)).toBe(0)
    expect(countSagging(world)).toBe(0)
  })
})
