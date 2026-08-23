import { describe, expect, it } from 'vitest'
import { nextCapacity } from '../../internal/capacity'
import { reserveWorld } from '../../internal/reserved-world'
import { ENTITY_INDEX_STRIDE } from './entity'
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

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, ENTITY_INDEX_STRIDE + 1])(
    'rejects direct invalid world reservation %s atomically',
    (capacity) => {
      const Position = trait({ x: 0 })
      const world = createWorld()
      world.reserve(4)
      const x = world.store(Position).x

      expect(() => world.reserve(capacity)).toThrow(/reserved capacity/)
      expect(world.capacity).toBe(4)
      expect(x).toHaveLength(4)
      world.dispose()
    }
  )

  it('rejects reservation after disposal, including an otherwise harmless no-op', () => {
    const world = createWorld()
    world.reserve(4)
    world.dispose()

    expect(() => world.reserve(0)).toThrow(/World disposed/)
    expect(world.capacity).toBe(0)
  })

  it('rejects reservation reentrancy from trait preparation without consuming capacity or an entity', () => {
    const Present = trait()
    const world = createWorld()
    world.reserve(4)
    const Reserving = trait(() => {
      world.reserve(4)
      return { value: 1 }
    })

    expect(() => world.spawn(Present, Reserving)).toThrow(/Trait inputs cannot access mutable world state/)
    expect(world.capacity).toBe(4)
    const entity = world.spawn(Present)
    expect(world.index(entity)).toBe(0)
    expect(world.has(entity, Reserving)).toBe(false)
    world.dispose()
  })

  it('reserves hot index structures, grows geometrically, and preserves stable stores', () => {
    const Position = trait({ x: 0, y: 0 })
    const LateState = trait({ value: 1 })
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
    const lateValues = world.store(LateState).value
    expect(lateValues).toHaveLength(4)
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
    expect(lateValues).toHaveLength(8)

    for (let index = 5; index < 12; index++) {
      entities.push(world.spawn(Position({ x: index }), Inventory, Renderable))
    }
    expect(world.capacity).toBe(16)
    expect(lateValues).toHaveLength(16)
    expect(world.view(Renderables)).toHaveLength(12)

    for (const entity of entities) world.destroy(entity)
    const capacityAfterDestroy = world.capacity
    for (let index = 0; index < 4; index++) world.spawn(Position, Inventory, Renderable)
    expect(world.capacity).toBe(capacityAfterDestroy)

    world.dispose()
    expect(world.capacity).toBe(0)
    expect(x).toHaveLength(0)
    expect(lateValues).toHaveLength(0)
  })
})
