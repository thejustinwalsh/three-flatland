import { describe, it, expect } from 'vitest'
import { dragSystem, endDrag, startDrag } from '../src/systems/drag'
import {
  Drag,
  FLAG_FALLING,
  FLAG_SHAKING,
  GameState,
  Grid,
  Pointer,
  TILE_AIR,
  TILE_STONE,
} from '../src/traits'
import { DRAG_COST_INTERVAL_TICKS, DRAG_COST_PER_INTERVAL } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function setupDragWorld() {
  // Single 3-cell stone cluster in row 2; AIR above and below for
  // movement room. Cluster id is auto-assigned by the helper.
  const world = makeWorldFromGrid([
    '..........',
    '..........',
    '...SSS....',
    '..........',
    '##########',
  ])
  world.add(Drag({ clusterId: 0, anchorCol: 0, anchorRow: 0, startTick: 0, intervalsCharged: 0 }))
  world.add(Pointer({}))
  return world
}

describe('drag', () => {
  it('startDrag captures the cluster id and pauses gravity', () => {
    const world = setupDragWorld()
    const grid = world.get(Grid)!
    // Pre-arm FLAG_FALLING so we can verify it gets cleared.
    for (const c of [3, 4, 5]) {
      grid.flags[2 * grid.cols + c] = FLAG_FALLING | FLAG_SHAKING
    }
    const ok = startDrag(world, 4, 2)
    expect(ok).toBe(true)
    const drag = world.get(Drag)!
    expect(drag.clusterId).toBe(grid.clusterId[2 * grid.cols + 4])
    expect(drag.anchorCol).toBe(4)
    expect(drag.anchorRow).toBe(2)
    for (const c of [3, 4, 5]) {
      const f = grid.flags[2 * grid.cols + c]!
      expect((f & FLAG_FALLING) === 0).toBe(true)
      expect((f & FLAG_SHAKING) === 0).toBe(true)
    }
  })

  it('refuses to start drag on a non-stone cell', () => {
    const world = setupDragWorld()
    const ok = startDrag(world, 0, 0) // AIR
    expect(ok).toBe(false)
    expect(world.get(Drag)!.clusterId).toBe(0)
  })

  it('translates the cluster when the pointer moves to a free target', () => {
    const world = setupDragWorld()
    world.set(GameState, { gems: 99 })
    startDrag(world, 4, 2)
    const grid = world.get(Grid)!
    // Move pointer one row down.
    world.set(Pointer, { active: true, hoverTargetCol: 4, hoverTargetRow: 3 })
    dragSystem(world)
    // Original row should be AIR now; new row should be STONE.
    for (const c of [3, 4, 5]) {
      expect(grid.tiles[2 * grid.cols + c]).toBe(TILE_AIR)
      expect(grid.tiles[3 * grid.cols + c]).toBe(TILE_STONE)
    }
    // Anchor follows.
    expect(world.get(Drag)!.anchorRow).toBe(3)
  })

  it('refuses to translate when a target cell is occupied (collision)', () => {
    const world = setupDragWorld()
    world.set(GameState, { gems: 99 })
    const grid = world.get(Grid)!
    // Place an obstacle directly below the cluster.
    grid.tiles[3 * grid.cols + 4] = TILE_STONE
    startDrag(world, 4, 2)
    world.set(Pointer, { active: true, hoverTargetCol: 4, hoverTargetRow: 3 })
    dragSystem(world)
    // Cluster should NOT have moved.
    for (const c of [3, 4, 5]) {
      expect(grid.tiles[2 * grid.cols + c]).toBe(TILE_STONE)
    }
  })

  it('rockAvalancheSystem skips the held cluster (gravity stays paused mid-drag)', async () => {
    // Without this skip, the avalanche re-applies FLAG_FALLING every
    // tick to any mid-air cluster — undoing the drag's flag-clear
    // pause and making the cluster un-pauseable.
    const { rockAvalancheSystem } = await import('../src/systems/hazard')
    const world = setupDragWorld()
    world.set(GameState, { gems: 99 })
    startDrag(world, 4, 2)
    const grid = world.get(Grid)!
    // Sanity: starts paused.
    for (const c of [3, 4, 5]) {
      const f = grid.flags[2 * grid.cols + c]!
      expect((f & FLAG_FALLING) === 0).toBe(true)
    }
    // Run the avalanche several ticks. It must NOT re-add FLAG_FALLING.
    for (let i = 0; i < 5; i++) {
      tickWorld(world, 1)
      rockAvalancheSystem(world)
    }
    for (const c of [3, 4, 5]) {
      const f = grid.flags[2 * grid.cols + c]!
      expect((f & FLAG_FALLING) === 0).toBe(true)
      expect((f & FLAG_SHAKING) === 0).toBe(true)
    }
  })

  it('endDrag re-arms FLAG_FALLING on the cluster', () => {
    const world = setupDragWorld()
    startDrag(world, 4, 2)
    endDrag(world)
    const grid = world.get(Grid)!
    for (const c of [3, 4, 5]) {
      const f = grid.flags[2 * grid.cols + c]!
      expect((f & FLAG_FALLING) !== 0).toBe(true)
    }
    expect(world.get(Drag)!.clusterId).toBe(0)
  })

  it('charges gems each crossed cost interval and releases on insolvency', () => {
    const world = setupDragWorld()
    world.set(GameState, { gems: 1 }) // only enough for 1 interval
    world.set(Pointer, { active: true, hoverTargetCol: 4, hoverTargetRow: 2 })
    startDrag(world, 4, 2)
    // Advance time across two intervals — second interval costs more
    // than 1 gem (1 + 1*scale = 2), so we run out and release.
    for (let i = 0; i <= 2 * DRAG_COST_INTERVAL_TICKS; i++) {
      tickWorld(world, 1)
      dragSystem(world)
    }
    // First interval charged 1 gem → now 0.
    // Second interval needed 2 gems → insolvent → drag ended.
    expect(world.get(Drag)!.clusterId).toBe(0)
    // The single interval-worth of gems was actually billed before
    // release; the cluster cells should be back to falling.
    expect(world.get(GameState)!.gems).toBe(1 - DRAG_COST_PER_INTERVAL)
  })

  it('auto-releases when the pointer goes inactive', () => {
    const world = setupDragWorld()
    world.set(GameState, { gems: 99 })
    startDrag(world, 4, 2)
    world.set(Pointer, { active: false })
    dragSystem(world)
    expect(world.get(Drag)!.clusterId).toBe(0)
  })
})
