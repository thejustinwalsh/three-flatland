import { component, type EcsAdapter, type Entity } from './adapter.ts'

type SnapshotValue = boolean | number | string | null | Snapshot | readonly SnapshotValue[]

export interface Snapshot {
  readonly [key: string]: SnapshotValue
}

export interface ScenarioReport extends Snapshot {
  readonly emptySelector: Snapshot
  readonly initialization: Snapshot
  readonly duplicateAdd: Snapshot
  readonly duplicateSpawn: Snapshot
  readonly factoryIsolation: Snapshot
  readonly tags: Snapshot
  readonly numericStore: Snapshot
  readonly selectors: Snapshot
  readonly events: Snapshot
  readonly lifecycle: Snapshot
  readonly generationSafety: Snapshot
  readonly multiwordSelectors: Snapshot
  readonly disposal: Snapshot
  readonly dynamicTraits: Snapshot
  readonly exclusiveAssignment: Snapshot
}

function captureEmptySelector(adapter: EcsAdapter): Snapshot {
  let threw = false
  try {
    adapter.select()
  } catch {
    threw = true
  }
  return { threw }
}

function required<TValue>(value: TValue | undefined, context: string): TValue {
  if (value === undefined) throw new Error(`Scenario invariant failed: ${context}`)
  return value
}

function entityLabels(entities: readonly Entity[], labels: ReadonlyMap<Entity, string>): string[] {
  return entities.map((entity) => required(labels.get(entity), `missing logical label for entity ${entity}`)).sort()
}

function value<TValue>(worldValue: TValue | undefined, context: string): TValue {
  return required(worldValue, context)
}

function captureInitialization(adapter: EcsAdapter): Snapshot {
  const Position = adapter.numeric({ x: 1, y: 2 })
  const world = adapter.createWorld()
  const defaults = world.spawn(component(Position))
  const partial = world.spawn(component(Position, { x: 7 }))
  const result = {
    defaults: value(world.read(defaults, Position), 'numeric defaults'),
    partial: value(world.read(partial, Position), 'numeric partial initializer'),
  }
  world.dispose()
  return result
}

function captureDuplicateAdd(adapter: EcsAdapter): Snapshot {
  const State = adapter.numeric({ value: 1 })
  const ChangedState = adapter.event('changed', [State])
  const world = adapter.createWorld()
  const entity = world.spawn(component(State, { value: 7 }))
  let threw = false

  try {
    world.add(entity, component(State, { value: 99 }))
  } catch {
    threw = true
  }

  const result = {
    threw,
    preservedValue: value(world.read(entity, State), 'state after duplicate add').value,
    changedEvents: world.drain(ChangedState).length,
  }
  world.dispose()
  return result
}

function captureDuplicateSpawn(adapter: EcsAdapter): Snapshot {
  const State = adapter.numeric({ value: 1 })
  const StateEntities = adapter.select(State)
  const AddedState = adapter.event('added', [State])

  const pristineWorld = adapter.createWorld()
  const pristineFirstIndex = pristineWorld.index(pristineWorld.spawn())
  pristineWorld.dispose()

  const world = adapter.createWorld()
  let duplicateEntity: Entity | undefined
  let threw = false
  try {
    duplicateEntity = world.spawn(component(State, { value: 7 }), component(State, { value: 99 }))
  } catch {
    threw = true
  }

  const traitQueryCount = world.view(StateEntities).length
  const addedEvents = world.drain(AddedState).length
  const store = world.store(State)
  const storeDefinedValues = Array.from(store.value).filter((storedValue) => storedValue !== undefined).length
  const returnedEntityAlive = duplicateEntity !== undefined && world.isAlive(duplicateEntity)
  const firstAfterAttempt = world.spawn()
  const nextIndexMatchesPristine = world.index(firstAfterAttempt) === pristineFirstIndex

  world.dispose()
  return {
    threw,
    returnedEntityAlive,
    traitQueryCount,
    addedEvents,
    storeDefinedValues,
    nextIndexMatchesPristine,
  }
}

