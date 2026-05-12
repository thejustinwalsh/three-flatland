import { describe, it, expect } from 'vitest'
import { resolveHoverAction } from '../src/systems/input'
import { Drag, Driller, Gem, Grid, Mood, PetEvents, Pointer } from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Hover-action priority + gem touch-target halo.
 *
 * Resolution priority (high → low):
 *   1. Active drag → 'drag' (locks every cell)
 *   2. Gem exact-cell OR ±1 halo → 'collect'
 *   3. Pet (driller's cell)
 *   4. Drag (this cell is in motion)
 *   5. Brace
 *   6. Paint
 *   7. None
 */

function setup() {
  const world = makeWorldFromGrid([
    '..........',
    '..........',
    '##########',
    '##########',
  ])
  world.spawn(
    Driller({ col: 5, row: 0 }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    PetEvents({ recentTicks: [] }),
  )
  world.add(Pointer({}))
  world.add(Drag({ clusterId: 0, anchorCol: 0, anchorRow: 0, startTick: 0, intervalsCharged: 0 }))
  return world
}

describe('resolveHoverAction priority', () => {
  it('returns drag for every cell while a drag is active', () => {
    const world = setup()
    world.set(Drag, { clusterId: 1 })
    expect(resolveHoverAction(world, 0, 0).action).toBe('drag')
    expect(resolveHoverAction(world, 5, 2).action).toBe('drag') // soil
    expect(resolveHoverAction(world, 5, 0).action).toBe('drag') // driller
  })

  it('gem in exact cell beats pet, beats paint', () => {
    const world = setup()
    const gem = world.spawn(Gem({ col: 5, row: 0, color: 'emerald', size: 'small' })) // driller's cell
    const { action, gemEntity } = resolveHoverAction(world, 5, 0)
    expect(action).toBe('collect')
    expect(gemEntity).toBe(gem)
  })

  it('gem in 8-neighbor halo collects on adjacent click', () => {
    const world = setup()
    const gem = world.spawn(Gem({ col: 5, row: 2, color: 'emerald', size: 'small' }))
    // Click one cell to the right of the gem — should still collect.
    const { action, gemEntity } = resolveHoverAction(world, 6, 2)
    expect(action).toBe('collect')
    expect(gemEntity).toBe(gem)
  })

  it('gem halo does NOT extend past Chebyshev 1', () => {
    const world = setup()
    world.spawn(Gem({ col: 5, row: 2, color: 'emerald', size: 'small' }))
    // Click two cells away — must not resolve to collect.
    expect(resolveHoverAction(world, 7, 2).action).toBe('paint')
  })

  it('exact-cell gem wins over halo neighbor gem', () => {
    const world = setup()
    const exact = world.spawn(Gem({ col: 5, row: 2, color: 'emerald', size: 'small' }))
    world.spawn(Gem({ col: 6, row: 2, color: 'topaz', size: 'small' })) // also adjacent
    const { gemEntity } = resolveHoverAction(world, 5, 2)
    expect(gemEntity).toBe(exact)
  })

  it('pet wins over paint when no gem is nearby', () => {
    const world = setup()
    expect(resolveHoverAction(world, 5, 0).action).toBe('pet')
  })

  it('paint wins on soil when no gem / pet / brace applies', () => {
    const world = setup()
    expect(resolveHoverAction(world, 0, 2).action).toBe('paint')
  })
})
