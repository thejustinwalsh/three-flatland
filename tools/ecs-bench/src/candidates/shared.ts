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
} from '../adapter.ts'

const INDEX_BITS = 20
const INDEX_MASK = (1 << INDEX_BITS) - 1
const MAX_GENERATION = Math.floor(Number.MAX_SAFE_INTEGER / 2 ** INDEX_BITS)

type TraitShape = Record<string, number> | Record<string, unknown>
type TraitDefinition = TraitShape | (() => TraitShape)
type TraitKind = 'tag' | 'numeric' | 'object'

export interface CandidateInitializer {
  readonly trait: CandidateTrait
  readonly patch?: Partial<TraitShape>
}

export interface CandidateTrait {
  (patch?: Partial<TraitShape>): CandidateInitializer
  readonly id: number
  readonly kind: TraitKind
  readonly defaults?: TraitShape
  readonly factory?: () => TraitShape
}

export type CandidateTraitInput = CandidateTrait | CandidateInitializer

export interface CandidateSelector {
  readonly id: number
  readonly traits: readonly CandidateTrait[]
}

export interface CandidateEventSelector {
  readonly id: number
  readonly kind: EventKind
  readonly watched: readonly CandidateTrait[]
  readonly required: readonly CandidateTrait[]
}

export interface CandidateWorld {
  readonly disposed: boolean
  spawn(...inputs: readonly CandidateTraitInput[]): Entity
  add(entity: Entity, ...inputs: readonly CandidateTraitInput[]): void
  remove(entity: Entity, trait: CandidateTrait): void
  has(entity: Entity, trait: CandidateTrait): boolean
  read(entity: Entity, trait: CandidateTrait): TraitShape | undefined
  patch(entity: Entity, trait: CandidateTrait, patch: Partial<TraitShape>, tracked?: boolean): void
  store(trait: CandidateTrait): Record<string, number[]>
  view(selector: CandidateSelector): readonly Entity[]
  drain(selector: CandidateEventSelector): readonly Entity[]
  destroy(entity: Entity): void
  dispose(): void
  isAlive(entity: Entity): boolean
  index(entity: Entity): number
  generation(entity: Entity): number
}

export interface CandidateAdapter {
  readonly name: string
  trait(): CandidateTrait
  trait(definition: Record<string, number>): CandidateTrait
  trait(definition: () => Record<string, unknown>): CandidateTrait
  select(...traits: readonly CandidateTrait[]): CandidateSelector
  added(trait: CandidateTrait, ...required: readonly CandidateTrait[]): CandidateEventSelector
  changed(...watched: readonly CandidateTrait[]): CandidateEventSelector
  removed(trait: CandidateTrait, ...required: readonly CandidateTrait[]): CandidateEventSelector
  createWorld(): CandidateWorld
  event(
    kind: EventKind,
    watched: readonly CandidateTrait[],
    required?: readonly CandidateTrait[]
  ): CandidateEventSelector
  reset(): void
}

type KernelKind = 'anchored-scan' | 'signature-persistent' | 'sparse-persistent'

class DenseSet {
  readonly dense: number[] = []
  private readonly sparse: Array<number | undefined> = []

  has(value: number): boolean {
    const position = this.sparse[value]
    return position !== undefined && this.dense[position] === value
  }

  add(value: number): boolean {
    if (this.has(value)) return false
    this.sparse[value] = this.dense.length
    this.dense.push(value)
    return true
  }

  indexOf(value: number): number {
    return this.has(value) ? this.sparse[value]! : -1
  }

  delete(value: number): boolean {
    const position = this.sparse[value]
    if (position === undefined || this.dense[position] !== value) return false

    const last = this.dense.pop()!
    this.sparse[value] = undefined
    if (last !== value) {
      this.dense[position] = last
      this.sparse[last] = position
    }
    return true
  }

  clear(): void {
    for (const value of this.dense) {
      this.sparse[value] = undefined
    }
    this.dense.length = 0
  }
}

/** Packed-handle queue that stays sparse by entity index across generations. */
class HandleQueue {
  readonly dense: Entity[] = []
  private readonly positions: Array<number | undefined> = []

  add(entity: Entity): boolean {
    const index = entityIndex(entity)
    const position = this.positions[index]
    if (position !== undefined && this.dense[position] === entity) return false

    // Two generations can coexist only when an index is destroyed and reused
    // before this consumer drains. Keep that rare edge correct without sizing
    // a sparse array by the packed generation bits.
    if (position !== undefined && this.dense.includes(entity)) return false
    this.positions[index] = this.dense.length
    this.dense.push(entity)
    return true
  }

