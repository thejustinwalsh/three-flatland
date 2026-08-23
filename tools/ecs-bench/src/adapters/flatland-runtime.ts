import {
  added,
  changed,
  createWorld,
  removed,
  select,
  trait,
  type AnyTrait as RuntimeTrait,
  type Entity as RuntimeEntity,
  type EventSelector as RuntimeEventSelector,
  type NumericSchema,
  type NumericTrait as RuntimeNumericTrait,
  type Selector as RuntimeSelector,
  type TraitInput,
  type Trait as RuntimeTypedTrait,
} from '../../../../packages/three-flatland/src/ecs/runtime/index.ts'
import type {
  AdapterWorld,
  AnyTrait,
  Component,
  EcsAdapter,
  Entity,
  EventKind,
  EventSelector,
  ExclusiveRelation,
  NumericTrait,
  NumericStore,
  ObjectTrait,
  Selector,
  TagTrait,
} from '../adapter.ts'

interface RuntimeRelation extends ExclusiveRelation {
  readonly id: number
  readonly target: RuntimeNumericTrait<{ target: number }>
}

interface RuntimeAdapterEventSelector extends EventSelector {
  readonly runtimeSelectors: readonly RuntimeEventSelector[]
}

let nextRelationId = 0

function runtimeTrait(handle: AnyTrait): RuntimeTrait {
  return handle as unknown as RuntimeTrait
}

function runtimeEntity(entity: Entity): RuntimeEntity {
  return entity as RuntimeEntity
}

function runtimeInput(component: Component): TraitInput {
  const handle = runtimeTrait(component.trait)
  return component.initial === undefined
    ? handle
    : ({ trait: handle, initial: component.initial } as unknown as TraitInput)
}

function runtimeSelector(selector: Selector): RuntimeSelector {
  return selector as unknown as RuntimeSelector
}

function runtimeEventSelectors(selector: EventSelector): readonly RuntimeEventSelector[] {
  return (selector as RuntimeAdapterEventSelector).runtimeSelectors
}

const runtimeSelect = select as unknown as (...required: readonly RuntimeTrait[]) => RuntimeSelector

function patchRuntime(
  world: ReturnType<typeof createWorld>,
  entity: RuntimeEntity,
  trait: RuntimeTypedTrait<object>,
  value: object,
  tracked?: boolean
): void {
  const runtimeWorld = world as unknown as {
    patch(entity: RuntimeEntity, trait: RuntimeTypedTrait<object>, value: object, tracked?: boolean): void
  }
  runtimeWorld.patch(entity, trait, value, tracked)
}

