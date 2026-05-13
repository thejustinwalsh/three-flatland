import { describe, it, expect } from 'vitest'
import { gemExpirySystem } from '../src/systems/gem-expiry'
import { commitAction } from '../src/systems/input'
import { Driller, GameState, Gem, Mood, PetEvents, Pointer } from '../src/traits'
import { GEM_FADE_TICKS, PAINT_COST_PER_TICK } from '../src/constants'
import { makeWorldFromGrid, tickWorld } from './_world-helper'

function setupGemWorld() {
  // Row 3 mostly SOIL (paintable) with the gem at (5,3) in a small AIR
  // pocket. Paint targets col 0 / col 1 on row 3 (SOIL cells).
  const world = makeWorldFromGrid([
    '..........',
    '..........',
    '..........',
    '##########',
    '..........',
    '##########',
  ])
  world.spawn(Gem({ col: 5, row: 3, color: 'emerald', size: 'small', collected: false, scatteredUntilTick: 0 }))
  world.spawn(
    Driller({ col: 9, row: 0 }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    PetEvents({ recentTicks: [] }),
  )
  world.add(Pointer({}))
  return world
}

describe('gem expiry', () => {
  it('destroys an armed gem at expireAtTick', () => {
    const world = setupGemWorld()
    const gemEntity = world.queryFirst(Gem)!
    world.set(GameState, { tick: 0 })
    gemEntity.set(Gem, { expireAtTick: 10 })
    // Advance time past the expiry, run the system.
    for (let i = 0; i <= 10; i++) {
      tickWorld(world, 1)
      gemExpirySystem(world)
    }
    expect(world.queryFirst(Gem)).toBe(undefined)
  })

  it('leaves an un-armed gem alone (expireAtTick === 0)', () => {
    const world = setupGemWorld()
    world.set(GameState, { tick: 1000 })
    gemExpirySystem(world)
    expect(world.queryFirst(Gem)).not.toBe(undefined)
  })

  it('paint on the gem row arms expireAtTick', () => {
    const world = setupGemWorld()
    world.set(GameState, { gems: 10, tick: 5 })
    world.set(Pointer, { hoverTargetCol: 0, hoverTargetRow: 3 })
    const ok = commitAction(world, 'paint', null)
    expect(ok).toBe(true)
    // Gems deducted by paint cost.
    expect(world.get(GameState)!.gems).toBe(10 - PAINT_COST_PER_TICK)
    const g = world.queryFirst(Gem)!.get(Gem)!
    expect(g.expireAtTick).toBe(5 + GEM_FADE_TICKS)
  })

  it('paint on a different row leaves the gem alone', () => {
    // Add a soil cell on row 2 specifically for this test.
    const world = setupGemWorld()
    world.set(GameState, { gems: 10, tick: 5 })
    // Row 2 is all AIR (no soil to paint there). Use row 5 which has SOIL.
    world.set(Pointer, { hoverTargetCol: 0, hoverTargetRow: 5 })
    commitAction(world, 'paint', null)
    const g = world.queryFirst(Gem)!.get(Gem)!
    // Gem is on row 3, paint hit row 5 → no arming.
    expect(g.expireAtTick).toBe(0)
  })

  it('collect value scales by gem size: small=1, medium=3, large=5, huge=10', () => {
    const cases: Array<{ size: 'small' | 'medium' | 'large' | 'huge'; value: number }> = [
      { size: 'small', value: 1 },
      { size: 'medium', value: 3 },
      { size: 'large', value: 5 },
      { size: 'huge', value: 10 },
    ]
    for (const { size, value } of cases) {
      const world = setupGemWorld()
      world.set(GameState, { gems: 0 })
      const e = world.spawn(Gem({ col: 7, row: 0, color: 'emerald', size, collected: false, scatteredUntilTick: 0 }))
      commitAction(world, 'collect', e)
      expect(world.get(GameState)!.gems).toBe(value)
    }
  })

  it('does not re-arm an already-armed gem (paint twice on same row)', () => {
    const world = setupGemWorld()
    world.set(GameState, { gems: 10, tick: 5 })
    world.set(Pointer, { hoverTargetCol: 0, hoverTargetRow: 3 })
    commitAction(world, 'paint', null)
    const firstExpire = world.queryFirst(Gem)!.get(Gem)!.expireAtTick
    world.set(GameState, { tick: 20 })
    world.set(Pointer, { hoverTargetCol: 1, hoverTargetRow: 3 })
    commitAction(world, 'paint', null)
    const secondExpire = world.queryFirst(Gem)!.get(Gem)!.expireAtTick
    // Second paint should NOT extend the deadline — pressure stays on.
    expect(secondExpire).toBe(firstExpire)
  })
})
