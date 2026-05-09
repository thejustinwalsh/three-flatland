import { describe, expect, it } from 'vitest'
import { rockAvalancheSystem, resetAvalanche, braceShakingCluster } from '../src/systems/hazard'
import {
  FLAG_DISTURBED,
  FLAG_FALLING,
  FLAG_SHAKING,
  Grid,
  TILE_AIR,
  TILE_STONE,
} from '../src/traits'
import { ROCK_BRACE_EXTEND_TICKS } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function disturbAllStones(world: ReturnType<typeof makeWorldFromGrid>): void {
  const grid = world.get(Grid)!
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] === TILE_STONE) grid.flags[i]! |= FLAG_DISTURBED
  }
}

function tickUntilSomeShaking(
  world: ReturnType<typeof makeWorldFromGrid>,
  maxTicks: number,
): boolean {
  const grid = world.get(Grid)!
  for (let i = 0; i < maxTicks; i++) {
    tickWorld(world, 1)
    rockAvalancheSystem(world)
    for (let j = 0; j < grid.tiles.length; j++) {
      if (grid.tiles[j] === TILE_STONE && (grid.flags[j]! & FLAG_SHAKING) !== 0) {
        return true
      }
    }
  }
  return false
}

/**
 * Plan 1 item C — rock brace.
 *
 * The mouse-brace one-touch action extends to SHAKING rock clusters.
 * Codex rule 5: an in-motion (FLAG_FALLING) cluster cannot be braced
 * — once started, rocks resolve fully.
 */

describe('mouse-brace on shaking rock cluster', () => {
  it('braces a shaking 4-cluster — delays the cluster commit', () => {
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '......#.......',
      '..............',
    ])
    disturbAllStones(world)
    resetAvalanche()

    const gotShaking = tickUntilSomeShaking(world, 30)
    expect(gotShaking, 'cluster should enter SHAKING phase before brace').toBe(true)

    // Snapshot state at brace-time.
    const grid = world.get(Grid)!
    const beforeStoneRows: number[] = []
    for (let r = 0; r < grid.rows; r++) {
      if (grid.tiles[r * grid.cols + 6] === TILE_STONE) beforeStoneRows.push(r)
    }
    expect(beforeStoneRows).toEqual([0, 1, 2, 3])

    // Brace — should succeed for a shaking cluster.
    const braced = braceShakingCluster(world, 6, 0, ROCK_BRACE_EXTEND_TICKS)
    expect(braced, 'brace should succeed for a shaking cluster cell').toBe(true)

    // Run for 30 ticks (the original telegraph length); cluster should
    // STILL be at rows 0-3 because the brace pushed the start tick
    // forward. Without the brace, the cluster would have committed by
    // now.
    for (let i = 0; i < 30; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
    }
    const stillAtTop = grid.tiles[0 * grid.cols + 6] === TILE_STONE
    expect(stillAtTop, 'cluster should still be at original position after brace').toBe(true)
  })

  it('refuses to brace an in-motion cluster (codex rule 5)', () => {
    // Set up cluster, let it commit and start falling. Then try to
    // brace one of its FLAG_FALLING cells — must return false.
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
    disturbAllStones(world)
    resetAvalanche()

    // Tick past the telegraph + first commit so cells are FALLING.
    // Telegraph is 120 ticks (90 SHAKE + 30 SETTLE); allow margin
    // for the first commit step too.
    let foundFalling: { col: number; row: number } | null = null
    const grid = world.get(Grid)!
    for (let i = 0; i < 200 && !foundFalling; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
      for (let r = 0; r < grid.rows; r++) {
        const idx = r * grid.cols + 6
        if (grid.tiles[idx] === TILE_STONE && (grid.flags[idx]! & FLAG_FALLING) !== 0) {
          foundFalling = { col: 6, row: r }
          break
        }
      }
    }
    expect(foundFalling, 'cluster should be in motion before brace attempt').not.toBeNull()

    const braced = braceShakingCluster(
      world,
      foundFalling!.col,
      foundFalling!.row,
      ROCK_BRACE_EXTEND_TICKS,
    )
    expect(braced, 'brace must refuse an in-motion (FALLING) cluster').toBe(false)
  })

  it('refuses to brace a non-shaking, non-falling stone cell', () => {
    // A 4-stack that is DISTURBED but hasn't entered shake yet —
    // brace should refuse.
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      'SSSSSSSSSSSSSS', // bedrock — cluster blocked, never enters telegraph commit, but might shake
    ])
    disturbAllStones(world)
    resetAvalanche()
    // Don't tick — at tick 0 nothing has SHAKING set yet.
    const braced = braceShakingCluster(world, 6, 0, ROCK_BRACE_EXTEND_TICKS)
    expect(braced, 'brace must refuse a non-SHAKING cell').toBe(false)
  })

  it('refuses to brace an AIR cell', () => {
    const world = makeWorldFromGrid([
      '..............',
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '......#.......',
    ])
    disturbAllStones(world)
    resetAvalanche()
    // (0, 0) is AIR — brace must refuse regardless of state.
    const braced = braceShakingCluster(world, 0, 0, ROCK_BRACE_EXTEND_TICKS)
    expect(braced, 'brace must refuse AIR cells').toBe(false)
  })
})