function createAdapterWorld(activeEvents: readonly RuntimeEventSelector[]): AdapterWorld {
  const world = createWorld()
  const relationTargets: Array<number[] | undefined> = []
  for (const selector of activeEvents) world.activate(selector)

  function targets(relation: RuntimeRelation): number[] {
    return (relationTargets[relation.id] ??= world.store(relation.target).target)
  }

  return {
    get disposed() {
      return world.disposed
    },
    add(entity, component) {
      world.add(runtimeEntity(entity), runtimeInput(component))
    },
    assign(entity, relation, target) {
      if (!world.isAlive(runtimeEntity(entity)) || !world.isAlive(runtimeEntity(target))) {
        throw new Error('Flatland runtime adapter cannot assign stale entities')
      }
      const runtimeRelation = relation as RuntimeRelation
      const source = runtimeEntity(entity)
      if (!world.has(source, runtimeRelation.target)) world.add(source, runtimeRelation.target)
      targets(runtimeRelation)[world.index(source)] = target
    },
    destroy(entity) {
      world.destroy(runtimeEntity(entity))
    },
    dispose() {
      world.dispose()
    },
    drain(selector) {
      const selectors = runtimeEventSelectors(selector)
      if (selectors.length === 1) return world.drain(selectors[0]!)

      const entities = new Set<Entity>()
      for (const runtimeSelector of selectors) {
        for (const entity of world.drain(runtimeSelector)) entities.add(entity as Entity)
      }
      return [...entities]
    },
    generation(entity) {
      return world.generation(runtimeEntity(entity))
    },
    has(entity, handle) {
      return world.has(runtimeEntity(entity), runtimeTrait(handle))
    },
    index(entity) {
      return world.index(runtimeEntity(entity))
    },
    isAlive(entity) {
      return world.isAlive(runtimeEntity(entity))
    },
    patch(entity, handle, value, tracked) {
      patchRuntime(world, runtimeEntity(entity), handle as unknown as RuntimeTypedTrait<object>, value, tracked)
    },
    read(entity, handle) {
      return world.read(runtimeEntity(entity), runtimeTrait(handle)) as never
    },
    remove(entity, handle) {
      world.remove(runtimeEntity(entity), runtimeTrait(handle))
    },
    spawn(...components) {
      return world.spawn(...components.map(runtimeInput))
    },
    store<TSchema extends NumericSchema>(handle: NumericTrait<TSchema>): NumericStore<TSchema> {
      return world.store(handle as unknown as RuntimeNumericTrait<TSchema>) as unknown as NumericStore<TSchema>
    },
    touch(entity, handle) {
      world.touch(runtimeEntity(entity), runtimeTrait(handle))
    },
    target(entity, relation) {
      const runtimeRelation = relation as RuntimeRelation
      const source = runtimeEntity(entity)
      if (!world.has(source, runtimeRelation.target)) return undefined
      const target = targets(runtimeRelation)[world.index(source)] ?? 0
      if (target === 0 || !world.isAlive(runtimeEntity(target))) return undefined
      return target as Entity
    },
    unassign(entity, relation) {
      const runtimeRelation = relation as RuntimeRelation
      const source = runtimeEntity(entity)
      if (!world.isAlive(source)) throw new Error(`Stale entity handle ${entity}`)
      if (world.has(source, runtimeRelation.target)) targets(runtimeRelation)[world.index(source)] = 0
    },
    view(selector) {
      return world.view(runtimeSelector(selector))
    },
  }
}

export function createFlatlandRuntimeAdapter(): EcsAdapter {
  const activeEvents: RuntimeEventSelector[] = []
  let nextEventId = 0
  return {
    name: 'flatland-runtime',
    createWorld: () => createAdapterWorld(activeEvents),
    event(kind: EventKind, observed: readonly AnyTrait[], required: readonly AnyTrait[] = []) {
      const runtimeObserved = observed.map(runtimeTrait)
      const runtimeRequired = required.map(runtimeTrait)
      if (runtimeObserved.length === 0) throw new Error(`${kind} selectors require an observed trait`)

      let runtimeSelectors: RuntimeEventSelector[]
      if (kind === 'changed') {
        runtimeSelectors = [changed({ any: [runtimeObserved[0]!, ...runtimeObserved.slice(1)], all: runtimeRequired })]
      } else {
        runtimeSelectors = runtimeObserved.map((observedTrait) =>
          kind === 'added' ? added(observedTrait, ...runtimeRequired) : removed(observedTrait, ...runtimeRequired)
        )
      }
      const stableRuntimeSelectors = Object.freeze(runtimeSelectors)
      activeEvents.push(...stableRuntimeSelectors)
      return Object.freeze({
        id: nextEventId++,
        runtimeSelectors: stableRuntimeSelectors,
      }) as RuntimeAdapterEventSelector
    },
    exclusive(): RuntimeRelation {
      return {
        id: nextRelationId++,
        target: trait({ target: 0 }),
      }
    },
    numeric<TSchema extends NumericSchema>(defaults: TSchema): NumericTrait<TSchema> {
      const runtimeDefaults = defaults as TSchema & Record<Extract<keyof TSchema, symbol>, never>
      return trait(runtimeDefaults) as unknown as NumericTrait<TSchema>
    },
    object<TValue extends object>(factory: () => TValue): ObjectTrait<TValue> {
      return trait(factory) as unknown as ObjectTrait<TValue>
    },
    reset() {},
    select(...required: readonly AnyTrait[]): Selector {
      return runtimeSelect(...required.map(runtimeTrait)) as unknown as Selector
    },
    tag(): TagTrait {
      return trait() as unknown as TagTrait
    },
  }
}
