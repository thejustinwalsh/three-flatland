import { describe, expect, it } from 'vitest'
import { planEvadeMovingStoneCluster } from '../src/systems/ai-planner'
import { FLAG_FALLING, FLAG_SHAKING, Grid } from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Plan 1 item D — AI evades in-motion / shaking rock clusters.
 *
 * Mirrors planEvadeFallingChunk: identify threatened columns above
 * the driller, return the closest passable safe column, or null if
 * driller is not in danger.
 */

function setFlag(
  world: ReturnType<typeof makeWorldFromGrid>,
  cells: Array<{ col: number; row: number }>,
  flag: number
): void {
  const grid = world.get(Grid)!
  for (const cell of cells) {
    const idx = cell.row * grid.cols + cell.col
    grid.flags[idx]! |= flag
  }
}

describe('planEvadeMovingStoneCluster', () => {
  it('returns null when no rock cluster is in motion or shaking', () => {
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '......#.......',
      '..............',
    ])
    // No FALLING / SHAKING bits → no threat.
    const next = planEvadeMovingStoneCluster(world, { col: 6, row: 4 })
    expect(next).toBeNull()
  })

  it('returns a side-step when a SHAKING cluster is directly above the driller', () => {
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '......#.......', // soil at driller-row col 6 (would be drilled)
      '..............',
    ])
    setFlag(
      world,
      [
        { col: 6, row: 0 },
        { col: 6, row: 1 },
        { col: 6, row: 2 },
        { col: 6, row: 3 },
      ],
      FLAG_SHAKING
    )
    const next = planEvadeMovingStoneCluster(world, { col: 6, row: 4 })
    expect(next).not.toBeNull()
    expect(next![1]).toBe(4) // same row
    // Should be at least 2 cols away (cluster halo is ±1, so col 5 and
    // col 7 are also threatened).
    expect(Math.abs(next![0] - 6)).toBeGreaterThanOrEqual(2)
  })

  it('returns a side-step when a FALLING cluster is directly above the driller', () => {
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '..............',
      '..............',
      '......#.......',
      '..............',
    ])
    setFlag(
      world,
      [
        { col: 6, row: 0 },
        { col: 6, row: 1 },
      ],
      FLAG_FALLING
    )
    const next = planEvadeMovingStoneCluster(world, { col: 6, row: 4 })
    expect(next).not.toBeNull()
    expect(Math.abs(next![0] - 6)).toBeGreaterThanOrEqual(2)
  })

  it('ignores clusters BELOW the driller (already past)', () => {
    const world = makeWorldFromGrid([
      '..............',
      '..............',
      '..............',
      '..............',
      '..............',
      '......S.......',
      '......S.......',
      '......S.......',
    ])
    setFlag(
      world,
      [
        { col: 6, row: 5 },
        { col: 6, row: 6 },
        { col: 6, row: 7 },
      ],
      FLAG_FALLING
    )
    // Driller is at row 4; cluster is at rows 5-7 (below). Not a threat.
    const next = planEvadeMovingStoneCluster(world, { col: 6, row: 4 })
    expect(next).toBeNull()
  })

  it('halos to ±1 column — a cluster 1 col over still threatens', () => {
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '..............',
      '..............',
    ])
    setFlag(
      world,
      [
        { col: 6, row: 0 },
        { col: 6, row: 1 },
        { col: 6, row: 2 },
        { col: 6, row: 3 },
      ],
      FLAG_SHAKING
    )
    // Driller at col 5 (one col over from cluster center).
    // Per the halo, col 5 is threatened (cluster col 6 ± 1 = {5, 6, 7}).
    // The driller's own column being in threatenedCols sets `threatened`.
    const next = planEvadeMovingStoneCluster(world, { col: 5, row: 4 })
    expect(next).not.toBeNull()
    // Safe column must be outside the halo {5,6,7}.
    expect(next![0] <= 4 || next![0] >= 8).toBe(true)
  })

  it('returns null when driller is well away from the cluster', () => {
    const world = makeWorldFromGrid([
      'S.............',
      'S.............',
      'S.............',
      'S.............',
      '..............',
    ])
    setFlag(
      world,
      [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
        { col: 0, row: 2 },
        { col: 0, row: 3 },
      ],
      FLAG_SHAKING
    )
    // Driller far right. Threat halo is cols {-1, 0, 1}. Driller col 10 is safe.
    const next = planEvadeMovingStoneCluster(world, { col: 10, row: 4 })
    expect(next).toBeNull()
  })

  it('keeps one escape side while crossing the center of a wide threat', () => {
    const world = makeWorldFromGrid([
      '...........SS.....',
      '...........SS.....',
      '..................',
      '..................',
      '..................',
    ])
    setFlag(
      world,
      [
        { col: 11, row: 0 },
        { col: 12, row: 0 },
        { col: 11, row: 1 },
        { col: 12, row: 1 },
      ],
      FLAG_SHAKING
    )

    expect(planEvadeMovingStoneCluster(world, { col: 11, row: 4 })).toEqual([9, 4])
    expect(planEvadeMovingStoneCluster(world, { col: 12, row: 4 })).toEqual([9, 4])
  })
})
