import { describe, expect, it } from 'vitest'
import { observeCapacityGrowth, type CapacityGrowthEvent } from '../../internal/capacity'
import { added, createWorld, select, trait, type Entity } from './index'

describe('private ECS advisory capacity', () => {
  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
    'rejects invalid expected entity capacity %s',
    (expectedEntities) => {
      expect(() => createWorld({ expectedEntities })).toThrow(/expectedEntities/)
    }
  )

  it('reserves activated index structures, then grows geometrically without becoming a cap', () => {
    const owner = {}
    const events: CapacityGrowthEvent[] = []
    const stop = observeCapacityGrowth(owner, (event) => events.push(event))
    const Position = trait({ x: 0, y: 0 })
    const Inventory = trait(() => ({ items: [] as number[] }))
    const Renderable = trait()
    const Renderables = select(Renderable, Position)
    const AddedRenderable = added(Renderable, Position)
    const world = createWorld({ capacityOwner: owner, expectedEntities: 4 })

    world.store(Position)
    world.view(Renderables)
    world.activate(AddedRenderable)
    const entities: Entity[] = []
    for (let index = 0; index < 4; index++) {
      entities.push(world.spawn(Position({ x: index }), Inventory, Renderable))
    }

    expect(world.capacity).toBe(4)
    expect(events.filter((event) => event.reason === 'growth')).toHaveLength(0)
    expect(world.view(Renderables)).toHaveLength(4)
    expect(world.drain(AddedRenderable)).toHaveLength(4)

    entities.push(world.spawn(Position({ x: 4 }), Inventory, Renderable))
    expect(world.capacity).toBe(8)
    const growth = events.filter((event) => event.reason === 'growth')
    expect(growth.length).toBeGreaterThan(0)
    expect(growth.every((event) => event.previous === 4 && event.next === 8)).toBe(true)

    for (let index = 5; index < 12; index++) {
      entities.push(world.spawn(Position({ x: index }), Inventory, Renderable))
    }
    expect(world.capacity).toBe(16)
    expect(world.view(Renderables)).toHaveLength(12)

    for (const entity of entities) world.destroy(entity)
    const growthAfterDestroy = events.filter((event) => event.reason === 'growth').length
    for (let index = 0; index < 4; index++) world.spawn(Position, Inventory, Renderable)
    expect(events.filter((event) => event.reason === 'growth')).toHaveLength(growthAfterDestroy)

    world.dispose()
    stop()
  })
})