function captureFactoryIsolation(adapter: EcsAdapter): Snapshot {
  const Inventory = adapter.object(() => ({ items: [] as number[], owner: 'nobody' }))
  const firstWorld = adapter.createWorld()
  const secondWorld = adapter.createWorld()
  const first = firstWorld.spawn(component(Inventory))
  const second = firstWorld.spawn(component(Inventory))
  const third = secondWorld.spawn(component(Inventory))
  const partial = firstWorld.spawn(component(Inventory, { owner: 'partial' }))

  const firstValue = value(firstWorld.read(first, Inventory), 'first factory value')
  firstValue.owner = 'first'
  firstValue.items.push(42)

  const secondValue = value(firstWorld.read(second, Inventory), 'second factory value')
  const thirdValue = value(secondWorld.read(third, Inventory), 'cross-world factory value')
  const partialValue = value(firstWorld.read(partial, Inventory), 'partial factory initializer')
  const result = {
    firstOwner: firstValue.owner,
    partialInitializerOwner: partialValue.owner,
    partialInitializerPreservesDefaults: Array.isArray(partialValue.items),
    firstItems: [...firstValue.items],
    sameWorldItems: [...secondValue.items],
    otherWorldItems: [...thirdValue.items],
    sameWorldDistinct: firstValue !== secondValue,
    otherWorldDistinct: firstValue !== thirdValue,
  }

  firstWorld.dispose()
  secondWorld.dispose()
  return result
}

function captureTags(adapter: EcsAdapter): Snapshot {
  const Visible = adapter.tag()
  const world = adapter.createWorld()
  const entity = world.spawn()
  const before = world.has(entity, Visible)
  world.add(entity, component(Visible))
  const afterAdd = world.has(entity, Visible)
  world.remove(entity, Visible)
  const afterRemove = world.has(entity, Visible)
  world.dispose()
  return { before, afterAdd, afterRemove }
}

function captureNumericStore(adapter: EcsAdapter): Snapshot {
  const Position = adapter.numeric({ x: 0, y: 0 })
  const ChangedPosition = adapter.event('changed', [Position])
  const world = adapter.createWorld()
  const entity = world.spawn(component(Position, { x: 2 }))
  const index = world.index(entity)

  world.patch(entity, Position, { x: 3 })
  world.patch(entity, Position, { y: 4 })
  const trackedDrainCount = world.drain(ChangedPosition).length
  const repeatedDrainCount = world.drain(ChangedPosition).length

  world.patch(entity, Position, { x: 5 }, false)
  const untrackedDrainCount = world.drain(ChangedPosition).length

  const store = world.store(Position)
  store.y[index] = 9
  const directWriteDrainCount = world.drain(ChangedPosition).length
  const readAfterDirectWrite = value(world.read(entity, Position), 'direct store write')

  const result = {
    trackedDrainCount,
    repeatedDrainCount,
    untrackedDrainCount,
    directWriteDrainCount,
    readAfterDirectWrite,
    storeAfterDirectWrite: { x: store.x[index]!, y: store.y[index]! },
  }
  world.dispose()
  return result
}

function captureSelectors(adapter: EcsAdapter): Snapshot {
  const Position = adapter.numeric({ x: 0 })
  const Active = adapter.tag()
  const Positions = adapter.select(Position)
  const ActivePositions = adapter.select(Position, Active)
  const world = adapter.createWorld()
  const positionedAndActive = world.spawn(component(Position), component(Active))
  const positioned = world.spawn(component(Position))
  const active = world.spawn(component(Active))
  const labels = new Map<Entity, string>([
    [positionedAndActive, 'positioned-and-active'],
    [positioned, 'positioned'],
    [active, 'active'],
  ])

  const before = entityLabels(world.view(ActivePositions), labels)
  world.add(positioned, component(Active))
  const afterAdd = entityLabels(world.view(ActivePositions), labels)
  world.remove(positionedAndActive, Active)
  const afterRemove = entityLabels(world.view(ActivePositions), labels)
  const allPositions = entityLabels(world.view(Positions), labels)

  world.dispose()
  return { before, afterAdd, afterRemove, allPositions }
}

