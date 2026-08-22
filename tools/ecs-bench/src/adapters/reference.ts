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

interface ReferenceTrait<TValue = unknown> extends Trait<TValue> {
  readonly defaults?: NumericSchema
  readonly factory?: () => object
  readonly id: number
  readonly kind: TraitKind
}

interface ReferenceSelector extends Selector {
  readonly id: number
  readonly required: readonly ReferenceTrait[]
}

interface ReferenceEventSelector extends EventSelector {
  readonly id: number
  readonly kind: EventKind
  readonly observed: ReadonlySet<number>
  readonly required: readonly ReferenceTrait[]
}

interface ReferenceRelation extends ExclusiveRelation {
  readonly id: number
}

interface EntityRecord {
  readonly traits: Map<number, object | undefined>
  readonly relations: Map<number, Entity>
}

function asTrait<TValue>(value: Trait<TValue>): ReferenceTrait<TValue> {
  return value as ReferenceTrait<TValue>
}

function asSelector(value: Selector): ReferenceSelector {
  return value as ReferenceSelector
}

function asEventSelector(value: EventSelector): ReferenceEventSelector {
  return value as ReferenceEventSelector
}

function asRelation(value: ExclusiveRelation): ReferenceRelation {
  return value as ReferenceRelation
}

function cloneNumeric(defaults: NumericSchema, initial?: object): Record<string, number> {
  return { ...defaults, ...initial }
}

