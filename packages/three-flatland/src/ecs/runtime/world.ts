import { EntityPool, entityGeneration, entityIndex } from './entity'
import type { Entity } from './entity'
import type { WorldHandle } from '../../internal/ecs-handles'
import type { EventKind, EventSelector, Selector } from './selector'
import { SparseSet } from './sparse-set'
import {
  inputTrait,
  isInitializer,
  numericDataSnapshot,
  type AnyTrait,
  type NumericSchema,
  type NumericStore,
  type NumericTrait,
  type NumericUpdate,
  type ObjectTrait,
  type Trait,
  type TraitInput,
} from './trait'

interface TraitState {
  readonly trait: AnyTrait
  readonly numeric?: Record<string, number[]>
  readonly objects?: Array<object | undefined>
}

interface SelectorState {
  readonly members: SparseSet
  readonly view: Entity[]
}

interface EventState {
  readonly queue: HandleQueue
  readonly drained: Entity[]
}

interface PreparedInput {
  readonly trait: AnyTrait
  readonly numericInitial?: Record<string, number>
  readonly objectValue?: object
}

interface ValidatedNumericFields {
  readonly fields: readonly string[]
  readonly snapshot: Record<string, number>
}

class HandleQueue {
  readonly dense: Entity[] = []
  private readonly positions: Array<number | undefined> = []

  add(entity: Entity): boolean {
    const index = entityIndex(entity)
    const position = this.positions[index]
    if (position !== undefined && this.dense[position] === entity) return false

    // Different generations for one index may coexist until this consumer
    // drains. That collision is rare, so keep the common path sparse by index.
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

  release(): void {
    this.dense.length = 0
    this.positions.length = 0
  }
}

export interface World extends WorldHandle {
  readonly disposed: boolean

  spawn(...inputs: readonly TraitInput[]): Entity
  add(entity: Entity, input: TraitInput): void
  remove(entity: Entity, trait: AnyTrait): void
  has(entity: Entity, trait: AnyTrait): boolean
  /** Cold access: numeric traits return an allocating snapshot; object traits return their stored reference. */
  read<TValue>(entity: Entity, trait: Trait<TValue>): TValue | undefined
  patch<TSchema extends NumericSchema, TInput extends object>(
    entity: Entity,
    trait: NumericTrait<TSchema>,
    value: NumericUpdate<TSchema, TInput>,
    tracked?: boolean
  ): void
  patch<TValue extends object>(
    entity: Entity,
    trait: ObjectTrait<TValue>,
    value: Partial<TValue>,
    tracked?: boolean
  ): void
  store<TSchema extends NumericSchema>(trait: NumericTrait<TSchema>): NumericStore<TSchema>
  /** Emit Changed after trusted direct-store writes without allocating a patch object. */
  touch(entity: Entity, trait: AnyTrait): void

  /** Activate one event consumer before mutations it must observe. */
  activate(selector: EventSelector): void
  /** Borrowed view. Callers must not retain or mutate it. */
  view(selector: Selector): readonly Entity[]
  /** Borrowed queue view. A later drain of this selector reuses it. */
  drain(selector: EventSelector): readonly Entity[]

