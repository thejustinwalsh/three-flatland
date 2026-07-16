import { describe, expect, it } from 'vitest'
import { TILE_PX } from '../src/constants'
import { drillerSystem } from '../src/systems/driller'
import { Animation, Driller, PlannerTarget } from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

describe('horizontal drill alignment', () => {
  it.each([
    { direction: 'left', startCol: 3, targetCol: 2, facing: -1, state: 'drillLeft' },
    { direction: 'right', startCol: 1, targetCol: 2, facing: 1, state: 'drillRight' },
  ] as const)('starts drilling $direction from the exact owned-cell centre', (scenario) => {
    const world = makeWorldFromGrid(['..#..', '#####'])
    const centerX = scenario.startCol * TILE_PX + TILE_PX / 2
    const centerY = TILE_PX / 2
    const driller = world.spawn(
      Driller({
        col: scenario.startCol,
        row: 0,
        px: centerX,
        py: centerY,
        destCol: scenario.startCol,
        destRow: 0,
        facing: scenario.facing,
      }),
      PlannerTarget({ col: scenario.targetCol, row: 0 }),
      Animation()
    )

    drillerSystem(world, 1000 / 60)

    expect(driller.get(Driller)).toMatchObject({
      col: scenario.startCol,
      row: 0,
      px: centerX,
      py: centerY,
      drillCol: scenario.targetCol,
      drillRow: 0,
      facing: scenario.facing,
    })
    expect(driller.get(Driller)!.drillCooldownMs).toBeGreaterThan(0)
    expect(driller.get(Animation)!.state).toBe(scenario.state)
  })
})
