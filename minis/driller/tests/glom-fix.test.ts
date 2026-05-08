import { describe, expect, it } from 'vitest'
import { rockAvalancheSystem, resetAvalanche } from '../src/systems/hazard'
import {
  FLAG_DISTURBED,
  FLAG_FALLING,
  Grid,
  TILE_AIR,
  TILE_STONE,
} from '../src/traits'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function disturbAllStones(world: ReturnType<typeof makeWorldFromGrid>): void {
  const grid = world.get(Grid)!
  for (let i = 0; i < grid.tiles.length; i++) {
    if (grid.tiles[i] === TILE_STONE) grid.flags[i]! |= FLAG_DISTURBED
  }
}

function disturbStonesAt(world: ReturnType<typeof makeWorldFromGrid>, idxs: number[]): void {
  const grid = world.get(Grid)!
  for (const i of idxs) {
    if (grid.tiles[i] === TILE_STONE) grid.flags[i]! |= FLAG_DISTURBED
  }
}

/**
 * Plan 1 item B — glom-fix.
 *
 * Codex rule 5 ("rocks resolve fully once started") combined with
 * rule 4 ("survivors keep falling until they land") implies:
 *
 *   When a falling cluster collides with a static stone or stone
 *   cluster, the 4-connected union forms a SINGLE merged cluster.
 *   If that merged cluster can still fall (its bottom edge is over
 *   AIR / SOIL), the union must keep falling — no telegraph, no
 *   stop-and-restart. The static stones get pulled along.
 *
 *   If the union CANNOT fall (its bottom edge is over fixture /
 *   rock / world floor), the cluster lands inert — clearing
 *   FLAG_FALLING / FLAG_DISTURBED so it requires fresh disturbance
 *   + 4+ to move again (rule 7).
 */

describe('glom-fix — falling cluster + static stone merge behavior', () => {
  it('falling 4-cluster lands on a static stone above SOIL → merged cluster keeps falling', () => {
    // Falling 4-cluster at rows 0-3 col 6.
    // AIR gap at rows 4-5.
    // Static lone stone at row 6 col 6 (sub-threshold on its own).
    // SOIL beneath the static at rows 7-9.
    // AIR at row 10.
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '..............',
      '..............',
      '......S.......',
      '......#.......',
      '......#.......',
      '......#.......',
      '..............',
    ])
    // Only the FALLING cluster is disturbed; the static stone is not.
    // The system has to figure out via flood-fill that the merged
    // cluster carries inMotion forward.
    const grid = world.get(Grid)!
    const fallingTopIdx = 0 * grid.cols + 6
    const fallingBottomIdx = 3 * grid.cols + 6
    disturbStonesAt(world, [fallingTopIdx, fallingBottomIdx])
    resetAvalanche()

    let everSawMerge = false
    let lowestStoneRow = -1
    for (let i = 0; i < 400; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
      let fallingInCol = 0
      for (let r = 0; r < grid.rows; r++) {
        const idx = r * grid.cols + 6
        if (grid.tiles[idx] === TILE_STONE) {
          if ((grid.flags[idx]! & FLAG_FALLING) !== 0) fallingInCol++
          if (r > lowestStoneRow) lowestStoneRow = r
        }
      }
      if (fallingInCol >= 5) everSawMerge = true
    }
    expect(
      everSawMerge,
      'Falling cluster + static stone should merge into a 5-cluster mid-flight (FLAG_FALLING propagates).',
    ).toBe(true)
    // The originally-static stone was at row 6. After the merged cluster
    // settles, the bottom of the cluster must be in row 7+ (it must
    // have crushed at least one soil cell and pushed the static down).
    expect(
      lowestStoneRow,
      'The merged cluster should crush soil and push at least one stone past the original static-stone row.',
    ).toBeGreaterThan(6)
  })

  it('falling 4-cluster lands on a static stone with no support → merged cluster lands inert', () => {
    // Falling 4-cluster at rows 0-3 col 6.
    // AIR gap at rows 4-5.
    // Static stone at row 6 col 6 sitting directly above bedrock at row 7.
    // No soil below — the merged cluster cannot continue falling.
    const world = makeWorldFromGrid([
      '......S.......',
      '......S.......',
      '......S.......',
      '......S.......',
      '..............',
      '..............',
      '......S.......',
      'SSSSSSSSSSSSSS', // bedrock floor — merged cluster blocked here
    ])
    const grid = world.get(Grid)!
    disturbStonesAt(world, [0 * grid.cols + 6, 3 * grid.cols + 6])
    resetAvalanche()

    for (let i = 0; i < 400; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
    }

    // After settle: every stone should be inert (no FLAG_FALLING anywhere).
    let stillFalling = 0
    let stillDisturbed = 0
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_STONE) {
        if ((grid.flags[i]! & FLAG_FALLING) !== 0) stillFalling++
        if ((grid.flags[i]! & FLAG_DISTURBED) !== 0) stillDisturbed++
      }
    }
    expect(
      stillFalling,
      'After landing on bedrock, no stone should retain FLAG_FALLING.',
    ).toBe(0)
    expect(
      stillDisturbed,
      'After landing inert, FLAG_DISTURBED must clear (rule 7).',
    ).toBe(0)
  })
})
