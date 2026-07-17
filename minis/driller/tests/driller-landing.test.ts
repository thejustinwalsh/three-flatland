import { describe, expect, it } from 'vitest'
import {
  FALL_ANIMATION_START_ROWS,
  LANDING_STUN_MS,
  LANDING_STUN_START_ROWS,
  TILE_PX,
} from '../src/constants'
import { drillerSystem } from '../src/systems/driller'
import { Animation, Driller, PlannerTarget } from '../src/traits'
import { makeWorldFromGrid } from './_world-helper'

describe('driller landing', () => {
  it('keeps a short diagonal drop in the idle pose', () => {
    const world = makeWorldFromGrid(['....', '....', '....', '####'])
    const entity = world.spawn(
      Driller({
        col: 1,
        row: 0,
        px: TILE_PX + TILE_PX / 2,
        py: TILE_PX / 2,
        destCol: 1,
        destRow: 0,
        facing: 1,
      }),
      PlannerTarget({ col: 3, row: 3, reservedAtTick: 0 }),
      Animation({ state: 'idle', frame: 0, frameAccumMs: 0 })
    )

    drillerSystem(world, 100)

    expect(entity.get(Driller)!.destCol).toBe(2)
    expect(entity.get(Driller)!.destRow).toBe(1)
    expect(entity.get(Animation)!.state).toBe('idle')
  })

  it('starts the looping fall animation on the third row', () => {
    const world = makeWorldFromGrid(['...', '...', '...', '...', '###'])
    const entity = world.spawn(
      Driller({
        col: 1,
        row: 0,
        px: TILE_PX + TILE_PX / 2,
        py: TILE_PX / 2,
        destCol: 1,
        destRow: 0,
      }),
      Animation({ state: 'idle', frame: 0, frameAccumMs: 0 })
    )

    drillerSystem(world, 800)

    expect(entity.get(Driller)!.fallStartRow).toBe(0)
    expect(entity.get(Driller)!.destRow).toBeGreaterThanOrEqual(FALL_ANIMATION_START_ROWS)
    expect(entity.get(Animation)!.state).toBe('fall')
  })

  it('lands a one-to-three-row drop without a timeout penalty', () => {
    const world = makeWorldFromGrid(['...', '...', '###'])
    const entity = world.spawn(
      Driller({
        col: 1,
        row: 0,
        px: TILE_PX + TILE_PX / 2,
        py: TILE_PX / 2,
        destCol: 1,
        destRow: 0,
        facing: 1,
      }),
      Animation({ state: 'idle', frame: 0, frameAccumMs: 0 })
    )

    // One generous simulation slice reaches row 1 and still leaves enough
    // budget to resolve the newly encountered support tile.
    drillerSystem(world, 400)

    const landed = entity.get(Driller)!
    expect(landed.row).toBe(1)
    expect(landed.py).toBe(TILE_PX + TILE_PX / 2)
    expect(landed.destRow).toBe(1)
    expect(landed.landingStunMs).toBe(0)
    expect(landed.fallStartRow).toBe(-1)
    expect(entity.get(Animation)!.state).toBe('idle')
  })

  it('holds after a drop longer than three rows for the authored landing sequence', () => {
    const airRows = Array.from({ length: LANDING_STUN_START_ROWS + 1 }, () => '...')
    const world = makeWorldFromGrid([...airRows, '###'])
    const entity = world.spawn(
      Driller({
        col: 1,
        row: 0,
        px: TILE_PX + TILE_PX / 2,
        py: TILE_PX / 2,
        destCol: 1,
        destRow: 0,
        facing: 1,
      }),
      Animation({ state: 'idle', frame: 0, frameAccumMs: 0 })
    )

    drillerSystem(world, 2_000)

    const landed = entity.get(Driller)!
    expect(landed.row).toBe(LANDING_STUN_START_ROWS)
    expect(landed.landingStunMs).toBe(LANDING_STUN_MS)
    expect(entity.get(Animation)!.state).toBe('land')

    drillerSystem(world, 100)
    expect(entity.get(Driller)!.landingStunMs).toBe(LANDING_STUN_MS - 100)
    expect(entity.get(Driller)!.py).toBe(LANDING_STUN_START_ROWS * TILE_PX + TILE_PX / 2)
    expect(entity.get(Animation)!.state).toBe('land')

    drillerSystem(world, LANDING_STUN_MS - 100)
    expect(entity.get(Driller)!.landingStunMs).toBe(0)
    expect(entity.get(Animation)!.state).toBe('land')

    drillerSystem(world, 1)
    expect(entity.get(Animation)!.state).toBe('idle')
  })
})
