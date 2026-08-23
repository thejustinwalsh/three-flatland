import { describe, expectTypeOf, it } from 'vitest'
import {
  added,
  changed,
  createWorld,
  select,
  trait,
  type Entity,
  type EventSelector,
  type NumericTrait,
  type ObjectTrait,
  type Selector,
  type TagTrait,
} from './index'

describe('private Flatland runtime types', () => {
  it('infers widened numeric schemas and exact direct stores', () => {
    const Position = trait({ x: 0, y: 1 })
    const ConstPosition = trait({ x: 0, y: 1 } as const)
    const world = createWorld()
    const entity = world.spawn(Position({ x: 2 }))

    expectTypeOf(Position).toEqualTypeOf<NumericTrait<{ x: number; y: number }>>()
    expectTypeOf(ConstPosition).toMatchTypeOf<NumericTrait<{ readonly x: number; readonly y: number }>>()
    expectTypeOf(world.read(entity, Position)).toEqualTypeOf<{ x: number; y: number } | undefined>()
    expectTypeOf(world.store(Position)).toEqualTypeOf<{ readonly x: number[]; readonly y: number[] }>()
    world.store(Position).x[0] = 3
    world.patch(entity, Position, { x: 4 })

    // @ts-expect-error — initializer keys are schema-bound
    Position({ z: 1 })
    // @ts-expect-error — numeric fields remain numeric
    Position({ x: 'wrong' })
    // @ts-expect-error — explicit undefined is not a numeric field value
    Position({ x: undefined })
    // @ts-expect-error — patches reject unknown fields
    world.patch(entity, Position, { z: 1 })
    // @ts-expect-error — patches reject wrong value types
    world.patch(entity, Position, { x: false })
    // @ts-expect-error — numeric patches reject explicit undefined
    world.patch(entity, Position, { x: undefined })
  })

  it('infers exact object factories and shallow initializers', () => {
    const Settings = trait(() => ({ name: '', nested: { enabled: true } }))
    const world = createWorld()
    const entity = world.spawn(Settings({ name: 'flatland' }))

    expectTypeOf(Settings).toEqualTypeOf<ObjectTrait<{ name: string; nested: { enabled: boolean } }>>()
    expectTypeOf(world.read(entity, Settings)).toEqualTypeOf<
      { name: string; nested: { enabled: boolean } } | undefined
    >()
    world.patch(entity, Settings, { nested: { enabled: false } })

    // @ts-expect-error — object initializers reject unknown keys
    Settings({ missing: true })
    // @ts-expect-error — nested values are shallow, not recursively partial
    Settings({ nested: {} })
    // @ts-expect-error — object-backed traits do not expose numeric stores
    world.store(Settings)
  })

  it('keeps tags, entities, traits, and selectors nominal', () => {
    const Active = trait()
    const Position = trait({ x: 0 })
    const Positioned = select(Position)
    const AddedPosition = added(Position)
    const ChangedPosition = changed({ any: [Position] })
    const world = createWorld()
    const entity = world.spawn(Active, Position)

    expectTypeOf(Active).toEqualTypeOf<TagTrait>()
    expectTypeOf(entity).toEqualTypeOf<Entity>()
    expectTypeOf(Positioned).toEqualTypeOf<Selector>()
    expectTypeOf(AddedPosition).toEqualTypeOf<EventSelector>()
    expectTypeOf(ChangedPosition).toEqualTypeOf<EventSelector>()
    expectTypeOf(world.view(Positioned)).toEqualTypeOf<readonly Entity[]>()
    expectTypeOf(world.drain(AddedPosition)).toEqualTypeOf<readonly Entity[]>()
    expectTypeOf(world.read(entity, Active)).toEqualTypeOf<undefined>()

    // @ts-expect-error — tag traits do not expose numeric stores
    world.store(Active)
    // @ts-expect-error — tags are presence-only and cannot be patched
    world.patch(entity, Active, {})
    // @ts-expect-error — ordinary and event selectors are not interchangeable
    world.view(AddedPosition)
    // @ts-expect-error — ordinary and event selectors are not interchangeable
    world.drain(Positioned)
    // @ts-expect-error — only event selectors can be activated
    world.activate(Positioned)
    // @ts-expect-error — packed entities are branded
    world.isAlive(123)
    // @ts-expect-error — arbitrary objects cannot forge trait handles
    world.has(entity, { id: 1, kind: 'tag' })
    // @ts-expect-error — initializers can only be created by calling their trait
    world.add(entity, { trait: Position, initial: { x: 2 } })
  })

  it('rejects unsupported declarations and mutable borrowed views', () => {
    const symbolField = Symbol('field')
    const Position = trait({ x: 0 })
    const Positioned = select(Position)
    const AddedPosition = added(Position)
    const world = createWorld()
    const view = world.view(Positioned)
    const events = world.drain(AddedPosition)

    // @ts-expect-error — nested numeric schemas are unsupported
    trait({ nested: { x: 0 } })
    // @ts-expect-error — arrays are unsupported numeric fields
    trait({ values: [0, 1] })
    // @ts-expect-error — non-number schema fields are unsupported
    trait({ active: true })
    // @ts-expect-error — numeric stores have string keys only
    trait({ [symbolField]: 0 })
    // @ts-expect-error — object factories must return objects
    trait(() => 42)
    // @ts-expect-error — selectors require at least one trait
    select()
    // @ts-expect-error — changed selectors require at least one observed trait
    changed({ any: [] })
    // @ts-expect-error — borrowed views are readonly
    view.push(world.spawn(Position))
    // @ts-expect-error — borrowed event queues are readonly
    events.splice(0, 1)
    // @ts-expect-error — borrowed views reject indexed assignment
    view[0] = world.spawn(Position)
  })
})