  destroy(entity: Entity): void
  isAlive(entity: Entity): boolean
  index(entity: Entity): number
  generation(entity: Entity): number
  dispose(): void
}

export function createWorld(): World {
  const entities = new EntityPool()
  const signatures: number[][] = []
  const activeSignatureWords: number[] = []
  const traitStates: Array<TraitState | undefined> = []
  const activeTraitStates: TraitState[] = []
  const selectorStates: Array<SelectorState | undefined> = []
  const activeSelectorStates: SelectorState[] = []
  const selectorSubscriptions: Selector[][] = []
  const eventStates: Array<EventState | undefined> = []
  const activeEventStates: EventState[] = []
  const eventSubscriptions: EventSelector[][] = []
  const spawnTraitMarks: number[] = []
  let spawnMark = 0
  let disposed = false
  let inputPreparationDepth = 0

  function assertUsable(): void {
    if (disposed) throw new Error('three-flatland: World has been disposed')
    if (inputPreparationDepth > 0) {
      throw new Error('three-flatland: Trait inputs cannot access mutable world state')
    }
  }

  function withInputPreparation<T>(prepare: () => T): T {
    inputPreparationDepth++
    try {
      return prepare()
    } finally {
      inputPreparationDepth--
    }
  }

  function isAlive(entity: Entity): boolean {
    return !disposed && entities.isAlive(entity)
  }

  function assertAlive(entity: Entity): number {
    assertUsable()
    if (!isAlive(entity)) throw new Error(`three-flatland: Stale entity handle ${entity}`)
    return entityIndex(entity)
  }

  function signatureWord(index: number, word: number): number {
    return signatures[word]?.[index] ?? 0
  }

  function hasIndex(index: number, trait: AnyTrait): boolean {
    const bit = 1 << (trait.id & 31)
    return (signatureWord(index, trait.id >>> 5) & bit) !== 0
  }

  function setPresence(index: number, traitId: number, present: boolean): void {
    const word = traitId >>> 5
    const bit = 1 << (traitId & 31)
    let values = signatures[word]
    if (values === undefined) {
      values = []
      signatures[word] = values
      activeSignatureWords.push(word)
    }
    const current = values[index] ?? 0
    values[index] = present ? current | bit : current & ~bit
  }

  function matches(index: number, words: readonly number[], masks: readonly number[]): boolean {
    if (!entities.alive.has(index)) return false
    for (let position = 0; position < words.length; position++) {
      const mask = masks[position]!
      if ((signatureWord(index, words[position]!) & mask) !== mask) return false
    }
    return true
  }

  function ensureTraitState(trait: AnyTrait): TraitState {
    let state = traitStates[trait.id]
    if (state !== undefined) return state

    let numeric: Record<string, number[]> | undefined
    if (trait.kind === 'numeric') {
      numeric = {}
      for (const field of (trait as NumericTrait<NumericSchema>).fields) {
        Object.defineProperty(numeric, field, {
          enumerable: true,
          value: [],
        })
      }
    }
    state = {
      trait,
      numeric,
      objects: trait.kind === 'object' ? [] : undefined,
    }
    traitStates[trait.id] = state
    activeTraitStates.push(state)
    return state
  }

  function validatedNumericFields(trait: NumericTrait<NumericSchema>, value: object): ValidatedNumericFields {
    const snapshot = numericDataSnapshot(value)
    if (snapshot === undefined) {
      throw new TypeError('three-flatland: Invalid numeric initializer object')
    }
    const fields = Object.keys(snapshot)
    for (const field of fields) {
      if (!Object.hasOwn(trait.defaults, field)) {
        throw new TypeError(`three-flatland: Invalid numeric initializer field ${field}`)
      }
    }
    return { fields, snapshot }
  }

  function validateNumericInitial(
    trait: NumericTrait<NumericSchema>,
    initial: object | undefined
  ): Record<string, number> | undefined {
    return initial === undefined ? undefined : validatedNumericFields(trait, initial).snapshot
  }

  function prepareObjectValue(trait: ObjectTrait<object>, initial: object | undefined): object {
    const value = trait.factory()
    if (typeof value !== 'object' || value === null) {
      throw new TypeError('three-flatland: Object trait factories must return an object')
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('three-flatland: Object trait factories must return plain records')
    }
    if (initial !== undefined) applyObjectPatch(value, snapshotObjectPatch(value, initial))
    return value
  }

  function snapshotObjectPatch(target: object, patch: object): object {
    const targetPrototype = Object.getPrototypeOf(target)
    if (targetPrototype !== Object.prototype && targetPrototype !== null) {
      throw new TypeError('three-flatland: Object traits support only plain record values')
    }
    const snapshot = Object.create(null) as object
    for (const field of Reflect.ownKeys(patch)) {
      const sourceDescriptor = Object.getOwnPropertyDescriptor(patch, field)
      if (sourceDescriptor?.enumerable !== true) continue
      const targetDescriptor = Object.getOwnPropertyDescriptor(target, field)
      if (targetDescriptor === undefined || !('value' in targetDescriptor) || targetDescriptor.writable !== true) {
        throw new TypeError('three-flatland: Object trait patches require existing writable data fields')
      }
      Object.defineProperty(snapshot, field, {
        enumerable: true,
        value: Reflect.get(patch, field),
      })
    }
    return snapshot
  }

  function applyObjectPatch(target: object, snapshot: object): void {
    for (const field of Reflect.ownKeys(snapshot)) {
      Object.defineProperty(target, field, {
        value: Reflect.get(snapshot, field),
      })
    }
  }

  function applyNumericPatch(
    index: number,
    trait: NumericTrait<NumericSchema>,
    value: object,
    state: TraitState
  ): void {
    const { fields, snapshot } = validatedNumericFields(trait, value)
    for (const field of fields) {
      state.numeric![field]![index] = snapshot[field]!
    }
  }

  function writeTrait(
    index: number,
    trait: AnyTrait,
    initial: object | undefined,
    preparedObject: object | undefined
  ): void {
    const state = ensureTraitState(trait)
    if (trait.kind === 'numeric') {
      const numericTrait = trait as NumericTrait<NumericSchema>
      const patch = initial as Record<string, number> | undefined
      for (const field of numericTrait.fields) {
        state.numeric![field]![index] =
          patch !== undefined && Object.hasOwn(patch, field) ? patch[field]! : numericTrait.defaults[field]!
      }
    } else if (trait.kind === 'object') {
      state.objects![index] = preparedObject
    }
  }

  function ensureSelectorState(selector: Selector): SelectorState {
    let state = selectorStates[selector.id]
    if (state !== undefined) return state
    state = { members: new SparseSet(), view: [] }
    selectorStates[selector.id] = state
    activeSelectorStates.push(state)
    for (const trait of selector.required) {
      ;(selectorSubscriptions[trait.id] ??= []).push(selector)
    }

    for (const index of entities.alive.dense) {
      if (!matches(index, selector.words, selector.masks)) continue
      state.members.add(index)
      state.view.push(entities.handle(index))
    }
    return state
  }

  function updateSelectors(index: number, changedTraitId: number): void {
    for (const selector of selectorSubscriptions[changedTraitId] ?? []) {
      const state = selectorStates[selector.id]
      if (state === undefined) continue

      if (matches(index, selector.words, selector.masks)) {
        if (state.members.add(index)) {
          state.view.push(entities.handle(index))
        }
        continue
      }

      const position = state.members.indexOf(index)
      if (position === -1) continue
      state.members.delete(index)
      state.view.pop()
      if (position < state.members.dense.length) {
        const movedIndex = state.members.dense[position]!
        state.view[position] = entities.handle(movedIndex)
      }
    }
  }

  function ensureEventState(selector: EventSelector): EventState {
    let state = eventStates[selector.id]
    if (state !== undefined) return state
    state = {
      drained: [],
      queue: new HandleQueue(),
    }
    eventStates[selector.id] = state
    activeEventStates.push(state)
    for (const trait of selector.observed) {
      ;(eventSubscriptions[trait.id] ??= []).push(selector)
    }
    return state
  }

  function emit(kind: EventKind, trait: AnyTrait, index: number): void {
    for (const selector of eventSubscriptions[trait.id] ?? []) {
      if (selector.kind !== kind || !matches(index, selector.words, selector.masks)) continue
      eventStates[selector.id]?.queue.add(entities.handle(index))
    }
  }

  function prepareSpawnInputs(inputs: readonly TraitInput[]): readonly PreparedInput[] {
    spawnMark++
    if (spawnMark === Number.MAX_SAFE_INTEGER) {
      spawnTraitMarks.fill(0)
      spawnMark = 1
    }

    const initialValues: Array<object | undefined> = []
    const prepared: PreparedInput[] = []
    for (const input of inputs) {
      const trait = inputTrait(input)
      if (spawnTraitMarks[trait.id] === spawnMark) {
        throw new Error(`three-flatland: Spawn contains duplicate trait ${trait.id}`)
      }
      spawnTraitMarks[trait.id] = spawnMark
      const initial = isInitializer(input) ? input.initial : undefined
      initialValues.push(initial)
      if (trait.kind === 'tag' && initial !== undefined) {
        throw new TypeError('three-flatland: Tag traits do not accept initial values')
      }
      if (trait.kind === 'numeric') {
        prepared.push({
          numericInitial: validateNumericInitial(trait as NumericTrait<NumericSchema>, initial),
          trait,
        })
      } else {
        prepared.push({ trait })
      }
    }
    for (let position = 0; position < prepared.length; position++) {
      const input = prepared[position]!
      if (input.trait.kind !== 'object') continue
      prepared[position] = {
        objectValue: prepareObjectValue(input.trait as ObjectTrait<object>, initialValues[position]),
        trait: input.trait,
      }
    }
    return prepared
  }

  function spawn(...inputs: readonly TraitInput[]): Entity {
    assertUsable()
    const prepared = withInputPreparation(() => prepareSpawnInputs(inputs))
    assertUsable()
    entities.assertCanAllocate()

    const entity = entities.allocate()
    const index = entityIndex(entity)

    for (const input of prepared) {
      writeTrait(index, input.trait, input.numericInitial, input.objectValue)
      setPresence(index, input.trait.id, true)
    }
    for (const input of prepared) updateSelectors(index, input.trait.id)
    for (const input of prepared) emit('added', input.trait, index)
    return entity
  }

  function add(entity: Entity, input: TraitInput): void {
    const index = assertAlive(entity)
    const prepared = withInputPreparation((): PreparedInput => {
      const trait = inputTrait(input)
      if (hasIndex(index, trait)) {
        throw new Error(`three-flatland: Entity ${entity} already has trait ${trait.id}`)
      }

      const initial = isInitializer(input) ? input.initial : undefined
      if (trait.kind === 'tag' && initial !== undefined) {
        throw new TypeError('three-flatland: Tag traits do not accept initial values')
      }
      return {
        numericInitial:
          trait.kind === 'numeric' ? validateNumericInitial(trait as NumericTrait<NumericSchema>, initial) : undefined,
        objectValue: trait.kind === 'object' ? prepareObjectValue(trait as ObjectTrait<object>, initial) : undefined,
        trait,
      }
    })
    assertAlive(entity)

    writeTrait(index, prepared.trait, prepared.numericInitial, prepared.objectValue)
    setPresence(index, prepared.trait.id, true)
    updateSelectors(index, prepared.trait.id)
    emit('added', prepared.trait, index)
  }

  function remove(entity: Entity, trait: AnyTrait): void {
    const index = assertAlive(entity)
    if (!hasIndex(index, trait)) return

    setPresence(index, trait.id, false)
    updateSelectors(index, trait.id)
    const state = traitStates[trait.id]
    if (state?.objects !== undefined) state.objects[index] = undefined
    emit('removed', trait, index)
  }

  function has(entity: Entity, trait: AnyTrait): boolean {
    return isAlive(entity) && hasIndex(entityIndex(entity), trait)
  }

  function read<TValue>(entity: Entity, trait: Trait<TValue>): TValue | undefined {
    assertUsable()
    if (!has(entity, trait)) return undefined
    const index = entityIndex(entity)
    const state = traitStates[trait.id]!
    if (trait.kind === 'tag') return undefined
    if (trait.kind === 'object') return state.objects![index] as TValue

    const result: Record<string, number> = {}
    const numericTrait = trait as unknown as NumericTrait<NumericSchema>
    for (const field of numericTrait.fields) {
      Object.defineProperty(result, field, {
        configurable: true,
        enumerable: true,
        value: state.numeric![field]![index]!,
        writable: true,
      })
    }
    return result as TValue
  }

  function patch<TValue extends object>(
    entity: Entity,
    trait: Trait<TValue>,
    value: Partial<TValue>,
    tracked = true
  ): void {
    const index = assertAlive(entity)
    withInputPreparation(() => {
      if (!hasIndex(index, trait)) {
        throw new Error(`three-flatland: Entity ${entity} does not have trait ${trait.id}`)
      }
      const state = traitStates[trait.id]!
      if (trait.kind === 'numeric') {
        applyNumericPatch(index, trait as unknown as NumericTrait<NumericSchema>, value, state)
        return
      }
      if (trait.kind === 'object') {
        const target = state.objects![index]!
        applyObjectPatch(target, snapshotObjectPatch(target, value))
        return
      }
      throw new TypeError('three-flatland: Tag traits cannot be patched')
    })
    assertAlive(entity)
    if (tracked) emit('changed', trait, index)
  }

  function touch(entity: Entity, trait: AnyTrait): void {
    const index = assertAlive(entity)
    if (!hasIndex(index, trait)) {
      throw new Error(`three-flatland: Entity ${entity} does not have trait ${trait.id}`)
    }
    emit('changed', trait, index)
  }

  function store<TSchema extends NumericSchema>(trait: NumericTrait<TSchema>): NumericStore<TSchema> {
    assertUsable()
    return ensureTraitState(trait).numeric as NumericStore<TSchema>
  }

  function view(selector: Selector): readonly Entity[] {
    assertUsable()
    return ensureSelectorState(selector).view
  }

  function activate(selector: EventSelector): void {
    assertUsable()
    ensureEventState(selector)
  }

  function drain(selector: EventSelector): readonly Entity[] {
    assertUsable()
    const state = eventStates[selector.id]
    if (state === undefined) {
      throw new Error('three-flatland: Event selector must be activated before it can be drained')
    }
    state.drained.length = 0
    for (const entity of state.queue.dense) state.drained.push(entity)
    state.queue.clear()
    return state.drained
  }

  function destroy(entity: Entity): void {
    const index = assertAlive(entity)
    for (const word of activeSignatureWords) {
      let bits = signatureWord(index, word) >>> 0
      if (bits === 0) continue
      signatures[word]![index] = 0

      while (bits !== 0) {
        const bit = 31 - Math.clz32(bits & -bits)
        const traitId = word * 32 + bit
        updateSelectors(index, traitId)
        const state = traitStates[traitId]
        if (state?.objects !== undefined) state.objects[index] = undefined
        bits = (bits & (bits - 1)) >>> 0
      }
    }

    entities.destroy(entity)
  }

  function dispose(): void {
    if (disposed) return
    if (inputPreparationDepth > 0) {
      throw new Error('three-flatland: Trait inputs cannot access mutable world state')
    }
    for (const state of activeTraitStates) {
      if (state.objects !== undefined) state.objects.length = 0
      if (state.numeric !== undefined) {
        for (const field of Object.values(state.numeric)) field.length = 0
      }
    }
    for (const state of activeSelectorStates) {
      state.members.release()
      state.view.length = 0
    }
    for (const state of activeEventStates) {
      state.queue.release()
      state.drained.length = 0
    }
    entities.dispose()
    signatures.length = 0
    activeSignatureWords.length = 0
    activeTraitStates.length = 0
    activeSelectorStates.length = 0
    activeEventStates.length = 0
    spawnTraitMarks.length = 0
    traitStates.length = 0
    selectorStates.length = 0
    eventStates.length = 0
    selectorSubscriptions.length = 0
    eventSubscriptions.length = 0
    disposed = true
  }

  return {
    get disposed(): boolean {
      return disposed
    },
    activate,
    add,
    destroy,
    dispose,
    drain,
    generation: entityGeneration,
    has,
    index: entityIndex,
    isAlive,
    patch,
    read,
    remove,
    spawn,
    store,
    touch,
    view,
  } as unknown as World
}