function captureEvents(adapter: EcsAdapter): Snapshot {
  const Renderable = adapter.tag()
  const IsBatched = adapter.tag()
  const SortLayer = adapter.numeric({ value: 0 })
  const Material = adapter.numeric({ id: 0 })
  const CameraMask = adapter.numeric({ mask: 1 })
  const RemovalState = adapter.numeric({ slot: -1 })

  const AddedA = adapter.event('added', [Renderable])
  const AddedB = adapter.event('added', [Renderable])
  const RemovedA = adapter.event('removed', [Renderable])
  const RemovedB = adapter.event('removed', [Renderable])
  const ChangedA = adapter.event('changed', [SortLayer, Material, CameraMask], [IsBatched])
  const ChangedB = adapter.event('changed', [SortLayer, Material, CameraMask], [IsBatched])

  const world = adapter.createWorld()
  const routed = world.spawn(
    component(Renderable),
    component(IsBatched),
    component(SortLayer),
    component(Material),
    component(CameraMask),
    component(RemovalState, { slot: 12 })
  )
  const notBatched = world.spawn(component(SortLayer), component(Material), component(CameraMask))
  const transient = world.spawn()
  const labels = new Map<Entity, string>([
    [routed, 'routed'],
    [notBatched, 'not-batched'],
    [transient, 'transient'],
  ])

  const addedFirst = entityLabels(world.drain(AddedA), labels)
  const addedRepeat = entityLabels(world.drain(AddedA), labels)
  const addedIndependent = entityLabels(world.drain(AddedB), labels)

  world.patch(routed, SortLayer, { value: 1 })
  world.patch(routed, Material, { id: 2 })
  world.patch(routed, CameraMask, { mask: 4 })
  world.patch(routed, SortLayer, { value: 3 })
  world.patch(notBatched, SortLayer, { value: 99 })

  const changedDeduplicated = entityLabels(world.drain(ChangedA), labels)
  const changedRepeat = entityLabels(world.drain(ChangedA), labels)
  const changedIndependent = entityLabels(world.drain(ChangedB), labels)

  world.patch(routed, SortLayer, { value: 5 }, false)
  const changedUntracked = entityLabels(world.drain(ChangedA), labels)

  world.remove(routed, Renderable)
  const removedFirst = entityLabels(world.drain(RemovedA), labels)
  const removalState = value(world.read(routed, RemovalState), 'remaining trait during removal event').slot
  const removedRepeat = entityLabels(world.drain(RemovedA), labels)
  const removedIndependent = entityLabels(world.drain(RemovedB), labels)

  world.add(transient, component(Renderable))
  world.remove(transient, Renderable)
  const addThenRemoveAdded = entityLabels(world.drain(AddedA), labels)
  const addThenRemoveRemoved = entityLabels(world.drain(RemovedA), labels)

  world.dispose()
  return {
    addedFirst,
    addedRepeat,
    addedIndependent,
    changedDeduplicated,
    changedRepeat,
    changedIndependent,
    changedUntracked,
    removedFirst,
    removalState,
    removedRepeat,
    removedIndependent,
    addThenRemoveAdded,
    addThenRemoveRemoved,
  }
}

function captureLifecycle(adapter: EcsAdapter): Snapshot {
  const Data = adapter.numeric({ value: 0 })
  const DataEntities = adapter.select(Data)
  const firstWorld = adapter.createWorld()
  const secondWorld = adapter.createWorld()
  const stale = firstWorld.spawn(component(Data, { value: 11 }))
  const secondEntity = secondWorld.spawn(component(Data, { value: 22 }))
  const staleIndex = firstWorld.index(stale)
  const staleGeneration = firstWorld.generation(stale)
  const isolatedValuesBefore = [
    value(firstWorld.read(stale, Data), 'first-world state').value,
    value(secondWorld.read(secondEntity, Data), 'second-world state').value,
  ]
  const isolatedSelectorsBefore = [firstWorld.view(DataEntities).length, secondWorld.view(DataEntities).length]

  firstWorld.destroy(stale)
  const staleAlive = firstWorld.isAlive(stale)
  const secondAliveAfterFirstDestroy = secondWorld.isAlive(secondEntity)
  const secondValueAfterFirstDestroy = value(
    secondWorld.read(secondEntity, Data),
    'second-world state after first-world destroy'
  ).value
  const recycled = firstWorld.spawn(component(Data, { value: 1 }))
  const recycledIndex = firstWorld.index(recycled)
  const recycledGeneration = firstWorld.generation(recycled)
  const result = {
    staleAlive,
    recycledAlive: firstWorld.isAlive(recycled),
    reusedIndex: staleIndex === recycledIndex,
    advancedGeneration: recycledGeneration !== staleGeneration,
    isolatedValuesBefore,
    isolatedSelectorsBefore,
    secondAliveAfterFirstDestroy,
    secondValueAfterFirstDestroy,
  }

  firstWorld.dispose()
  secondWorld.dispose()
  return result
}

