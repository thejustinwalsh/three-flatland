import {
  createAdded,
  createChanged,
  createRemoved,
  createWorld,
  getStore,
  relation,
  trait,
  universe,
  unpackEntity,
  type ConfigurableTrait,
  type Entity as KootaEntity,
  type Modifier,
  type Relation,
  type Trait as KootaNativeTrait,
  type World,
} from 'koota'
import type {
  AdapterWorld,
  AnyTrait,
  Component,
  EcsAdapter,
  Entity,
  EventKind,
  EventSelector,
  ExclusiveRelation,
  NumericSchema,
  NumericStore,
  NumericTrait,
  ObjectTrait,
  Selector,
  TagTrait,
  Trait,
  TraitKind,
} from '../adapter.ts'

interface KootaTrait<TValue = unknown> extends Trait<TValue> {
  readonly kind: TraitKind
  readonly native: KootaNativeTrait
}

interface KootaSelector extends Selector {
  readonly nativeRequired: readonly KootaNativeTrait[]
}

interface KootaEventSelector extends EventSelector {
  readonly modifiers: readonly Modifier[]
  readonly nativeRequired: readonly KootaNativeTrait[]
}

interface KootaRelation extends ExclusiveRelation {
  readonly native: Relation
}

let nextSelectorId = 0
let nextEventSelectorId = 0
let nextRelationId = 0

function asKootaTrait<TValue>(value: Trait<TValue>): KootaTrait<TValue> {
  return value as KootaTrait<TValue>
}

function asKootaSelector(value: Selector): KootaSelector {
  return value as KootaSelector
}

function asKootaEventSelector(value: EventSelector): KootaEventSelector {
  return value as KootaEventSelector
}

function asKootaRelation(value: ExclusiveRelation): KootaRelation {
  return value as KootaRelation
}

function toKootaComponent(value: Component): ConfigurableTrait {
  const wrapped = asKootaTrait(value.trait)
  if (value.initial === undefined) return wrapped.native
  return wrapped.native(value.initial) as ConfigurableTrait
}

function createTrackingModifier(kind: EventKind, observed: KootaNativeTrait): Modifier {
  switch (kind) {
    case 'added':
      return createAdded()(observed)
    case 'changed':
      return createChanged()(observed)
    case 'removed':
      return createRemoved()(observed)
  }
}

const EMPTY_TRACKED_PATCH = Object.freeze({})

class KootaWorld implements AdapterWorld {
  #world: World
  #disposed = false

  constructor() {
    this.#world = createWorld()
  }

  get disposed(): boolean {
    return this.#disposed
  }

  spawn(...components: readonly Component[]): Entity {
    return this.#world.spawn(...components.map(toKootaComponent))
  }

  add<TValue>(entity: Entity, value: Component<TValue>): void {
    const kootaEntity = entity as KootaEntity
    kootaEntity.add(toKootaComponent(value as Component))
  }

  remove(entity: Entity, traitValue: AnyTrait): void {
    const kootaEntity = entity as KootaEntity
    kootaEntity.remove(asKootaTrait(traitValue).native)
  }

  has(entity: Entity, traitValue: AnyTrait): boolean {
    return (entity as KootaEntity).has(asKootaTrait(traitValue).native)
  }

  read<TValue>(entity: Entity, traitValue: Trait<TValue>): TValue | undefined {
    return (entity as KootaEntity).get(asKootaTrait(traitValue).native) as TValue | undefined
  }

  patch<TValue extends object>(
    entity: Entity,
    traitValue: Trait<TValue>,
    value: Partial<TValue>,
    tracked = true
  ): void {
    const kootaEntity = entity as KootaEntity
    kootaEntity.set(asKootaTrait(traitValue).native, value, tracked)
  }

  touch(entity: Entity, traitValue: AnyTrait): void {
    const kootaEntity = entity as KootaEntity
    kootaEntity.set(asKootaTrait(traitValue).native, EMPTY_TRACKED_PATCH, true)
  }

  store<TSchema extends NumericSchema>(traitValue: NumericTrait<TSchema>): NumericStore<TSchema> {
    return getStore(this.#world, asKootaTrait(traitValue).native) as NumericStore<TSchema>
  }

  view(selector: Selector): readonly Entity[] {
    return this.#world.query(...asKootaSelector(selector).nativeRequired)
  }

  drain(selector: EventSelector): readonly Entity[] {
    const { modifiers, nativeRequired } = asKootaEventSelector(selector)
    const deduplicated = new Set<Entity>()

    for (const modifier of modifiers) {
      for (const entity of this.#world.query(modifier, ...nativeRequired)) {
        deduplicated.add(entity)
      }
    }

    return [...deduplicated]
  }

  assign(entity: Entity, relationValue: ExclusiveRelation, target: Entity): void {
    const kootaEntity = entity as KootaEntity
    kootaEntity.add(asKootaRelation(relationValue).native(target as KootaEntity))
  }

  unassign(entity: Entity, relationValue: ExclusiveRelation): void {
    const wrapped = asKootaRelation(relationValue)
    const target = (entity as KootaEntity).targetFor(wrapped.native)
    if (target !== undefined) (entity as KootaEntity).remove(wrapped.native(target))
  }

  target(entity: Entity, relationValue: ExclusiveRelation): Entity | undefined {
    return (entity as KootaEntity).targetFor(asKootaRelation(relationValue).native)
  }

  destroy(entity: Entity): void {
    const kootaEntity = entity as KootaEntity
    kootaEntity.destroy()
  }

  isAlive(entity: Entity): boolean {
    return !this.#disposed && this.#world.has(entity as KootaEntity)
  }

  index(entity: Entity): number {
    return unpackEntity(entity as KootaEntity).entityId
  }

  generation(entity: Entity): number {
    return unpackEntity(entity as KootaEntity).generation
  }

  dispose(): void {
    if (this.#disposed) return
    this.#world.destroy()
    this.#disposed = true
  }
}

export const kootaAdapter: EcsAdapter = {
  name: 'koota',

  numeric<TSchema extends NumericSchema>(defaults: TSchema): NumericTrait<TSchema> {
    return { kind: 'numeric', native: trait(defaults) } as KootaTrait<TSchema> & NumericTrait<TSchema>
  },

  object<TValue extends object>(factory: () => TValue): ObjectTrait<TValue> {
    return { kind: 'object', native: trait(factory) } as KootaTrait<TValue> & ObjectTrait<TValue>
  },

  tag(): TagTrait {
    return { kind: 'tag', native: trait() } as KootaTrait<undefined> & TagTrait
  },

  exclusive(): ExclusiveRelation {
    return { id: nextRelationId++, native: relation({ exclusive: true }) } as KootaRelation
  },

  select(...required: readonly AnyTrait[]): Selector {
    return {
      id: nextSelectorId++,
      nativeRequired: required.map((traitValue) => asKootaTrait(traitValue).native),
    } as KootaSelector
  },

  event(kind: EventKind, observed: readonly AnyTrait[], required: readonly AnyTrait[] = []): EventSelector {
    return {
      id: nextEventSelectorId++,
      modifiers: observed.map((traitValue) => createTrackingModifier(kind, asKootaTrait(traitValue).native)),
      nativeRequired: required.map((traitValue) => asKootaTrait(traitValue).native),
    } as KootaEventSelector
  },

  createWorld(): AdapterWorld {
    return new KootaWorld()
  },

  reset(): void {
    universe.reset()
    nextSelectorId = 0
    nextEventSelectorId = 0
    nextRelationId = 0
  },
}
