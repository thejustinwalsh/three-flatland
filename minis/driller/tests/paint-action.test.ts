import { describe, it, expect } from 'vitest'
import { commitAction, pointerHeldTick } from '../src/systems/input'
import {
  Driller,
  FLAG_AUTOTILE_DIRTY,
  GameState,
  Grid,
  Mood,
  PetEvents,
  Pointer,
} from '../src/traits'
import { PAINT_ANCHOR_BUMP, PAINT_COST_PER_TICK } from '../src/constants'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Paint replaces the old `trigger` action: click-and-hold to
 * accelerate a soil cell's anchor-distance toward collapse.
 *
 *   - Each commit: anchorDist += PAINT_ANCHOR_BUMP, gems -= PAINT_COST_PER_TICK.
 *   - Cell tagged FLAG_AUTOTILE_DIRTY so the renderer redraws decay.
 *   - Held-pointer ticks re-fire paint each game tick via pointerHeldTick.
 *   - No double-charge if the cell is already FLAG_SAGGING (chunk
 *     already in the pipeline).
 */

function setupPaintWorld() {
  // 10-wide, row 2 is solid soil (paintable).
  const world = makeWorldFromGrid([
    '..........',
    '..........',
    '##########',
    '##########',
    '##########',
  ])
  world.spawn(
    Driller({ col: 9, row: 0 }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    PetEvents({ recentTicks: [] }),
  )
  world.add(Pointer({}))
  return world
}

describe('doPaint', () => {
  it('bumps anchorDist by PAINT_ANCHOR_BUMP and costs PAINT_COST_PER_TICK gems', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, { hoverTargetCol: 5, hoverTargetRow: 2 })
    const grid = world.get(Grid)!
    const idx = 2 * grid.cols + 5
    const beforeAnchor = grid.anchorDist[idx] ?? 0
    const ok = commitAction(world, 'paint', null)
    expect(ok).toBe(true)
    expect(world.get(GameState)!.gems).toBe(10 - PAINT_COST_PER_TICK)
    expect(grid.anchorDist[idx]).toBe(Math.min(255, beforeAnchor + PAINT_ANCHOR_BUMP))
    expect((grid.flags[idx]! & FLAG_AUTOTILE_DIRTY) !== 0).toBe(true)
  })

  it('refuses on a non-soil cell', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, { hoverTargetCol: 5, hoverTargetRow: 0 }) // AIR
    const ok = commitAction(world, 'paint', null)
    expect(ok).toBe(false)
    expect(world.get(GameState)!.gems).toBe(10)
  })

  it('refuses when out of gems', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 0 })
    world.set(Pointer, { hoverTargetCol: 5, hoverTargetRow: 2 })
    const ok = commitAction(world, 'paint', null)
    expect(ok).toBe(false)
  })

  it('caps anchor distance at 255', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 999 })
    world.set(Pointer, { hoverTargetCol: 5, hoverTargetRow: 2 })
    const grid = world.get(Grid)!
    const idx = 2 * grid.cols + 5
    grid.anchorDist[idx] = 250
    commitAction(world, 'paint', null)
    expect(grid.anchorDist[idx]).toBe(255)
  })
})

describe('pointerHeldTick', () => {
  it('ticks paint each frame while button is held on a soil cell', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, {
      active: true,
      hoverTargetCol: 5,
      hoverTargetRow: 2,
      hoverAction: 'paint',
    })
    const grid = world.get(Grid)!
    const idx = 2 * grid.cols + 5
    const before = grid.anchorDist[idx] ?? 0
    // Run the held tick 3 times → 3 paint commits.
    for (let i = 0; i < 3; i++) pointerHeldTick(world)
    expect(grid.anchorDist[idx]).toBe(Math.min(255, before + 3 * PAINT_ANCHOR_BUMP))
    expect(world.get(GameState)!.gems).toBe(10 - 3 * PAINT_COST_PER_TICK)
  })

  it('is a no-op when pointer is not active', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, {
      active: false,
      hoverTargetCol: 5,
      hoverTargetRow: 2,
      hoverAction: 'paint',
    })
    pointerHeldTick(world)
    expect(world.get(GameState)!.gems).toBe(10)
  })
})