function captureGenerationSafety(adapter: EcsAdapter): Snapshot {
  const Queued = adapter.tag()
  const Selected = adapter.tag()
  const Destroyed = adapter.tag()
  const AddedQueued = adapter.event('added', [Queued])
  const RemovedDestroyed = adapter.event('removed', [Destroyed])
  const SelectedEntities = adapter.select(Selected)

  const eventWorld = adapter.createWorld()
  const staleQueued = eventWorld.spawn(component(Queued))
  const staleQueuedIndex = eventWorld.index(staleQueued)
  eventWorld.destroy(staleQueued)
  const recycledQueued = eventWorld.spawn(component(Queued))
  const queuedEvents = eventWorld.drain(AddedQueued)
  const eventResult = {
    recycledSameIndex: staleQueuedIndex === eventWorld.index(recycledQueued),
    handlesDiffer: staleQueued !== recycledQueued,
    queuedCount: queuedEvents.length,
    containsStaleGeneration: queuedEvents.includes(staleQueued),
    containsRecycledGeneration: queuedEvents.includes(recycledQueued),
  }
  eventWorld.dispose()

  const selectorWorld = adapter.createWorld()
  const staleSelected = selectorWorld.spawn(component(Selected))
  const staleSelectedIndex = selectorWorld.index(staleSelected)
  const selectedBeforeDestroy = selectorWorld.view(SelectedEntities).includes(staleSelected)
  selectorWorld.destroy(staleSelected)
  const recycledSelected = selectorWorld.spawn()
  const selectorEmptyAfterRecycle = selectorWorld.view(SelectedEntities).length === 0
  selectorWorld.add(recycledSelected, component(Selected))
  const selectedAfterAdd = selectorWorld.view(SelectedEntities)
  const selectorResult = {
    recycledSameIndex: staleSelectedIndex === selectorWorld.index(recycledSelected),
    selectedBeforeDestroy,
    emptyAfterRecycle: selectorEmptyAfterRecycle,
    containsOnlyRecycled:
      selectedAfterAdd.length === 1 &&
      selectedAfterAdd[0] === recycledSelected &&
      !selectedAfterAdd.includes(staleSelected),
  }
  selectorWorld.dispose()

  const destructionWorld = adapter.createWorld()
  const destroyed = destructionWorld.spawn(component(Destroyed))
  destructionWorld.destroy(destroyed)
  const destructionResult = {
    removedEvents: destructionWorld.drain(RemovedDestroyed).length,
  }
  destructionWorld.dispose()

  const horizonWorld = adapter.createWorld()
  const original = horizonWorld.spawn()
  const originalIndex = horizonWorld.index(original)
  let current = original
  let sameIndexThroughout = true
  let everAliasedOriginal = false
  for (let cycle = 0; cycle < 4097; cycle++) {
    horizonWorld.destroy(current)
    current = horizonWorld.spawn()
    sameIndexThroughout &&= horizonWorld.index(current) === originalIndex
    everAliasedOriginal ||= current === original || horizonWorld.isAlive(original)
  }
  const horizonResult = {
    sameIndexThroughout,
    everAliasedOriginal,
    originalAliveAtEnd: horizonWorld.isAlive(original),
    finalHandleDiffers: current !== original,
  }
  horizonWorld.dispose()

  return {
    eventQueue: eventResult,
    selector: selectorResult,
    destruction: destructionResult,
    recycleHorizon: horizonResult,
  }
}