  clear(): void {
    for (let position = this.dense.length - 1; position >= 0; position--) {
      const index = entityIndex(this.dense[position]!)
      if (this.positions[index] === position) this.positions[index] = undefined
    }
    this.dense.length = 0
  }
}

interface TraitState {
  readonly present?: DenseSet
  readonly numeric?: Record<string, number[]>
  readonly objects?: Array<TraitShape | undefined>
}

interface SelectorState {
  readonly members: DenseSet
  readonly scratch: number[]
}

interface EventState {
  readonly queue: HandleQueue
  readonly drained: number[]
}

function isInitializer(input: CandidateTraitInput): input is CandidateInitializer {
  return typeof input === 'object' && input !== null && 'trait' in input
}

function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK
}

function entityGeneration(entity: Entity): number {
  return Math.floor(entity / 2 ** INDEX_BITS)
}

function makeEntity(index: number, generation: number): Entity {
  return generation * 2 ** INDEX_BITS + index
}

function isNumericShape(value: TraitShape): value is Record<string, number> {
  for (const field of Object.keys(value)) {
    if (typeof value[field] !== 'number') return false
  }
  return true
}

interface CandidateRelation extends ExclusiveRelation {
  readonly id: number
}

function asCandidateTrait(value: AnyTrait): CandidateTrait {
  return value as CandidateTrait
}

function asCandidateSelector(value: Selector): CandidateSelector {
  return value as unknown as CandidateSelector
}

function asCandidateEvent(value: EventSelector): CandidateEventSelector {
  return value as unknown as CandidateEventSelector
}

function asCandidateRelation(value: ExclusiveRelation): CandidateRelation {
  return value as CandidateRelation
}

