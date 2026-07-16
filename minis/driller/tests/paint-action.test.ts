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
  TILE_AIR,
  TILE_SOIL,
} from '../src/traits'
import { PAINT_COST_PER_TICK } from '../src/constants'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Paint replaces the old `trigger` action: click-and-hold to
 * INSTANTLY destroy soil cells.
 *
 *   - Each commit: tile SOIL → AIR, gems -= PAINT_COST_PER_TICK.
 *   - Cell tagged FLAG_AUTOTILE_DIRTY so the renderer redraws.
 *   - Held-pointer ticks re-fire paint each game tick via pointerHeldTick.
 *   - Anchor recomputation handled by the existing relaxation pass
 *     on the next tick — paint just opens holes, the sag detector
 *     observes any new overhangs and routes them through SHAKE → FALL.
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
    PetEvents({ recentTicks: [] })
  )
  world.add(Pointer({}))
  return world
}

describe('doPaint', () => {
  it('destroys the soil cell and costs PAINT_COST_PER_TICK gems', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, { hoverTargetCol: 5, hoverTargetRow: 2 })
    const grid = world.get(Grid)!
    const idx = 2 * grid.cols + 5
    expect(grid.tiles[idx]).toBe(TILE_SOIL)
    const ok = commitAction(world, 'paint', null)
    expect(ok).toBe(true)
    expect(world.get(GameState)!.gems).toBe(10 - PAINT_COST_PER_TICK)
    expect(grid.tiles[idx]).toBe(TILE_AIR)
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

  it('does not re-destroy an already-destroyed cell', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, { hoverTargetCol: 5, hoverTargetRow: 2 })
    commitAction(world, 'paint', null)
    const okSecond = commitAction(world, 'paint', null)
    expect(okSecond).toBe(false) // cell is AIR now
    expect(world.get(GameState)!.gems).toBe(10 - PAINT_COST_PER_TICK)
  })
})

describe('pointerHeldTick', () => {
  it('ticks paint each frame while button is held on a soil cell (mode lock = paint)', () => {
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    const grid = world.get(Grid)!
    for (let c = 4; c <= 6; c++) {
      world.set(Pointer, {
        active: true,
        hoverTargetCol: c,
        hoverTargetRow: 2,
        hoverAction: 'paint',
        lockedAction: 'paint',
      })
      pointerHeldTick(world)
    }
    for (let c = 4; c <= 6; c++) {
      expect(grid.tiles[2 * grid.cols + c]).toBe(TILE_AIR)
    }
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
      lockedAction: 'paint',
    })
    pointerHeldTick(world)
    expect(world.get(GameState)!.gems).toBe(10)
  })

  it('mode lock: pressing a falling chunk then dragging onto soil does NOT consume paint', () => {
    // The user pressed down on a SHAKING/FALLING chunk (lockedAction
    // = 'drag'). Their cursor then crosses a soil cell — paint must
    // NOT fire because the press was bound to drag.
    const world = setupPaintWorld()
    world.set(GameState, { gems: 10 })
    world.set(Pointer, {
      active: true,
      hoverTargetCol: 5,
      hoverTargetRow: 2,
      hoverAction: 'paint', // cursor IS over soil now (re-resolved)
      lockedAction: 'drag', // but the press was on a falling chunk
    })
    pointerHeldTick(world)
    expect(world.get(GameState)!.gems).toBe(10)
    expect(world.get(Grid)!.tiles[2 * world.get(Grid)!.cols + 5]).toBe(TILE_SOIL)
  })
})
