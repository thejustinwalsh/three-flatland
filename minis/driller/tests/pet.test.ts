import { describe, it, expect } from 'vitest'
import { commitAction } from '../src/systems/input'
import { Driller, GameState, Mood, PetEvents } from '../src/traits'
import { OVER_PET_THRESHOLD, PET_COST, PET_PAUSE_TICKS } from '../src/constants'
import { makeWorldFromGrid } from './_world-helper'

/**
 * Pet reform regression:
 *   - costs PET_COST gems per pet
 *   - pauses driller for PET_PAUSE_TICKS
 *   - >OVER_PET_THRESHOLD pets in window → fear spike + instant unpause
 *   - no gems → no pet
 */

function makeWorld() {
  const world = makeWorldFromGrid(['..........', '##########'])
  world.spawn(
    Driller({ col: 5, row: 0, destCol: 5, destRow: 0 }),
    Mood({ greed: 0.2, fear: 0.1, drive: 0.7, planner: 'greedy', switchAtTick: 0, trust: 0 }),
    PetEvents({ recentTicks: [] }),
  )
  return world
}

describe('doPet', () => {
  it('pauses the driller and costs 1 gem', () => {
    const world = makeWorld()
    world.set(GameState, { gems: 5 })
    const ok = commitAction(world, 'pet', null)
    expect(ok).toBe(true)
    expect(world.get(GameState)!.gems).toBe(5 - PET_COST)
    const d = world.queryFirst(Driller)!.get(Driller)!
    expect(d.pausedUntilTick).toBe(PET_PAUSE_TICKS) // tick=0 + PET_PAUSE_TICKS
  })

  it('refuses to pet when no gems available', () => {
    const world = makeWorld()
    world.set(GameState, { gems: 0 })
    const ok = commitAction(world, 'pet', null)
    expect(ok).toBe(false)
    const d = world.queryFirst(Driller)!.get(Driller)!
    expect(d.pausedUntilTick).toBe(0)
  })

  it('over-pet clears pause and spikes fear', () => {
    const world = makeWorld()
    world.set(GameState, { gems: 99 })
    // Pet OVER_PET_THRESHOLD+1 times in rapid succession.
    for (let i = 0; i < OVER_PET_THRESHOLD + 1; i++) commitAction(world, 'pet', null)
    const d = world.queryFirst(Driller)!.get(Driller)!
    const m = world.queryFirst(Mood)!.get(Mood)!
    expect(d.pausedUntilTick).toBe(0) // instant unpause on over-pet
    expect(m.fear).toBeGreaterThan(0.1) // fear bumped above baseline
  })

  it('each pet refreshes the pause window', () => {
    const world = makeWorld()
    world.set(GameState, { gems: 5 })
    const drillerEntity = world.queryFirst(Driller)!
    commitAction(world, 'pet', null)
    const firstPause = drillerEntity.get(Driller)!.pausedUntilTick
    // Advance time, then pet again — the new pause should extend.
    world.set(GameState, { tick: 30 })
    commitAction(world, 'pet', null)
    const secondPause = drillerEntity.get(Driller)!.pausedUntilTick
    expect(secondPause).toBe(30 + PET_PAUSE_TICKS)
    expect(secondPause).toBeGreaterThan(firstPause)
  })
})
