import { describe, expect, it } from 'vitest'
import { TILE_PX } from '../src/constants'
import { plannerTick } from '../src/systems/ai-planner'
import { deathSystem } from '../src/systems/death'
import { drillerSystem } from '../src/systems/driller'
import { resetStreaming, streamChunks } from '../src/systems/generation'
import { resetRun } from '../src/systems/run-lifecycle'
import {
  Animation,
  Driller,
  Drag,
  GameState,
  Gem,
  Grid,
  Hazard,
  PlannerTarget,
  Pointer,
  Seed,
} from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

describe('full-mode run lifecycle', () => {
  it('rebuilds a playable Driller after game over and pressing again', () => {
    const world = makeWorldFromGrid(['..................', '##################'])
    world.add(Seed({ value: 1 }))
    world.add(Pointer())
    world.add(Drag())
    world.set(GameState, {
      mode: 'full',
      runState: 'dying',
      tick: 100,
      gems: 9,
      lives: 1,
      depthM: 80,
      deepestM: 80,
      worldNumber: 1,
    })
    world.spawn(
      Driller({
        col: 9,
        row: 0,
        px: 9 * TILE_PX + TILE_PX / 2,
        py: TILE_PX / 2,
        destCol: 9,
        destRow: 0,
      }),
      Animation(),
      PlannerTarget()
    )
    world.spawn(Gem({ col: 3, row: 0 }))
    world.spawn(Hazard({ col: 9, phase: 'warning' }))

    // Enter the death state so reset must also clear module-owned phase data.
    deathSystem(world)
    resetRun(world, { seed: 0x1234 })

    const resetState = world.get(GameState)!
    expect(resetState).toMatchObject({
      mode: 'full',
      runState: 'attract',
      tick: 0,
      gems: 0,
      lives: 3,
      depthM: 0,
      deepestM: 0,
      worldNumber: 0,
    })
    expect(world.get(Seed)!.value).toBe(0x1234)
    expect(world.get(Grid)).toMatchObject({ rows: 0, topRow: 0, bottomRow: 0 })
    expect(countDrillers(world)).toBe(1)
    expect(countGems(world)).toBe(0)
    expect(countHazards(world)).toBe(0)

    // A stale death phase used to reap the replacement Driller shortly after
    // restart. Advancing well beyond that timer must leave the new entity alive.
    world.set(GameState, { runState: 'playing', tick: 1_000 })
    deathSystem(world)
    expect(countDrillers(world)).toBe(1)

    // Exercise the same first simulation work that follows "tap to begin".
    world.set(GameState, { tick: 1 })
    streamChunks(world, 0)
    plannerTick(world)
    drillerSystem(world, 1000 / 60)

    const driller = world.queryFirst(Driller)?.get(Driller)
    expect(driller).toBeDefined()
    expect(driller!.drillCooldownMs).toBeGreaterThan(0)
    expect(world.get(GameState)!.runState).toBe('playing')

    resetStreaming()
  })
})

function countDrillers(world: ReturnType<typeof makeWorldFromGrid>): number {
  let total = 0
  world.query(Driller).forEach(() => total++)
  return total
}

function countGems(world: ReturnType<typeof makeWorldFromGrid>): number {
  let total = 0
  world.query(Gem).forEach(() => total++)
  return total
}

function countHazards(world: ReturnType<typeof makeWorldFromGrid>): number {
  let total = 0
  world.query(Hazard).forEach(() => total++)
  return total
}