function createRuntimeAdapter(kind: KernelKind): CandidateAdapter {
  let nextTraitId = 0
  let nextSelectorId = 0
  let nextEventId = 0
  const selectors: CandidateSelector[] = []
  const events: CandidateEventSelector[] = []
  const selectorSubscriptions: CandidateSelector[][] = []
  const eventSubscriptions: CandidateEventSelector[][] = []

  function trait(definition?: TraitDefinition): CandidateTrait {
    const id = nextTraitId++
    let traitKind: TraitKind = 'tag'
    let defaults: TraitShape | undefined
    let factory: (() => TraitShape) | undefined

    if (typeof definition === 'function') {
      traitKind = 'object'
      factory = definition
    } else if (definition !== undefined) {
      if (!isNumericShape(definition)) {
        throw new TypeError('Candidate numeric traits only accept number fields')
      }
      traitKind = 'numeric'
      defaults = definition
    }

    const handle = ((patch?: Partial<TraitShape>) => ({ trait: handle, patch })) as CandidateTrait
    Object.defineProperties(handle, {
      id: { value: id },
      kind: { value: traitKind },
      defaults: { value: defaults },
      factory: { value: factory },
    })
    return handle
  }

  function subscribeSelector(selector: CandidateSelector): void {
    for (const required of selector.traits) {
      ;(selectorSubscriptions[required.id] ??= []).push(selector)
    }
  }

  function subscribeEvent(selector: CandidateEventSelector): void {
    for (const watched of selector.watched) {
      ;(eventSubscriptions[watched.id] ??= []).push(selector)
    }
  }

  function createWorld(): CandidateWorld {
    const alive = new DenseSet()
    const generations: number[] = []
    const free: number[] = []
    const traitStates: Array<TraitState | undefined> = []
    const selectorStates: Array<SelectorState | undefined> = []
    const eventStates: Array<EventState | undefined> = []
    const signatures: number[][] = []
    const spawnTraitMarks: number[] = []
    let nextEntityIndex = 0
    let spawnMark = 0
    let disposed = false

    function assertUsable(): void {
      if (disposed) throw new Error('Candidate world has been disposed')
    }

    function isAlive(entity: Entity): boolean {
      const index = entityIndex(entity)
      return alive.has(index) && generations[index] === entityGeneration(entity)
    }

    function assertAlive(entity: Entity): number {
      assertUsable()
      if (!isAlive(entity)) throw new Error(`Stale entity handle: ${entity}`)
      return entityIndex(entity)
    }

    function ensureTraitState(handle: CandidateTrait): TraitState {
      let state = traitStates[handle.id]
      if (state !== undefined) return state

      let numeric: Record<string, number[]> | undefined
      if (handle.kind === 'numeric') {
        numeric = {}
        for (const field of Object.keys(handle.defaults!)) numeric[field] = []
      }
      state = {
        present: kind === 'signature-persistent' ? undefined : new DenseSet(),
        numeric,
        objects: handle.kind === 'object' ? [] : undefined,
      }
      traitStates[handle.id] = state
      return state
    }

    function getSignatureWord(index: number, word: number): number {
      return signatures[word]?.[index] ?? 0
    }

    function setSignatureBit(index: number, traitId: number, present: boolean): void {
      if (kind !== 'signature-persistent') return
      const word = traitId >>> 5
      const bit = 1 << (traitId & 31)
      const values = (signatures[word] ??= [])
      const current = values[index] ?? 0
      values[index] = present ? current | bit : current & ~bit
    }

    function matches(index: number, required: readonly CandidateTrait[]): boolean {
      if (!alive.has(index)) return false
      if (kind === 'signature-persistent') {
        let activeWord = -1
        let requiredMask = 0
        for (const handle of required) {
          const word = handle.id >>> 5
          if (word !== activeWord) {
            if (activeWord !== -1 && (getSignatureWord(index, activeWord) & requiredMask) !== requiredMask) {
              return false
            }
            activeWord = word
            requiredMask = 0
          }
          requiredMask |= 1 << (handle.id & 31)
        }
        return activeWord === -1 || (getSignatureWord(index, activeWord) & requiredMask) === requiredMask
      }

      for (const handle of required) {
        if (!traitStates[handle.id]?.present?.has(index)) return false
      }
      return true
    }

    function hasIndex(index: number, handle: CandidateTrait): boolean {
      if (kind === 'signature-persistent') {
        const bit = 1 << (handle.id & 31)
        return (getSignatureWord(index, handle.id >>> 5) & bit) !== 0
      }
      return traitStates[handle.id]?.present?.has(index) ?? false
    }

    function ensureSelectorState(selector: CandidateSelector): SelectorState {
      let state = selectorStates[selector.id]
      if (state !== undefined) return state
      state = { members: new DenseSet(), scratch: [] }
      selectorStates[selector.id] = state

      if (kind !== 'anchored-scan') {
        let anchor: readonly number[] = alive.dense
        if (kind !== 'signature-persistent') {
          for (const handle of selector.traits) {
            const candidate = traitStates[handle.id]?.present?.dense ?? []
            if (candidate.length < anchor.length) anchor = candidate
          }
        }
        for (const index of anchor) {
          if (matches(index, selector.traits)) {
            state.members.add(index)
            state.scratch.push(makeEntity(index, generations[index] ?? 0))
          }
        }
      }
      return state
    }

    function ensureEventState(selector: CandidateEventSelector): EventState {
      return (eventStates[selector.id] ??= {
        queue: new HandleQueue(),
        drained: [],
      })
    }

    function updatePersistentSelectors(index: number, changedTraitId: number): void {
      if (kind === 'anchored-scan') return
      for (const selector of selectorSubscriptions[changedTraitId] ?? []) {
        const state = selectorStates[selector.id]
        if (state === undefined) continue
        if (matches(index, selector.traits)) {
          if (state.members.add(index)) {
            state.scratch.push(makeEntity(index, generations[index] ?? 0))
          }
        } else {
          const position = state.members.indexOf(index)
          if (position === -1) continue
          state.members.delete(index)
          state.scratch.pop()
          if (position < state.members.dense.length) {
            const movedIndex = state.members.dense[position]!
            state.scratch[position] = makeEntity(movedIndex, generations[movedIndex] ?? 0)
          }
        }
      }
    }

    function eventRequirementsMatch(index: number, selector: CandidateEventSelector): boolean {
      return matches(index, selector.required)
    }

    function emit(kindToEmit: EventKind, handle: CandidateTrait, index: number): void {
      for (const selector of eventSubscriptions[handle.id] ?? []) {
        if (selector.kind !== kindToEmit || !eventRequirementsMatch(index, selector)) continue
        ensureEventState(selector).queue.add(makeEntity(index, generations[index] ?? 0))
      }
    }

    function applyPatch(index: number, handle: CandidateTrait, patch: Partial<TraitShape> | undefined): void {
      const state = ensureTraitState(handle)
      if (handle.kind === 'numeric') {
        const values: Record<string, unknown> = { ...handle.defaults, ...patch }
        for (const field of Object.keys(handle.defaults!)) {
          state.numeric![field]![index] = values[field] as number
        }
      } else if (handle.kind === 'object') {
        const values = handle.factory!()
        if (patch !== undefined) Object.assign(values, patch)
        state.objects![index] = values
      }
    }

    function addOne(entity: Entity, input: CandidateTraitInput): void {
      const index = assertAlive(entity)
      const initializer = isInitializer(input) ? input : undefined
      const handle = isInitializer(input) ? input.trait : input
      const state = ensureTraitState(handle)
      if (hasIndex(index, handle)) {
        throw new Error(`Entity ${entity} already has trait ${handle.id}`)
      }

      applyPatch(index, handle, initializer?.patch)
      state.present?.add(index)
      setSignatureBit(index, handle.id, true)
      updatePersistentSelectors(index, handle.id)
      emit('added', handle, index)
    }

    function preflightSpawn(inputs: readonly CandidateTraitInput[]): void {
      spawnMark++
      if (spawnMark === Number.MAX_SAFE_INTEGER) {
        spawnTraitMarks.fill(0)
        spawnMark = 1
      }

      for (const input of inputs) {
        const handle = isInitializer(input) ? input.trait : input
        if (spawnTraitMarks[handle.id] === spawnMark) {
          throw new Error(`Spawn contains duplicate trait ${handle.id}`)
        }
        spawnTraitMarks[handle.id] = spawnMark
      }
    }

    function spawn(...inputs: readonly CandidateTraitInput[]): Entity {
      assertUsable()
      preflightSpawn(inputs)
      if (free.length === 0 && nextEntityIndex > INDEX_MASK) {
        throw new RangeError('Candidate world exhausted its 20-bit entity index capacity')
      }
      const index = free.length > 0 ? free.pop()! : nextEntityIndex++
      const generation = generations[index] ?? 0
      generations[index] = generation
      alive.add(index)
      const entity = makeEntity(index, generation)
      for (const input of inputs) addOne(entity, input)
      return entity
    }

    function add(entity: Entity, ...inputs: readonly CandidateTraitInput[]): void {
      for (const input of inputs) addOne(entity, input)
    }

    function detachTrait(index: number, handle: CandidateTrait, emitRemoved: boolean): void {
      const state = traitStates[handle.id]
      if (state === undefined || !hasIndex(index, handle)) return

      state.present?.delete(index)
      setSignatureBit(index, handle.id, false)
      updatePersistentSelectors(index, handle.id)
      if (state.objects !== undefined) state.objects[index] = undefined
      if (emitRemoved) emit('removed', handle, index)
    }

    function remove(entity: Entity, handle: CandidateTrait): void {
      const index = assertAlive(entity)
      detachTrait(index, handle, true)
    }

    function has(entity: Entity, handle: CandidateTrait): boolean {
      if (!isAlive(entity)) return false
      const index = entityIndex(entity)
      return hasIndex(index, handle)
    }

    function read(entity: Entity, handle: CandidateTrait): TraitShape | undefined {
      if (!has(entity, handle)) return undefined
      const index = entityIndex(entity)
      const state = traitStates[handle.id]!
      if (handle.kind === 'tag') return {}
      if (handle.kind === 'object') return state.objects![index]

      const result: Record<string, number> = {}
      for (const field of Object.keys(handle.defaults!)) {
        result[field] = state.numeric![field]![index]!
      }
      return result
    }

    function patch(entity: Entity, handle: CandidateTrait, values: Partial<TraitShape>, tracked = true): void {
      const index = assertAlive(entity)
      const state = traitStates[handle.id]
      if (state === undefined || !hasIndex(index, handle)) {
        throw new Error(`Entity ${entity} does not have trait ${handle.id}`)
      }

      if (handle.kind === 'numeric') {
        for (const [field, value] of Object.entries(values)) {
          const fieldStore = state.numeric![field]
          if (fieldStore === undefined || typeof value !== 'number') {
            throw new TypeError(`Invalid numeric patch field: ${field}`)
          }
          fieldStore[index] = value
        }
      } else if (handle.kind === 'object') {
        Object.assign(state.objects![index]!, values)
      }
      if (tracked) emit('changed', handle, index)
    }

    function store(handle: CandidateTrait): Record<string, number[]> {
      if (handle.kind !== 'numeric') throw new TypeError('Only numeric traits have SoA stores')
      return ensureTraitState(handle).numeric!
    }

    function view(selector: CandidateSelector): readonly Entity[] {
      assertUsable()
      const state = ensureSelectorState(selector)

      if (kind === 'anchored-scan') {
        const target = state.scratch
        target.length = 0
        let anchor: readonly number[] = alive.dense
        for (const handle of selector.traits) {
          const candidate = traitStates[handle.id]?.present?.dense ?? []
          if (candidate.length < anchor.length) anchor = candidate
        }
        for (const index of anchor) {
          if (matches(index, selector.traits)) {
            target.push(makeEntity(index, generations[index] ?? 0))
          }
        }
        return target
      }
      return state.scratch
    }

    function drain(selector: CandidateEventSelector): readonly Entity[] {
      assertUsable()
      const state = ensureEventState(selector)
      state.drained.length = 0
      for (const entity of state.queue.dense) state.drained.push(entity)
      state.queue.clear()
      return state.drained
    }

    function destroy(entity: Entity): void {
      const index = assertAlive(entity)
      for (let traitId = 0; traitId < traitStates.length; traitId++) {
        const state = traitStates[traitId]
        if (state === undefined || !hasIndex(index, allTraits[traitId]!)) continue
        const handle = allTraits[traitId]!
        detachTrait(index, handle, false)
      }
      alive.delete(index)
      const nextGeneration = (generations[index] ?? 0) + 1
      generations[index] = Math.min(nextGeneration, MAX_GENERATION)
      if (nextGeneration < MAX_GENERATION) free.push(index)
    }

    function dispose(): void {
      if (disposed) return
      for (const state of traitStates) {
        state?.present?.clear()
        if (state?.objects !== undefined) state.objects.length = 0
        if (state?.numeric !== undefined) {
          for (const field of Object.values(state.numeric)) field.length = 0
        }
      }
      for (const state of selectorStates) {
        state?.members.clear()
        if (state !== undefined) state.scratch.length = 0
      }
      for (const state of eventStates) {
        state?.queue.clear()
        if (state !== undefined) state.drained.length = 0
      }
      alive.clear()
      signatures.length = 0
      free.length = 0
      disposed = true
    }

    return {
      get disposed(): boolean {
        return disposed
      },
      spawn,
      add,
      remove,
      has,
      read,
      patch,
      store,
      view,
      drain,
      destroy,
      dispose,
      isAlive,
      index: entityIndex,
      generation: entityGeneration,
    }
  }

  const allTraits: CandidateTrait[] = []
  const createTrait = ((definition?: TraitDefinition) => {
    const handle = trait(definition)
    allTraits[handle.id] = handle
    return handle
  }) as CandidateAdapter['trait']

  return {
    name: kind,
    trait: createTrait,
    select(...traitsToSelect: readonly CandidateTrait[]): CandidateSelector {
      if (traitsToSelect.length === 0) {
        throw new Error('Candidate selectors require at least one trait')
      }
      const selector = { id: nextSelectorId++, traits: traitsToSelect }
      selectors.push(selector)
      subscribeSelector(selector)
      return selector
    },
    added(watched: CandidateTrait, ...required: readonly CandidateTrait[]): CandidateEventSelector {
      const selector = {
        id: nextEventId++,
        kind: 'added' as const,
        watched: [watched],
        required,
      }
      events.push(selector)
      subscribeEvent(selector)
      return selector
    },
    changed(...watched: readonly CandidateTrait[]): CandidateEventSelector {
      const selector = {
        id: nextEventId++,
        kind: 'changed' as const,
        watched,
        required: [],
      }
      events.push(selector)
      subscribeEvent(selector)
      return selector
    },
    removed(watched: CandidateTrait, ...required: readonly CandidateTrait[]): CandidateEventSelector {
      const selector = {
        id: nextEventId++,
        kind: 'removed' as const,
        watched: [watched],
        required,
      }
      events.push(selector)
      subscribeEvent(selector)
      return selector
    },
    event(
      eventKind: EventKind,
      watched: readonly CandidateTrait[],
      required: readonly CandidateTrait[] = []
    ): CandidateEventSelector {
      const selector = {
        id: nextEventId++,
        kind: eventKind,
        watched,
        required,
      }
      events.push(selector)
      subscribeEvent(selector)
      return selector
    },
    createWorld,
    reset(): void {
      nextTraitId = 0
      nextSelectorId = 0
      nextEventId = 0
      allTraits.length = 0
      selectors.length = 0
      events.length = 0
      selectorSubscriptions.length = 0
      eventSubscriptions.length = 0
    },
  }
}

