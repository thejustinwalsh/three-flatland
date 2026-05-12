import { describe, it, expect } from 'vitest'
import { commitAction } from '../src/systems/input'
import {
  Driller,
  FLAG_FALLING,
  FLAG_SHAKING,
  GameState,
  Grid,
  Mood,
  PetEvents,
  Pointer,
  TILE_STONE,
} from '../src/traits'
import { SHAKE_COST } from '../src/constants'
import { makeWorldFromGrid } from './_world-helper'

function setupShakeWorld() {
  // 3-cell stone cluster in a row, AIR below (so falling makes sense).
  const world = makeWorldFromGrid([
    '..........',
    '..........',
    '..SSS.....',
    '..........',
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

describe('doShake', () => {
  it('drops the whole cluster into falling and costs 1 gem', () => {
    const world = setupShakeWorld()
    world.set(GameState, { gems: 5 })
    world.set(Pointer, { hoverTargetCol: 3, hoverTargetRow: 2 })
    const ok = commitAction(world, 'shake', null)
    expect(ok).toBe(true)
    expect(world.get(GameState)!.gems).toBe(5 - SHAKE_COST)
  })

  it('sets FLAG_FALLING on every cluster sibling', () => {
    const world = setupShakeWorld()
    world.set(GameState, { gems: 5 })
    world.set(Pointer, { hoverTargetCol: 3, hoverTargetRow: 2 })
    commitAction(world, 'shake', null)
    const grid = world.get(Grid)!
    for (const c of [2, 3, 4]) {
      const idx = 2 * grid.cols + c
      expect(grid.tiles[idx]).toBe(TILE_STONE)
      expect((grid.flags[idx]! & FLAG_FALLING) !== 0).toBe(true)
      expect((grid.flags[idx]! & FLAG_SHAKING) === 0).toBe(true)
    }
  })

  it('refuses when no gems available', () => {
    const world = setupShakeWorld()
    world.set(GameState, { gems: 0 })
    world.set(Pointer, { hoverTargetCol: 3, hoverTargetRow: 2 })
    const ok = commitAction(world, 'shake', null)
    expect(ok).toBe(false)
    const grid = world.get(Grid)!
    expect((grid.flags[2 * grid.cols + 3]! & FLAG_FALLING) === 0).toBe(true)
  })

  it('refuses on a non-stone cell', () => {
    const world = setupShakeWorld()
    world.set(GameState, { gems: 5 })
    world.set(Pointer, { hoverTargetCol: 0, hoverTargetRow: 2 })
    const ok = commitAction(world, 'shake', null)
    expect(ok).toBe(false)
    expect(world.get(GameState)!.gems).toBe(5)
  })

  it('refuses on a stone already in motion', () => {
    const world = setupShakeWorld()
    world.set(GameState, { gems: 5 })
    const grid = world.get(Grid)!
    const idx = 2 * grid.cols + 3
    grid.flags[idx] = grid.flags[idx]! | FLAG_FALLING
    world.set(Pointer, { hoverTargetCol: 3, hoverTargetRow: 2 })
    const ok = commitAction(world, 'shake', null)
    expect(ok).toBe(false)
  })
})
