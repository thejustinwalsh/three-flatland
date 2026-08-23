import { describe, expect, it } from 'vitest'
import { added, changed, createWorld, removed, select, trait, type AnyTrait, type Entity } from './index'

function asSet(values: readonly Entity[]): Set<Entity> {
  return new Set(values)
}

describe('private Flatland entity runtime', () => {
  it('stores numeric defaults and partial initializers in stable direct arrays', () => {
    const Position = trait({ x: 1, y: 2 })
    const world = createWorld()
    const store = world.store(Position)
    const x = store.x
    const y = store.y
    const first = world.spawn(Position)
    const second = world.spawn(Position({ x: 7 }))

    expect(world.read(first, Position)).toEqual({ x: 1, y: 2 })
    expect(world.read(second, Position)).toEqual({ x: 7, y: 2 })
    const snapshot = world.read(second, Position)!
    snapshot.x = 99
    expect(world.read(second, Position)).toEqual({ x: 7, y: 2 })
    expect(world.store(Position)).toBe(store)
    expect(world.store(Position).x).toBe(x)
    expect(world.store(Position).y).toBe(y)

    for (let index = 0; index < 256; index++) world.spawn(Position({ x: index }))
    expect(world.store(Position).x).toBe(x)
    expect(x[world.index(second)]).toBe(7)

    x[world.index(second)] = 11
    expect(world.read(second, Position)).toEqual({ x: 11, y: 2 })
    world.dispose()
    expect(x).toHaveLength(0)
    expect(y).toHaveLength(0)
  })

  it('creates isolated object values and shallow-merges initializers', () => {
    let factories = 0
    const Inventory = trait(() => {
      factories++
      return { items: [] as number[], owner: 'nobody' }
    })
    const world = createWorld()
    const first = world.spawn(Inventory)
    const second = world.spawn(Inventory({ owner: 'second' }))
    const firstValue = world.read(first, Inventory)!
    const secondValue = world.read(second, Inventory)!

    firstValue.items.push(42)
    expect(factories).toBe(2)
    expect(firstValue).not.toBe(secondValue)
    expect(secondValue).toEqual({ items: [], owner: 'second' })
    expect(world.read(first, Inventory)).toBe(firstValue)

    world.remove(first, Inventory)
    expect(world.read(first, Inventory)).toBeUndefined()
    world.destroy(second)
    expect(world.read(second, Inventory)).toBeUndefined()
    world.dispose()
  })

  it('keeps tag presence separate from its undefined value', () => {
    const Visible = trait()
    const world = createWorld()
    const entity = world.spawn(Visible)

    expect(world.has(entity, Visible)).toBe(true)
    expect(world.read(entity, Visible)).toBeUndefined()
    world.remove(entity, Visible)
    expect(world.has(entity, Visible)).toBe(false)
    world.dispose()
  })

  it('rejects invalid runtime schemas and initializers before mutation', () => {
    const symbolField = Symbol('field')
    const hiddenSchema = Object.defineProperty({}, 'x', { enumerable: false, value: 0 })
    const inheritedSchema = Object.create({ x: 0 }) as { x: number }
    expect(() => trait({ x: 0, nested: { y: 1 } } as never)).toThrow(/flat number fields/)
    expect(() => trait({ x: [] } as never)).toThrow(/flat number fields/)
    expect(() => trait({ x: true } as never)).toThrow(/flat number fields/)
    expect(() => trait({ [symbolField]: 0 } as never)).toThrow(/flat number fields/)
    expect(() => trait(hiddenSchema as { x: number })).toThrow(/flat number fields/)
    expect(() => trait(inheritedSchema)).toThrow(/flat number fields/)

    const Position = trait({ x: 0, y: 0 })
    const world = createWorld()
    const hiddenInitial = Object.defineProperty({}, 'x', { enumerable: false, value: 2 })
    const inheritedInitial = Object.create({ x: 2 }) as { x: number }
    expect(() => world.spawn(Position({ x: 2, invalid: 1 } as never))).toThrow(/Invalid numeric initializer/)
    expect(() => world.spawn(Position({ toString: 1 } as never))).toThrow(/Invalid numeric initializer/)
    expect(() => world.spawn(Position({ constructor: 1 } as never))).toThrow(/Invalid numeric initializer/)
    expect(() => world.spawn(Position({ x: 'wrong' } as never))).toThrow(/Invalid numeric initializer/)
    expect(() => world.spawn(Position(hiddenInitial as { x: number }))).toThrow(/Invalid numeric initializer/)
    expect(() => world.spawn(Position(inheritedInitial))).toThrow(/Invalid numeric initializer/)
    const entity = world.spawn(Position({ x: 3 }))
    expect(() => world.patch(entity, Position, { x: 4, invalid: 1 } as never)).toThrow(/Invalid numeric initializer/)
    expect(() => world.patch(entity, Position, hiddenInitial as { x: number })).toThrow(/Invalid numeric initializer/)
    expect(() => world.patch(entity, Position, inheritedInitial)).toThrow(/Invalid numeric initializer/)
    expect(world.read(entity, Position)).toEqual({ x: 3, y: 0 })
    world.dispose()
  })

  it('treats prototype-named numeric fields as owned schema data', () => {
    const PrototypeField = trait(Object.fromEntries([['__proto__', 3]]) as { __proto__: number })
    const world = createWorld()
    const store = world.store(PrototypeField)
    const field = store.__proto__
    const entity = world.spawn(PrototypeField(Object.fromEntries([['__proto__', 7]]) as { __proto__: number }))
    const snapshot = world.read(entity, PrototypeField)!

    expect(Object.hasOwn(store, '__proto__')).toBe(true)
    expect(field[world.index(entity)]).toBe(7)
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true)
    expect(snapshot.__proto__).toBe(7)
    world.dispose()
    expect(field).toHaveLength(0)
  })

  it('captures numeric schema defaults from validated data descriptors', () => {
    const schema = new Proxy(
      { x: 2 },
      {
        get(target, property, receiver) {
          return property === 'x' ? 'not-a-number' : Reflect.get(target, property, receiver)
        },
      }
    )
    const Position = trait(schema as { x: number })
    const world = createWorld()
    const entity = world.spawn(Position)

    expect(Position.defaults.x).toBe(2)
    expect(world.store(Position).x[world.index(entity)]).toBe(2)
    world.dispose()
  })

  it('captures numeric patches from data descriptors and rejects accessors atomically', () => {
    const Position = trait({ x: 0 })
    const ChangedPosition = changed({ any: [Position] })
    const world = createWorld()
    world.activate(ChangedPosition)
    const entity = world.spawn(Position)
    const divergent = new Proxy(
      { x: 3 },
      {
        get(target, property, receiver) {
          return property === 'x' ? 'not-a-number' : Reflect.get(target, property, receiver)
        },
      }
    )
    const accessor = Object.defineProperty({}, 'x', {
      enumerable: true,
      get: () => 7,
    })

    world.patch(entity, Position, divergent as { x: number })
    expect(world.read(entity, Position)).toEqual({ x: 3 })
    expect(world.drain(ChangedPosition)).toEqual([entity])
    expect(() => world.patch(entity, Position, accessor as { x: number })).toThrow(/Invalid numeric initializer/)
    expect(world.read(entity, Position)).toEqual({ x: 3 })
    expect(world.drain(ChangedPosition)).toHaveLength(0)
    world.dispose()
  })

  it('keeps failed factory operations structurally atomic', () => {
    const Present = trait()
    const PresentEntities = select(Present)
    const AddedPresent = added(Present)
    const Broken = trait((): { value: number } => {
      throw new Error('factory failed')
    })
    const world = createWorld()
    world.activate(AddedPresent)

    expect(() => world.spawn(Present, Broken)).toThrow('factory failed')
    expect(world.view(PresentEntities)).toHaveLength(0)
    expect(world.drain(AddedPresent)).toHaveLength(0)

    const first = world.spawn()
    expect(world.index(first)).toBe(0)
    expect(() => world.add(first, Broken)).toThrow('factory failed')
    expect(world.has(first, Broken)).toBe(false)
    world.dispose()
  })

  it('rejects non-record object factories and fields absent from the factory record', () => {
    class Resource {
      value = 1
    }

    const NonRecord = trait(() => new Resource())
    const Record = trait(() => ({ value: 1 }))
    const world = createWorld()

    expect(() => world.spawn(NonRecord)).toThrow(/plain records/)
    expect(() => world.spawn(Record({ extra: 2 } as unknown as { value?: number }))).toThrow(
      /existing writable data fields/
    )
    expect(world.view(select(Record))).toHaveLength(0)
    world.dispose()
  })

  it('rejects reentrant world mutation from object factories', () => {
    const Present = trait()
    const world = createWorld()
    const existing = world.spawn(Present)
    const Disposing = trait(() => {
      world.dispose()
      return { value: 1 }
    })
    const Destroying = trait(() => {
      world.destroy(existing)
      return { value: 1 }
    })

    expect(() => world.spawn(Disposing)).toThrow(/Trait inputs cannot access mutable world state/)
    expect(world.disposed).toBe(false)
    expect(world.isAlive(existing)).toBe(true)
    expect(() => world.add(existing, Destroying)).toThrow(/Trait inputs cannot access mutable world state/)
    expect(world.isAlive(existing)).toBe(true)
    expect(world.has(existing, Destroying)).toBe(false)
    world.dispose()
  })

  it('rejects reentrant world mutation from numeric input traps', () => {
    const Position = trait({ x: 0 })
    const Velocity = trait({ x: 0 })
    const world = createWorld()
    const existing = world.spawn(Position({ x: 1 }))
    const disposing = new Proxy(
      { x: 2 },
      {
        getPrototypeOf(target) {
          world.dispose()
          return Reflect.getPrototypeOf(target)
        },
      }
    )
    const destroying = new Proxy(
      { x: 3 },
      {
        getPrototypeOf(target) {
          world.destroy(existing)
          return Reflect.getPrototypeOf(target)
        },
      }
    )

    expect(() => world.spawn(Position(disposing))).toThrow(/Trait inputs cannot access mutable world state/)
    expect(world.disposed).toBe(false)
    expect(() => world.add(existing, Velocity(destroying))).toThrow(/Trait inputs cannot access mutable world state/)
    expect(() => world.patch(existing, Position, destroying)).toThrow(/Trait inputs cannot access mutable world state/)
    expect(world.isAlive(existing)).toBe(true)
    expect(world.has(existing, Velocity)).toBe(false)
    expect(world.read(existing, Position)).toEqual({ x: 1 })
    world.dispose()
  })

  it('rejects accessor-backed object patch targets before invoking them', () => {
    const world = createWorld()
    let entity: Entity | undefined
    const Reactive = trait(() => {
      const value = { state: 0 } as { state: number; trigger: number }
      Object.defineProperty(value, 'trigger', {
        enumerable: true,
        set() {
          if (entity !== undefined) world.destroy(entity)
        },
      })
      return value
    })
    const spawned = world.spawn(Reactive)
    entity = spawned

    expect(() => world.patch(spawned, Reactive, { trigger: 1 })).toThrow(/existing writable data fields/)
    expect(world.isAlive(spawned)).toBe(true)
    expect(world.read(spawned, Reactive)?.state).toBe(0)
    world.dispose()
  })

  it('preserves writable data descriptors across repeated object patches', () => {
    const State = trait(() => ({ value: 0 }))
    const world = createWorld()
    const entity = world.spawn(State)

    world.patch(entity, State, { value: 1 })
    expect(Object.getOwnPropertyDescriptor(world.read(entity, State)!, 'value')).toMatchObject({
      configurable: true,
      enumerable: true,
      value: 1,
      writable: true,
    })
    world.patch(entity, State, { value: 2 })
    expect(world.read(entity, State)?.value).toBe(2)
    world.dispose()
  })

  it('keeps failed multi-field object patches atomic and untracked', () => {
    const RecordState = trait(() => {
      const value = { a: 0, b: 0 }
      Object.defineProperty(value, 'b', {
        configurable: true,
        enumerable: true,
        value: 0,
        writable: false,
      })
      return value
    })
    const ChangedRecord = changed({ any: [RecordState] })
    const world = createWorld()
    world.activate(ChangedRecord)
    const entity = world.spawn(RecordState)

    expect(() => world.patch(entity, RecordState, { a: 1, b: 1 })).toThrow(/existing writable data fields/)
    expect(world.read(entity, RecordState)).toEqual({ a: 0, b: 0 })
    expect(world.drain(ChangedRecord)).toHaveLength(0)
    world.dispose()
  })

  it('preflights duplicate composition before factories, stores, events, or IDs', () => {
    let factories = 0
    const State = trait({ value: 1 })
    const Resource = trait(() => {
      factories++
      return { value: 1 }
    })
    const StateEntities = select(State)
    const AddedState = added(State)
    const ChangedState = changed({ any: [State] })
    const world = createWorld()
    world.activate(AddedState)
    world.activate(ChangedState)

    expect(() => world.spawn(Resource, State({ value: 2 }), State({ value: 3 }))).toThrow(/duplicate trait/)
    expect(factories).toBe(0)
    expect(world.view(StateEntities)).toHaveLength(0)
    expect(world.drain(AddedState)).toHaveLength(0)
    expect(world.store(State).value.filter((value) => value !== undefined)).toHaveLength(0)

    const entity = world.spawn(State({ value: 7 }))
    expect(world.index(entity)).toBe(0)
    expect(() => world.add(entity, State({ value: 99 }))).toThrow(/already has trait/)
    expect(world.read(entity, State)).toEqual({ value: 7 })
    expect(world.drain(ChangedState)).toHaveLength(0)
    world.dispose()
  })

  it('maintains stable borrowed selector views across structural changes', () => {
    const Position = trait({ x: 0 })
    const Active = trait()
    const ActivePositions = select(Position, Active)
    const firstWorld = createWorld()
    const secondWorld = createWorld()
    const retained = firstWorld.view(ActivePositions)
    const secondView = secondWorld.view(ActivePositions)
    const first = firstWorld.spawn(Position, Active)
    const second = firstWorld.spawn(Position)

    expect(firstWorld.view(ActivePositions)).toBe(retained)
    expect(secondView).not.toBe(retained)
    expect(retained).toEqual([first])
    firstWorld.add(second, Active)
    expect(asSet(retained)).toEqual(new Set([first, second]))
    firstWorld.remove(first, Active)
    expect(retained).toEqual([second])
    expect(secondView).toHaveLength(0)

    firstWorld.dispose()
    secondWorld.dispose()
    expect(retained).toHaveLength(0)
    expect(secondView).toHaveLength(0)
  })

  it('matches deliberately unordered requirements across signature words', () => {
    const traits = Array.from({ length: 70 }, () => trait())
    const CrossWord = select(traits[0]!, traits[32]!, traits[1]!, traits[65]!)
    const world = createWorld()
    const complete = world.spawn(traits[65]!, traits[1]!, traits[32]!, traits[0]!)
    world.spawn(traits[0]!, traits[1]!, traits[32]!)

    expect(world.view(CrossWord)).toEqual([complete])
    world.remove(complete, traits[32]!)
    expect(world.view(CrossWord)).toHaveLength(0)
    world.add(complete, traits[32]!)
    expect(world.view(CrossWord)).toEqual([complete])
    world.dispose()
  })

  it('rejects empty ordinary and event selectors', () => {
    expect(() => select()).toThrow(/at least one trait/)
    expect(() => changed({ any: [] })).toThrow(/at least one observed trait/)
  })

  it('keeps event consumers independent, deduplicated, and requirement-filtered', () => {
    const IsBatched = trait()
    const SortLayer = trait({ value: 0 })
    const Material = trait({ id: 0 })
    const ChangedA = changed({ any: [SortLayer, Material], all: [IsBatched] })
    const ChangedB = changed({ any: [SortLayer, Material], all: [IsBatched] })
    const world = createWorld()
    world.activate(ChangedA)
    world.activate(ChangedB)
    const batched = world.spawn(IsBatched, SortLayer, Material)
    const loose = world.spawn(SortLayer, Material)

    world.patch(batched, SortLayer, { value: 1 })
    world.patch(batched, Material, { id: 2 })
    world.patch(loose, SortLayer, { value: 3 })
    expect(world.drain(ChangedA)).toEqual([batched])
    expect(world.drain(ChangedA)).toHaveLength(0)
    expect(world.drain(ChangedB)).toEqual([batched])

    world.patch(batched, SortLayer, { value: 4 }, false)
    expect(world.drain(ChangedA)).toHaveLength(0)
    world.store(SortLayer).value[world.index(batched)] = 5
    expect(world.drain(ChangedA)).toHaveLength(0)
    world.touch(batched, SortLayer)
    expect(world.drain(ChangedA)).toEqual([batched])
    world.dispose()
  })

  it('captures immutable selector requirements at declaration time', () => {
    const Required = trait()
    const First = trait({ value: 0 })
    const Replacement = trait({ value: 0 })
    const observed = [First] as [typeof First]
    const required = [Required]
    const ChangedFirst = changed({ any: observed, all: required })

    observed[0] = Replacement
    required.length = 0

    const world = createWorld()
    world.activate(ChangedFirst)
    const matching = world.spawn(Required, First, Replacement)
    const missingRequired = world.spawn(First)
    world.patch(matching, First, { value: 1 })
    world.patch(missingRequired, First, { value: 1 })
    world.patch(matching, Replacement, { value: 1 })

    expect(world.drain(ChangedFirst)).toEqual([matching])
    expect(() => (ChangedFirst.observed as AnyTrait[]).push(Replacement)).toThrow()
    expect(() => (ChangedFirst.required as AnyTrait[]).pop()).toThrow()
    world.dispose()
  })

  it('captures events only after explicit world-local activation', () => {
    const State = trait({ value: 0 })
    const AddedState = added(State)
    const world = createWorld()

    const entity = world.spawn(State)
    expect(() => world.drain(AddedState)).toThrow(/activated/)
    world.activate(AddedState)
    world.activate(AddedState)
    expect(world.drain(AddedState)).toHaveLength(0)

    const observed = world.spawn(State)
    expect(world.drain(AddedState)).toEqual([observed])
    world.dispose()
  })

  it('retains independent add and remove events before either drain', () => {
    const Renderable = trait()
    const Slot = trait({ value: -1 })
    const AddedA = added(Renderable)
    const AddedB = added(Renderable)
    const RemovedA = removed(Renderable, Slot)
    const RemovedB = removed(Renderable, Slot)
    const world = createWorld()
    world.activate(AddedA)
    world.activate(AddedB)
    world.activate(RemovedA)
    world.activate(RemovedB)
    const entity = world.spawn(Slot)

    world.add(entity, Renderable)
    world.remove(entity, Renderable)
    expect(world.read(entity, Slot)).toEqual({ value: -1 })
    expect(world.drain(AddedA)).toEqual([entity])
    expect(world.drain(AddedA)).toHaveLength(0)
    expect(world.drain(AddedB)).toEqual([entity])
    expect(world.drain(RemovedA)).toEqual([entity])
    expect(world.drain(RemovedA)).toHaveLength(0)
    expect(world.drain(RemovedB)).toEqual([entity])
    world.dispose()
  })

  it('keeps recycled generations distinct in pending queues and selectors', () => {
    const Queued = trait()
    const Selected = trait()
    const AddedQueued = added(Queued)
    const SelectedEntities = select(Selected)
    const world = createWorld()
    world.activate(AddedQueued)
    const stale = world.spawn(Queued, Selected)
    const index = world.index(stale)

    expect(world.view(SelectedEntities)).toEqual([stale])
    world.destroy(stale)
    const recycled = world.spawn(Queued)
    expect(world.index(recycled)).toBe(index)
    expect(recycled).not.toBe(stale)
    expect(world.isAlive(stale)).toBe(false)
    expect(world.view(SelectedEntities)).toHaveLength(0)
    expect(asSet(world.drain(AddedQueued))).toEqual(new Set([stale, recycled]))

    world.add(recycled, Selected)
    expect(world.view(SelectedEntities)).toEqual([recycled])
    world.dispose()
  })

  it('does not synthesize Removed events during destruction', () => {
    const Resource = trait()
    const RemovedResource = removed(Resource)
    const world = createWorld()
    world.activate(RemovedResource)
    const entity = world.spawn(Resource)

    world.destroy(entity)
    expect(world.drain(RemovedResource)).toHaveLength(0)
    world.dispose()
  })

  it('destroys only present traits across sparse high signature words', () => {
    const Low = trait()
    const world = createWorld()
    const low = world.spawn(Low)
    const unrelated = Array.from({ length: 2_048 }, () => trait())
    const HighResource = trait(() => ({ owner: 'high' }))
    const High = trait()
    const HighEntities = select(HighResource, High)
    const high = world.spawn(HighResource, High)

    expect(unrelated).toHaveLength(2_048)
    expect(world.view(HighEntities)).toEqual([high])
    world.destroy(high)
    expect(world.view(HighEntities)).toHaveLength(0)
    expect(world.read(high, HighResource)).toBeUndefined()
    expect(world.isAlive(low)).toBe(true)
    world.dispose()
  })

  it('rejects stale mutations without touching the recycled entity', () => {
    const State = trait({ value: 0 })
    const world = createWorld()
    const stale = world.spawn(State({ value: 1 }))
    world.destroy(stale)
    const current = world.spawn(State({ value: 2 }))

    expect(world.has(stale, State)).toBe(false)
    expect(world.read(stale, State)).toBeUndefined()
    expect(() => world.add(stale, trait())).toThrow(/Stale entity handle/)
    expect(() => world.remove(stale, State)).toThrow(/Stale entity handle/)
    expect(() => world.patch(stale, State, { value: 3 })).toThrow(/Stale entity handle/)
    expect(() => world.touch(stale, State)).toThrow(/Stale entity handle/)
    expect(() => world.touch(current, trait())).toThrow(/does not have trait/)
    expect(() => world.destroy(stale)).toThrow(/Stale entity handle/)
    expect(world.read(current, State)).toEqual({ value: 2 })
    world.dispose()
  })

  it('isolates equal world-relative handle values', () => {
    const State = trait({ value: 0 })
    const firstWorld = createWorld()
    const secondWorld = createWorld()
    const first = firstWorld.spawn(State({ value: 1 }))
    const second = secondWorld.spawn(State({ value: 2 }))

    expect(first).toBe(second)
    firstWorld.destroy(first)
    expect(secondWorld.isAlive(second)).toBe(true)
    expect(secondWorld.read(second, State)).toEqual({ value: 2 })
    firstWorld.dispose()
    secondWorld.dispose()
  })

  it('clears borrowed storage and makes disposal idempotent', () => {
    const State = trait({ value: 0 })
    const AddedState = added(State)
    const StateEntities = select(State)
    const world = createWorld()
    const store = world.store(State)
    const view = world.view(StateEntities)
    world.activate(AddedState)
    const entity = world.spawn(State)
    const events = world.drain(AddedState)

    expect(view).toHaveLength(1)
    expect(events).toHaveLength(1)
    world.dispose()
    world.dispose()
    expect(world.disposed).toBe(true)
    expect(store.value).toHaveLength(0)
    expect(view).toHaveLength(0)
    expect(events).toHaveLength(0)
    expect(world.isAlive(entity)).toBe(false)
    expect(world.has(entity, State)).toBe(false)
    expect(() => world.read(entity, State)).toThrow(/disposed/)
    expect(() => world.spawn()).toThrow(/disposed/)
    expect(() => world.store(State)).toThrow(/disposed/)
    expect(() => world.view(StateEntities)).toThrow(/disposed/)
    expect(() => world.drain(AddedState)).toThrow(/disposed/)
  })
})
