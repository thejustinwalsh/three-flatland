import { describe, expect, it } from 'vitest'
import { nextCapacity } from '../../internal/capacity'
import { reserveWorld } from '../../internal/reserved-world'
import { added, createWorld, select, trait, type Entity } from './index'

describe('private ECS advisory capacity', () => {
  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
    'rejects invalid expected entity capacity %s',
    (expectedEntities) => {
      const world = createWorld()
      expect(() => reserveWorld(world, expectedEntities)).toThrow(/expectedEntities/)
      world.dispose()
    }
  )

  it('rejects an impossible growth request instead of returning an undersized capacity', () => {
    expect(() => nextCapacity(4, 5, 4)).toThrow(/intrinsic maximum/)
  })

  it('reserves hot index structures, grows geometrically, and preserves stable stores', () => {
    const Position = trait({ x: 0, y: 0 })
    const Inventory = trait(() => ({ items: [] as number[] }))
    const Renderable = trait()
    const Renderables = select(Renderable, Position)
    const AddedRenderable = added(Renderable, Position)
    const world = createWorld()

    const positionStore = world.store(Position)
    const x = positionStore.x
    world.view(Renderables)
    world.activate(AddedRenderable)
    reserveWorld(world, 4)
    const entities: Entity[] = []
    for (let index = 0; index < 4; index++) {
      entities.push(world.spawn(Position({ x: index }), Inventory, Renderable))
    }

    expect(world.capacity).toBe(4)
    expect(x).toHaveLength(4)
    expect(world.store(Position).x).toBe(x)
    expect(world.view(Renderables)).toHaveLength(4)
    expect(world.drain(AddedRenderable)).toHaveLength(4)

    entities.push(world.spawn(Position({ x: 4 }), Inventory, Renderable))
    expect(world.capacity).toBe(8)
    expect(x).toHaveLength(8)

    for (let index = 5; index < 12; index++) {
      entities.push(world.spawn(Position({ x: index }), Inventory, Renderable))
    }
    expect(world.capacity).toBe(16)
    expect(world.view(Renderables)).toHaveLength(12)

    for (const entity of entities) world.destroy(entity)
    const capacityAfterDestroy = world.capacity
    for (let index = 0; index < 4; index++) world.spawn(Position, Inventory, Renderable)
    expect(world.capacity).toBe(capacityAfterDestroy)

    world.dispose()
    expect(world.capacity).toBe(0)
    expect(x).toHaveLength(0)
  })
})
