import { worldFor } from './ecs/testUtils.type-test'
import { describe, expect, it } from 'vitest'
import { Flatland } from './Flatland'
import { select, type World } from './ecs/runtime'
import { BatchRegistry } from './ecs/traits'

const BatchRegistries = select(BatchRegistry)

describe('Flatland expectedSprites', () => {
  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid constructor hint %s',
    (expectedSprites) => {
      expect(() => new Flatland({ expectedSprites })).toThrow('expectedSprites must be a non-negative safe integer')
    }
  )

  it('forwards the constructor hint into its SpriteGroup and private world', () => {
    const flatland = new Flatland({ expectedSprites: 32 })
    const world = worldFor(flatland) as World
    const registryEntity = world.view(BatchRegistries)[0]!
    const registry = world.read(registryEntity, BatchRegistry)!

    expect(world.capacity).toBeGreaterThanOrEqual(32)
    expect(registry.spriteArr).toHaveLength(world.capacity)
    expect(registry.batchSlots).toHaveLength(1)

    flatland.dispose()
    expect(world.capacity).toBe(0)
    expect(registry.spriteArr).toHaveLength(0)
    expect(registry.batchSlots).toHaveLength(0)
  })
})