function captureMultiwordSelectors(adapter: EcsAdapter): Snapshot {
  const traits = Array.from({ length: 40 }, () => adapter.tag())
  const AllForty = adapter.select(...traits)
  const world = adapter.createWorld()
  const all = world.spawn(...traits.map((traitValue) => component(traitValue)))
  const firstWordOnly = world.spawn(...traits.slice(0, 32).map((traitValue) => component(traitValue)))
  const missingAcrossBoundary = world.spawn(
    ...traits.filter((_traitValue, index) => index !== 33).map((traitValue) => component(traitValue))
  )
  const labels = new Map<Entity, string>([
    [all, 'all'],
    [firstWordOnly, 'first-word-only'],
    [missingAcrossBoundary, 'missing-across-boundary'],
  ])

  const initial = entityLabels(world.view(AllForty), labels)
  world.remove(all, traits[33]!)
  const afterCrossWordRemove = entityLabels(world.view(AllForty), labels)
  world.add(missingAcrossBoundary, component(traits[33]!))
  const afterCrossWordAdd = entityLabels(world.view(AllForty), labels)

  world.dispose()
  return { initial, afterCrossWordRemove, afterCrossWordAdd }
}

function captureDisposal(adapter: EcsAdapter): Snapshot {
  const Resource = adapter.object(() => ({ name: 'resource' }))
  const world = adapter.createWorld()
  const entity = world.spawn(component(Resource))
  const readableBefore = world.read(entity, Resource)?.name === 'resource'
  world.dispose()
  world.dispose()
  return {
    readableBefore,
    disposed: world.disposed,
    entityAliveAfter: world.isAlive(entity),
  }
}

function captureDynamicTraits(adapter: EcsAdapter): Snapshot {
  const world = adapter.createWorld()
  const entity = world.spawn()
  const Effect = adapter.numeric({ strength: 1, radius: 0 })
  world.add(entity, component(Effect, { strength: 0.75 }))
  const result = {
    hasAfterAdd: world.has(entity, Effect),
    value: value(world.read(entity, Effect), 'dynamic numeric trait'),
  }
  world.remove(entity, Effect)
  const afterRemove = world.has(entity, Effect)
  world.dispose()
  return { ...result, afterRemove }
}

function captureExclusiveAssignment(adapter: EcsAdapter): Snapshot {
  const AssignedTo = adapter.exclusive()
  const world = adapter.createWorld()
  const sprite = world.spawn()
  const firstBatch = world.spawn()
  const secondBatch = world.spawn()

  world.assign(sprite, AssignedTo, firstBatch)
  const firstTarget = world.target(sprite, AssignedTo) === firstBatch
  world.assign(sprite, AssignedTo, secondBatch)
  const replacementTarget = world.target(sprite, AssignedTo) === secondBatch
  world.unassign(sprite, AssignedTo)
  const cleared = world.target(sprite, AssignedTo) === undefined

  world.assign(sprite, AssignedTo, firstBatch)
  const destroyedBatchIndex = world.index(firstBatch)
  world.destroy(firstBatch)
  const invalidatedAfterTargetDestroy = world.target(sprite, AssignedTo) === undefined
  const recycledBatch = world.spawn()
  const recycledTargetIndex = world.index(recycledBatch)
  const doesNotAliasRecycledTarget = world.target(sprite, AssignedTo) === undefined
  world.assign(sprite, AssignedTo, recycledBatch)
  const reassignedAfterRecycle = world.target(sprite, AssignedTo) === recycledBatch

  world.dispose()
  return {
    firstTarget,
    replacementTarget,
    cleared,
    targetIndexReused: destroyedBatchIndex === recycledTargetIndex,
    invalidatedAfterTargetDestroy,
    doesNotAliasRecycledTarget,
    reassignedAfterRecycle,
  }
}

/** Capture the complete Flatland behavior contract for one adapter. */
export function captureReferenceScenarios(adapter: EcsAdapter): ScenarioReport {
  adapter.reset()
  try {
    return {
      emptySelector: captureEmptySelector(adapter),
      initialization: captureInitialization(adapter),
      duplicateAdd: captureDuplicateAdd(adapter),
      duplicateSpawn: captureDuplicateSpawn(adapter),
      factoryIsolation: captureFactoryIsolation(adapter),
      tags: captureTags(adapter),
      numericStore: captureNumericStore(adapter),
      selectors: captureSelectors(adapter),
      events: captureEvents(adapter),
      lifecycle: captureLifecycle(adapter),
      generationSafety: captureGenerationSafety(adapter),
      multiwordSelectors: captureMultiwordSelectors(adapter),
      disposal: captureDisposal(adapter),
      dynamicTraits: captureDynamicTraits(adapter),
      exclusiveAssignment: captureExclusiveAssignment(adapter),
    }
  } finally {
    adapter.reset()
  }
}