/** Build one benchmark-only kernel behind the shared Flatland behavior contract. */
export function createCandidateAdapter(kind: KernelKind): EcsAdapter {
  const runtime = createRuntimeAdapter(kind)
  let nextRelationId = 0

  return {
    name: runtime.name,

    numeric<TSchema extends NumericSchema>(defaults: TSchema): NumericTrait<TSchema> {
      return runtime.trait(defaults) as NumericTrait<TSchema>
    },

    object<TValue extends object>(factory: () => TValue): ObjectTrait<TValue> {
      return runtime.trait(factory as unknown as () => Record<string, unknown>) as ObjectTrait<TValue>
    },

    tag(): TagTrait {
      return runtime.trait() as TagTrait
    },

    exclusive(): ExclusiveRelation {
      return { id: nextRelationId++ } satisfies CandidateRelation
    },

    select(...required: readonly AnyTrait[]): Selector {
      return runtime.select(...required.map(asCandidateTrait)) as unknown as Selector
    },

    event(eventKind: EventKind, observed: readonly AnyTrait[], required: readonly AnyTrait[] = []): EventSelector {
      return runtime.event(
        eventKind,
        observed.map(asCandidateTrait),
        required.map(asCandidateTrait)
      ) as unknown as EventSelector
    },

    createWorld(): AdapterWorld {
      const world = runtime.createWorld()
      const relationTargets: Array<Array<Entity | undefined> | undefined> = []

      function toInput(value: Component): CandidateTraitInput {
        const handle = asCandidateTrait(value.trait)
        return value.initial === undefined ? handle : handle(value.initial as Partial<TraitShape>)
      }

      function assertAlive(entity: Entity): void {
        if (!world.isAlive(entity)) throw new Error(`Stale entity handle: ${entity}`)
      }

      return {
        get disposed(): boolean {
          return world.disposed
        },

        spawn(...components: readonly Component[]): Entity {
          return world.spawn(...components.map(toInput))
        },

        add<TValue>(entity: Entity, value: Component<TValue>): void {
          world.add(entity, toInput(value as Component))
        },

        remove(entity: Entity, handle: AnyTrait): void {
          world.remove(entity, asCandidateTrait(handle))
        },

        has(entity: Entity, handle: AnyTrait): boolean {
          return world.has(entity, asCandidateTrait(handle))
        },

        read<TValue>(entity: Entity, handle: Trait<TValue>): TValue | undefined {
          return world.read(entity, asCandidateTrait(handle)) as TValue | undefined
        },

        patch<TValue extends object>(
          entity: Entity,
          handle: Trait<TValue>,
          value: Partial<TValue>,
          tracked = true
        ): void {
          world.patch(entity, asCandidateTrait(handle), value as Partial<TraitShape>, tracked)
        },

        store<TSchema extends NumericSchema>(handle: NumericTrait<TSchema>): NumericStore<TSchema> {
          return world.store(asCandidateTrait(handle)) as NumericStore<TSchema>
        },

        view(selector: Selector): readonly Entity[] {
          return world.view(asCandidateSelector(selector))
        },

        drain(selector: EventSelector): readonly Entity[] {
          return world.drain(asCandidateEvent(selector))
        },

        assign(entity: Entity, relation: ExclusiveRelation, target: Entity): void {
          assertAlive(entity)
          assertAlive(target)
          const relationId = asCandidateRelation(relation).id
          const targets = (relationTargets[relationId] ??= [])
          targets[world.index(entity)] = target
        },

        unassign(entity: Entity, relation: ExclusiveRelation): void {
          assertAlive(entity)
          const targets = relationTargets[asCandidateRelation(relation).id]
          if (targets !== undefined) targets[world.index(entity)] = undefined
        },

        target(entity: Entity, relation: ExclusiveRelation): Entity | undefined {
          if (!world.isAlive(entity)) return undefined
          const target = relationTargets[asCandidateRelation(relation).id]?.[world.index(entity)]
          return target !== undefined && world.isAlive(target) ? target : undefined
        },

        destroy(entity: Entity): void {
          const index = world.index(entity)
          world.destroy(entity)
          for (const targets of relationTargets) {
            if (targets !== undefined) targets[index] = undefined
          }
        },

        isAlive(entity: Entity): boolean {
          return world.isAlive(entity)
        },

        index(entity: Entity): number {
          return world.index(entity)
        },

        generation(entity: Entity): number {
          return world.generation(entity)
        },

        dispose(): void {
          world.dispose()
          for (const targets of relationTargets) targets?.splice(0)
        },
      }
    },

    reset(): void {
      runtime.reset()
      nextRelationId = 0
    },
  }
}
