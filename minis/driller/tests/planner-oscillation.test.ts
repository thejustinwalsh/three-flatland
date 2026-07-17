import { describe, expect, it } from 'vitest'
import { PLAN_COMMIT_TICKS, TILE_PX } from '../src/constants'
import { plannerTick } from '../src/systems/ai-planner'
import { Driller, GameState, Gem, PlannerTarget } from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

describe('planner motion commitment', () => {
  it('does not immediately reverse into the cell it just left', () => {
    const world = makeWorldFromGrid(['.........', '.........', '#########'])
    const driller = world.spawn(
      Driller({
        col: 5,
        row: 1,
        px: 5 * TILE_PX + TILE_PX / 2,
        py: TILE_PX + TILE_PX / 2,
        destCol: 5,
        destRow: 1,
        facing: -1,
      })
    )
    const leftGem = world.spawn(Gem({ col: 3, row: 1 }))

    plannerTick(world)
    expect(driller.get(PlannerTarget)).toMatchObject({ col: 4, row: 1 })

    driller.set(Driller, {
      col: 4,
      row: 1,
      px: 4 * TILE_PX + TILE_PX / 2,
      destCol: 4,
      destRow: 1,
      facing: -1,
    })
    leftGem.destroy()
    world.spawn(Gem({ col: 6, row: 1 }))
    world.set(GameState, { tick: 1 })

    plannerTick(world)

    expect(driller.get(PlannerTarget)).toMatchObject({ col: 4, row: 2 })
  })

  it('forces direct descent after lateral gem pursuit stops gaining depth', () => {
    const world = makeWorldFromGrid(['.........', '.........', '#########'])
    const driller = world.spawn(
      Driller({
        col: 4,
        row: 1,
        px: 4 * TILE_PX + TILE_PX / 2,
        py: TILE_PX + TILE_PX / 2,
        destCol: 4,
        destRow: 1,
        facing: 1,
      })
    )
    world.spawn(Gem({ col: 7, row: 1 }))

    plannerTick(world)
    expect(driller.get(PlannerTarget)).toMatchObject({ col: 5, row: 1 })

    world.set(GameState, { tick: PLAN_COMMIT_TICKS * 2 })
    plannerTick(world)

    expect(driller.get(PlannerTarget)).toMatchObject({ col: 4, row: 2 })
  })
})
