import { describe, expect, it } from 'vitest'
import { Flatland } from './Flatland'
import type { World } from './ecs/runtime'
import { observeCapacityGrowth, type CapacityGrowthEvent } from './internal/capacity'

describe('Flatland expectedSprites', () => {
  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid constructor hint %s',
    (expectedSprites) => {
      expect(() => new Flatland({ expectedSprites })).toThrow('expectedSprites must be a non-negative safe integer')
    }
  )

  it('forwards the constructor hint into its SpriteGroup and private world', () => {
    const flatland = new Flatland({ expectedSprites: 32 })
    const events: CapacityGrowthEvent[] = []
    const stop = observeCapacityGrowth(flatland.spriteGroup, (event) => events.push(event))
    const world = flatland.world as World

    expect(world.capacity).toBeGreaterThanOrEqual(32)
    expect(events).toContainEqual(
      expect.objectContaining({
        subsystem: 'ecs.entity-index',
        reason: 'hint',
      })
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        subsystem: 'registry.sprite-index',
        reason: 'hint',
      })
    )

    stop()
    flatland.dispose()
  })
})
