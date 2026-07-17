import { describe, expect, it } from 'vitest'
import { EXPLOSION_RADIUS, TILE_PX } from '../src/constants'
import { planEvadeTriggeredExplosive, plannerTick } from '../src/systems/ai-planner'
import { Driller, Explosive, PlannerTarget } from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

function spawnBomb(
  world: ReturnType<typeof makeWorldFromGrid>,
  col: number,
  row: number,
  triggered = true
) {
  return world.spawn(Explosive({ col, row, triggered, fuseRemaining: triggered ? 90 : 0 }))
}

describe('armed explosive evasion', () => {
  it('flees horizontally when a triggered bomb is directly below', () => {
    const world = makeWorldFromGrid(['...........', '...........', '.....X.....', '###########'])
    spawnBomb(world, 5, 2)

    const next = planEvadeTriggeredExplosive(world, { col: 5, row: 1, facing: 1 })

    expect(next).toEqual([9, 1])
    expect(Math.abs(next![0] - 5)).toBeGreaterThan(EXPLOSION_RADIUS)
  })

  it('ignores an untriggered bomb', () => {
    const world = makeWorldFromGrid(['...........', '...........', '.....X.....'])
    spawnBomb(world, 5, 2, false)

    expect(planEvadeTriggeredExplosive(world, { col: 5, row: 1, facing: 1 })).toBeNull()
  })

  it('keeps the same escape side while crossing the blast envelope', () => {
    const world = makeWorldFromGrid(['...........', '...........', '.....X.....', '###########'])
    spawnBomb(world, 5, 2)

    expect(planEvadeTriggeredExplosive(world, { col: 5, row: 1, facing: 1 })).toEqual([9, 1])
    expect(planEvadeTriggeredExplosive(world, { col: 6, row: 1, facing: 1 })).toEqual([9, 1])
  })

  it('overrides greedy drilling toward an armed bomb', () => {
    const world = makeWorldFromGrid(['...........', '...........', '.....X.....', '###########'])
    const driller = world.spawn(
      Driller({
        col: 5,
        row: 1,
        px: 5 * TILE_PX + TILE_PX / 2,
        py: TILE_PX + TILE_PX / 2,
        destCol: 5,
        destRow: 1,
        facing: 1,
      })
    )
    spawnBomb(world, 5, 2)

    plannerTick(world)

    expect(driller.get(PlannerTarget)).toMatchObject({ col: 9, row: 1 })
  })

  it('holds instead of drilling toward a bomb when fixtures block escape', () => {
    const world = makeWorldFromGrid(['...........', '....F.F....', '.....X.....', '###########'])
    spawnBomb(world, 5, 2)

    expect(planEvadeTriggeredExplosive(world, { col: 5, row: 1, facing: 1 })).toEqual([5, 1])
  })
})