export function createReferenceAdapter(): EcsAdapter {
  const indexStride = 0x100000
  const indexMask = indexStride - 1
  const maxGeneration = Math.floor(Number.MAX_SAFE_INTEGER / indexStride)
  let nextTraitId = 0
  let nextSelectorId = 0
  let nextEventId = 0
  let nextRelationId = 0
  const selectors: ReferenceSelector[] = []
  const eventSelectors: ReferenceEventSelector[] = []

  return {
    name: 'reference',

    numeric<TSchema extends NumericSchema>(defaults: TSchema): NumericTrait<TSchema> {
      return {
        defaults: { ...defaults },
        id: nextTraitId++,
        kind: 'numeric',
      } as ReferenceTrait<TSchema> & NumericTrait<TSchema>
    },

    object<TValue extends object>(factory: () => TValue): ObjectTrait<TValue> {
      return {
        factory,
        id: nextTraitId++,
        kind: 'object',
      } as ReferenceTrait<TValue> & ObjectTrait<TValue>
    },

    tag(): TagTrait {
      return { id: nextTraitId++, kind: 'tag' } as ReferenceTrait<undefined> & TagTrait
    },

    exclusive(): ExclusiveRelation {
      return { id: nextRelationId++ } satisfies ReferenceRelation
    },

    select(...required: readonly AnyTrait[]): Selector {
      if (required.length === 0) throw new Error('Selectors require at least one trait')
      const selector = {
        id: nextSelectorId++,
        required: required.map(asTrait),
      } satisfies ReferenceSelector
      selectors.push(selector)
      return selector
    },

    event(kind: EventKind, observed: readonly AnyTrait[], required: readonly AnyTrait[] = []): EventSelector {
      const selector = {
        id: nextEventId++,
        kind,
        observed: new Set(observed.map((value) => asTrait(value).id)),
        required: required.map(asTrait),
      } satisfies ReferenceEventSelector
      eventSelectors.push(selector)
      return selector
    },

    createWorld(): AdapterWorld {
      const records = new Map<Entity, EntityRecord>()
      const generations: number[] = []
      const freeIndices: number[] = []
      const numericStores = new Map<number, Record<string, number[]>>()
      const eventQueues = new Map<number, Set<Entity>>()
      let nextIndex = 0
      let disposed = false

      const entityIndex = (entity: Entity): number => entity & indexMask
      const entityGeneration = (entity: Entity): number => Math.floor(entity / 0x100000)
      const packEntity = (index: number): Entity => {
        const entity = (generations[index] ?? 0) * indexStride + index
        if (!Number.isSafeInteger(entity)) throw new RangeError('Entity generation exhausted safe integer handles')
        return entity
      }

      function assertUsable(): void {
        if (disposed) throw new Error('Reference world has been disposed')
      }

      function assertAlive(entity: Entity): EntityRecord {
        assertUsable()
        const record = records.get(entity)
        if (record === undefined) throw new Error(`Stale entity handle: ${entity}`)
        return record
      }

      function matches(record: EntityRecord, required: readonly ReferenceTrait[]): boolean {
        return required.every((traitValue) => record.traits.has(traitValue.id))
      }

      function emit(kind: EventKind, entity: Entity, traitValue: ReferenceTrait): void {
        const record = records.get(entity)
        for (const selector of eventSelectors) {
          if (selector.kind !== kind || !selector.observed.has(traitValue.id)) continue
          if (record !== undefined && !matches(record, selector.required)) continue
          ;(eventQueues.get(selector.id) ?? eventQueues.set(selector.id, new Set()).get(selector.id)!).add(entity)
        }
      }

      function addComponent(record: EntityRecord, entity: Entity, value: Component): void {
        const traitValue = asTrait(value.trait)
        if (record.traits.has(traitValue.id)) {
          throw new Error(`Duplicate trait add: ${traitValue.id}`)
        }

        let state: object | undefined
        if (traitValue.kind === 'numeric') {
          state = cloneNumeric(traitValue.defaults!, value.initial as object | undefined)
          let store = numericStores.get(traitValue.id)
          if (store === undefined) {
            store = Object.fromEntries(Object.keys(traitValue.defaults!).map((field) => [field, [] as number[]]))
            numericStores.set(traitValue.id, store)
          }
          const index = entityIndex(entity)
          for (const [field, fieldValue] of Object.entries(state)) store[field]![index] = fieldValue
        } else if (traitValue.kind === 'object') {
          state = { ...traitValue.factory!(), ...value.initial }
        }

        record.traits.set(traitValue.id, state)
        emit('added', entity, traitValue)
      }

      function assertUniqueComponents(components: readonly Component[]): void {
        const traitIds = new Set<number>()
        for (const value of components) {
          const id = asTrait(value.trait).id
          if (traitIds.has(id)) throw new Error(`Duplicate trait in spawn: ${id}`)
          traitIds.add(id)
        }
      }

      return {
        get disposed(): boolean {
          return disposed
        },

        spawn(...components: readonly Component[]): Entity {
          assertUsable()
          assertUniqueComponents(components)
          let index = freeIndices.pop()
          if (index === undefined) {
            // Capacity failure is atomic: reject before advancing the cursor
            // or touching entity, selector, event, or trait state.
            if (nextIndex > indexMask) throw new RangeError('Entity index capacity exhausted')
            index = nextIndex++
          }
          const entity = packEntity(index)
          const record: EntityRecord = { relations: new Map(), traits: new Map() }
          records.set(entity, record)
          for (const value of components) addComponent(record, entity, value)
          return entity
        },

        add<TValue>(entity: Entity, value: Component<TValue>): void {
          addComponent(assertAlive(entity), entity, value as Component)
        },

        remove(entity: Entity, traitHandle: AnyTrait): void {
          const record = assertAlive(entity)
          const traitValue = asTrait(traitHandle)
          if (!record.traits.has(traitValue.id)) return
          record.traits.delete(traitValue.id)
          emit('removed', entity, traitValue)
        },

        has(entity: Entity, traitValue: AnyTrait): boolean {
          return records.get(entity)?.traits.has(asTrait(traitValue).id) ?? false
        },

        read<TValue>(entity: Entity, traitValue: Trait<TValue>): TValue | undefined {
          const wrapped = asTrait(traitValue)
          const value = records.get(entity)?.traits.get(wrapped.id)
          if (wrapped.kind !== 'numeric') return value as TValue | undefined
          if (value === undefined) return undefined
          const store = numericStores.get(wrapped.id)!
          const index = entityIndex(entity)
          return Object.fromEntries(
            Object.keys(wrapped.defaults!).map((field) => [field, store[field]![index]])
          ) as TValue
        },

        patch<TValue extends object>(
          entity: Entity,
          traitHandle: Trait<TValue>,
          value: Partial<TValue>,
          tracked = true
        ): void {
          const record = assertAlive(entity)
          const traitValue = asTrait(traitHandle)
          const current = record.traits.get(traitValue.id)
          if (current === undefined) throw new Error('Cannot patch a missing trait')

          if (traitValue.kind === 'numeric') {
            const store = numericStores.get(traitValue.id)!
            const index = entityIndex(entity)
            for (const [field, fieldValue] of Object.entries(value)) {
              store[field]![index] = fieldValue as number
            }
          } else {
            Object.assign(current, value)
          }
          if (tracked) emit('changed', entity, traitValue)
        },

        store<TSchema extends NumericSchema>(traitValue: NumericTrait<TSchema>): NumericStore<TSchema> {
          const wrapped = asTrait(traitValue)
          let store = numericStores.get(wrapped.id)
          if (store === undefined) {
            store = Object.fromEntries(Object.keys(wrapped.defaults!).map((field) => [field, [] as number[]]))
            numericStores.set(wrapped.id, store)
          }
          return store as NumericStore<TSchema>
        },

        view(selector: Selector): readonly Entity[] {
          const { required } = asSelector(selector)
          return [...records].filter(([, record]) => matches(record, required)).map(([entity]) => entity)
        },

        drain(selector: EventSelector): readonly Entity[] {
          const wrapped = asEventSelector(selector)
          const queue = eventQueues.get(wrapped.id)
          if (queue === undefined) return []
          const values = [...queue]
          queue.clear()
          return values
        },

        assign(entity: Entity, relationValue: ExclusiveRelation, target: Entity): void {
          assertAlive(target)
          assertAlive(entity).relations.set(asRelation(relationValue).id, target)
        },

        unassign(entity: Entity, relationValue: ExclusiveRelation): void {
          assertAlive(entity).relations.delete(asRelation(relationValue).id)
        },

        target(entity: Entity, relationValue: ExclusiveRelation): Entity | undefined {
          const target = records.get(entity)?.relations.get(asRelation(relationValue).id)
          return target !== undefined && records.has(target) ? target : undefined
        },

        destroy(entity: Entity): void {
          assertAlive(entity)
          const nextGeneration = entityGeneration(entity) + 1
          records.delete(entity)
          const index = entityIndex(entity)
          if (nextGeneration >= maxGeneration) {
            // Destruction always succeeds. Once this index reaches the last
            // safe generation, cap and retire it rather than ever aliasing a
            // stale handle or producing a non-safe-integer entity.
            generations[index] = maxGeneration
            return
          }
          generations[index] = nextGeneration
          freeIndices.push(index)
        },

        isAlive(entity: Entity): boolean {
          return !disposed && records.has(entity)
        },

        index(entity: Entity): number {
          return entityIndex(entity)
        },

        generation(entity: Entity): number {
          return entityGeneration(entity)
        },

        dispose(): void {
          records.clear()
          numericStores.clear()
          eventQueues.clear()
          disposed = true
        },
      }
    },

    reset(): void {
      nextTraitId = 0
      nextSelectorId = 0
      nextEventId = 0
      nextRelationId = 0
      selectors.length = 0
      eventSelectors.length = 0
    },
  }
}

export const referenceAdapter = createReferenceAdapter()
