import { describe, expect, it } from 'vitest'
import { rockAvalancheSystem, resetAvalanche } from '../src/systems/hazard'
import { FLAG_DISTURBED, FLAG_FALLING, Grid, TILE_AIR, TILE_STONE } from '../src/traits'
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

describe('glom-fix — falling cluster + static stone independence', () => {
  it('falling 4-cluster landing on a different-cluster static stone STOPS', () => {
    // Cluster-id-aware avalanche: a falling cluster (cluster_id A)
    // and a static stone (cluster_id B, allocated separately by the
    // test helper) are INDEPENDENT. When A lands on B, A goes inert
    // — it doesn't merge into a 5-cluster, doesn't keep falling. The
    // 4×4 doom-block cap is enforced at placement time via cluster
    // ids, not via mid-flight merging.
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
    const grid = world.get(Grid)!
    const fallingTopIdx = 0 * grid.cols + 6
    const fallingBottomIdx = 3 * grid.cols + 6
    disturbStonesAt(world, [fallingTopIdx, fallingBottomIdx])
    resetAvalanche()

    for (let i = 0; i < 400; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
    }
    // After settle: no FLAG_FALLING on any stone (independent
    // clusters both at rest).
    let stillFalling = 0
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_STONE && (grid.flags[i]! & FLAG_FALLING) !== 0) {
        stillFalling++
      }
    }
    expect(
      stillFalling,
      'Both clusters should be at rest after the falling one lands on the static one.'
    ).toBe(0)
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
    // Diffusion model retired the DISTURBED concept — anchor distance
    // drives stability, no per-cluster disturbance bit needed.
    let stillFalling = 0
    for (let i = 0; i < grid.tiles.length; i++) {
      if (grid.tiles[i] === TILE_STONE) {
        if ((grid.flags[i]! & FLAG_FALLING) !== 0) stillFalling++
      }
    }
    expect(stillFalling, 'After landing on bedrock, no stone should retain FLAG_FALLING.').toBe(0)
  })
})
