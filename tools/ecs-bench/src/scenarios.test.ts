import { describe, expect, it } from 'vitest'
import { createWorld as createKootaWorld, universe as kootaUniverse } from 'koota'
import { component, type Trait } from './adapter.ts'
import { createFlatlandRuntimeAdapter } from './adapters/flatland-runtime.ts'
import { kootaAdapter } from './adapters/koota.ts'
import { createReferenceAdapter } from './adapters/reference.ts'
import { createAnchoredScanAdapter } from './candidates/anchored-scan.ts'
import { createSignaturePersistentAdapter } from './candidates/signature-persistent.ts'
import { createSparsePersistentAdapter } from './candidates/sparse-persistent.ts'
import { captureReferenceScenarios, type ScenarioReport } from './scenarios.ts'

const FLATLAND_CONTRACT = {
  emptySelector: { threw: true },
  initialization: {
    defaults: { x: 1, y: 2 },
    partial: { x: 7, y: 2 },
  },
  duplicateAdd: {
    threw: true,
    preservedValue: 7,
    changedEvents: 0,
  },
  duplicateSpawn: {
    threw: true,
    returnedEntityAlive: false,
    traitQueryCount: 0,
    addedEvents: 0,
    storeDefinedValues: 0,
    nextIndexMatchesPristine: true,
  },
  factoryIsolation: {
    firstOwner: 'first',
    partialInitializerOwner: 'partial',
    partialInitializerPreservesDefaults: true,
    firstItems: [42],
    sameWorldItems: [],
    otherWorldItems: [],
    sameWorldDistinct: true,
    otherWorldDistinct: true,
  },
  tags: { before: false, afterAdd: true, afterRemove: false },
  numericStore: {
    trackedDrainCount: 1,
    repeatedDrainCount: 0,
    sameValueDrainCount: 1,
    untrackedDrainCount: 0,
    directWriteDrainCount: 0,
    touchedDirectWriteDrainCount: 1,
    readAfterDirectWrite: { x: 5, y: 9 },
    storeAfterDirectWrite: { x: 5, y: 9 },
  },
  selectors: {
    before: ['positioned-and-active'],
    afterAdd: ['positioned', 'positioned-and-active'],
    afterRemove: ['positioned'],
    allPositions: ['positioned', 'positioned-and-active'],
  },
  events: {
    addedFirst: ['routed'],
    addedRepeat: [],
    addedIndependent: ['routed'],
    changedDeduplicated: ['routed'],
    changedRepeat: [],
    changedIndependent: ['routed'],
    changedUntracked: [],
    removedFirst: ['routed'],
    removalState: 12,
    removedRepeat: [],
    removedIndependent: ['routed'],
    addThenRemoveAdded: ['transient'],
    addThenRemoveRemoved: ['transient'],
  },
  lifecycle: {
    staleAlive: false,
    recycledAlive: true,
    reusedIndex: true,
    advancedGeneration: true,
    isolatedValuesBefore: [11, 22],
    isolatedSelectorsBefore: [1, 1],
    secondAliveAfterFirstDestroy: true,
    secondValueAfterFirstDestroy: 22,
  },
  generationSafety: {
    eventQueue: {
      recycledSameIndex: true,
      handlesDiffer: true,
      queuedCount: 2,
      containsStaleGeneration: true,
      containsRecycledGeneration: true,
    },
    selector: {
      recycledSameIndex: true,
      selectedBeforeDestroy: true,
      emptyAfterRecycle: true,
      containsOnlyRecycled: true,
    },
    destruction: { removedEvents: 0 },
    recycleHorizon: {
      sameIndexThroughout: true,
      everAliasedOriginal: false,
      firstAliasRecycle: null,
      originalAliveAtEnd: false,
      finalHandleDiffers: true,
    },
  },
  multiwordSelectors: {
    initial: ['all'],
    afterCrossWordRemove: [],
    afterCrossWordAdd: ['missing-across-boundary'],
  },
  disposal: { readableBefore: true, disposed: true, entityAliveAfter: false },
  dynamicTraits: {
    hasAfterAdd: true,
    value: { strength: 0.75, radius: 0 },
    afterRemove: false,
  },
  exclusiveAssignment: {
    firstTarget: true,
    replacementTarget: true,
    cleared: true,
    targetIndexReused: true,
    invalidatedAfterTargetDestroy: true,
    doesNotAliasRecycledTarget: true,
    reassignedAfterRecycle: true,
    staleSourceUnassignThrew: true,
  },
} satisfies ScenarioReport

const KOOTA_BASELINE = {
  ...FLATLAND_CONTRACT,
  emptySelector: { threw: false },
  duplicateAdd: {
    threw: false,
    preservedValue: 7,
    changedEvents: 0,
  },
  duplicateSpawn: {
    threw: false,
    returnedEntityAlive: true,
    traitQueryCount: 1,
    addedEvents: 1,
    storeDefinedValues: 1,
    nextIndexMatchesPristine: false,
  },
  factoryIsolation: {
    ...FLATLAND_CONTRACT.factoryIsolation,
    partialInitializerPreservesDefaults: false,
  },
  events: {
    ...FLATLAND_CONTRACT.events,
    changedDeduplicated: ['not-batched', 'routed'],
    changedIndependent: ['not-batched', 'routed'],
    addThenRemoveAdded: [],
  },
  generationSafety: {
    ...FLATLAND_CONTRACT.generationSafety,
    eventQueue: {
      recycledSameIndex: true,
      handlesDiffer: true,
      queuedCount: 1,
      containsStaleGeneration: false,
      containsRecycledGeneration: true,
    },
    destruction: { removedEvents: 1 },
    recycleHorizon: {
      sameIndexThroughout: true,
      everAliasedOriginal: true,
      firstAliasRecycle: 256,
      originalAliveAtEnd: false,
      finalHandleDiffers: true,
    },
  },
  exclusiveAssignment: {
    ...FLATLAND_CONTRACT.exclusiveAssignment,
    staleSourceUnassignThrew: false,
  },
} satisfies ScenarioReport

describe('Flatland entity-store behavior contract', () => {
  it.each([
    ['reference', createReferenceAdapter],
    ['Koota', () => kootaAdapter],
    ['production runtime', createFlatlandRuntimeAdapter],
    ['anchored scan', createAnchoredScanAdapter],
    ['signature persistent', createSignaturePersistentAdapter],
    ['sparse persistent', createSparsePersistentAdapter],
  ])('%s combines and de-duplicates multi-trait Added and Removed events', (_name, createAdapter) => {
    const adapter = createAdapter()
    adapter.reset()
    const First = adapter.tag()
    const Second = adapter.tag()
    const AddedEither = adapter.event('added', [First, Second])
    const RemovedEither = adapter.event('removed', [First, Second])
    const world = adapter.createWorld()

    try {
      const first = world.spawn(component(First))
      const both = world.spawn(component(First), component(Second))
      const second = world.spawn(component(Second))
      expect(new Set(world.drain(AddedEither))).toEqual(new Set([first, both, second]))

      world.remove(both, First)
      world.remove(both, Second)
      expect(world.drain(RemovedEither)).toEqual([both])
    } finally {
      world.dispose()
      adapter.reset()
    }
  })

  it('uses Koota touch as notification-only tracking and rejects stale or missing sources', () => {
    kootaAdapter.reset()
    const Inventory = kootaAdapter.object(() => ({ items: [] as number[], owner: 'nobody' }))
    const ChangedInventory = kootaAdapter.event('changed', [Inventory])
    const world = kootaAdapter.createWorld()

    try {
      const original = world.spawn(component(Inventory))
      const inventory = world.read(original, Inventory)!
      inventory.owner = 'original'
      inventory.items.push(42)
      world.touch(original, Inventory)
      expect(world.drain(ChangedInventory)).toEqual([original])
      expect(world.read(original, Inventory)).toEqual({ items: [42], owner: 'original' })

      world.destroy(original)
      const recycled = world.spawn(component(Inventory))
      world.read(recycled, Inventory)!.owner = 'recycled'
      expect(world.index(recycled)).toBe(world.index(original))
      world.drain(ChangedInventory)
      expect(() => world.touch(original, Inventory)).toThrow(/Stale entity handle/)
      expect(world.read(recycled, Inventory)).toEqual({ items: [], owner: 'recycled' })
      expect(world.drain(ChangedInventory)).toEqual([])

      const missing = world.spawn()
      world.drain(ChangedInventory)
      expect(() => world.touch(missing, Inventory)).toThrow(/missing trait/)
      expect(world.drain(ChangedInventory)).toEqual([])
    } finally {
      world.dispose()
      kootaAdapter.reset()
    }
  })

  it.each([
    ['reference', createReferenceAdapter],
    ['anchored scan', createAnchoredScanAdapter],
    ['signature persistent', createSignaturePersistentAdapter],
    ['sparse persistent', createSparsePersistentAdapter],
  ])('%s keeps tag presence separate from its undefined value', (_name, createAdapter) => {
    const adapter = createAdapter()
    const Tag = adapter.tag()
    const ChangedTag = adapter.event('changed', [Tag])
    const world = adapter.createWorld()
    const entity = world.spawn(component(Tag))

    expect(world.has(entity, Tag)).toBe(true)
    expect(world.read(entity, Tag)).toBeUndefined()
    world.patch(entity, Tag as unknown as Trait<Record<string, never>>, {})
    expect(world.drain(ChangedTag)).toEqual([entity])

    world.dispose()
    adapter.reset()
  })

  it('keeps selector matching independent of multiword trait order', () => {
    const adapter = createSignaturePersistentAdapter()
    const traits = Array.from({ length: 40 }, () => adapter.tag())
    const selector = adapter.select(traits[0]!, traits[32]!, traits[1]!, traits[33]!)
    const world = adapter.createWorld()
    const complete = world.spawn(
      ...[traits[0]!, traits[1]!, traits[32]!, traits[33]!].map((traitValue) => ({
        trait: traitValue,
      }))
    )
    world.spawn(...[traits[1]!, traits[32]!, traits[33]!].map((traitValue) => ({ trait: traitValue })))

    expect(world.view(selector)).toEqual([complete])
    world.dispose()
    adapter.reset()
  })

  it('resets independent-reference declaration IDs', () => {
    const adapter = createReferenceAdapter()
    const ids = () => [
      (adapter.tag() as unknown as { readonly id: number }).id,
      (adapter.select(adapter.tag()) as unknown as { readonly id: number }).id,
      (adapter.event('changed', [adapter.tag()]) as unknown as { readonly id: number }).id,
      (adapter.exclusive() as unknown as { readonly id: number }).id,
    ]

    expect(ids()).toEqual([0, 0, 0, 0])
    adapter.reset()
    expect(ids()).toEqual([0, 0, 0, 0])
  })

  it('is deterministic in the independent reference model', () => {
    expect(captureReferenceScenarios(createReferenceAdapter())).toEqual(FLATLAND_CONTRACT)
  })

  it('records the current Koota baseline exactly', () => {
    expect(captureReferenceScenarios(kootaAdapter)).toEqual(KOOTA_BASELINE)
  })

  it.each([
    ['production runtime', createFlatlandRuntimeAdapter],
    ['anchored scan', createAnchoredScanAdapter],
    ['signature persistent', createSignaturePersistentAdapter],
    ['sparse persistent', createSparsePersistentAdapter],
  ])('%s candidate matches the Flatland contract', (_name, createAdapter) => {
    expect(captureReferenceScenarios(createAdapter())).toEqual(FLATLAND_CONTRACT)
  })

  it('classifies the ten intentional Koota deltas explicitly', () => {
    const koota = captureReferenceScenarios(kootaAdapter)

    // Koota replaces an AoS factory result when an initializer is supplied;
    // Flatland's private runtime will merge the partial into a fresh result.
    expect(koota.factoryIsolation.partialInitializerPreservesDefaults).toBe(false)

    // Koota silently ignores an initialized add for a trait the entity
    // already owns. Flatland treats this as a composition bug in development,
    // while preserving the original value and emitting no Changed event.
    expect(koota.duplicateAdd).toEqual({
      threw: false,
      preservedValue: 7,
      changedEvents: 0,
    })

    // The renderer never needs an all-entities selector. Flatland rejects an
    // empty selector instead of maintaining a global membership index.
    expect(koota.emptySelector).toEqual({ threw: false })

    // Koota accepts duplicate traits during spawn and leaves one live entity,
    // query membership, Added event, and store row behind. Flatland preflights
    // composition before allocating an ID or touching any trait state.
    expect(koota.duplicateSpawn).toEqual({
      threw: false,
      returnedEntityAlive: true,
      traitQueryCount: 1,
      addedEvents: 1,
      storeDefinedValues: 1,
      nextIndexMatchesPristine: false,
    })

    // Koota 0.6.5 tracking queries do not enforce ordinary required traits.
    // The current routing system tolerates this only because it later rejects
    // entities without an InBatch target. The replacement filters at enqueue.
    expect(koota.events.changedDeduplicated).toEqual(['not-batched', 'routed'])

    // Koota evaluates Added against current composition at query time. The
    // replacement keeps independent event queues, so add-then-remove is seen
    // once by both consumers even when neither has drained yet.
    expect(koota.events.addThenRemoveAdded).toEqual([])
    expect(koota.events.addThenRemoveRemoved).toEqual(['transient'])

    // Koota derives tracking results from current masks, so a queued Added
    // event for a destroyed generation is gone after its index is recycled.
    expect(koota.generationSafety.eventQueue).toEqual({
      recycledSameIndex: true,
      handlesDiffer: true,
      queuedCount: 1,
      containsStaleGeneration: false,
      containsRecycledGeneration: true,
    })

    // Entity destruction cascades trait removal through Koota and therefore
    // emits Removed. Flatland reserves Removed for explicit structural
    // removal; destroy is terminal cleanup and emits no consumer event.
    expect(koota.generationSafety.destruction).toEqual({ removedEvents: 1 })

    // Koota's packed handle has an 8-bit generation and aliases the original
    // handle on the 256th recycle. Flatland uses safe-integer generations
    // and retires an index when it reaches the last safe generation.
    expect(koota.generationSafety.recycleHorizon).toEqual({
      sameIndexThroughout: true,
      everAliasedOriginal: true,
      firstAliasRecycle: 256,
      originalAliveAtEnd: false,
      finalHandleDiffers: true,
    })

    // Koota silently ignores relation removal from a destroyed source.
    // Flatland treats stale-source unassignment as a structural bug, matching
    // every other mutating operation on a stale handle.
    expect(koota.exclusiveAssignment.staleSourceUnassignThrew).toBe(false)
  })
})

describe('Koota packed-handle alias boundaries', () => {
  it('aliases a stale handle immediately across world reset', () => {
    kootaUniverse.reset()
    const world = createKootaWorld()

    try {
      const stale = world.spawn()
      world.reset()
      const current = world.spawn()

      expect(current).toBe(stale)
      expect(world.has(stale)).toBe(true)
    } finally {
      world.destroy()
      kootaUniverse.reset()
    }
  })

  it('aliases a stale handle when a destroyed world ID is reused', () => {
    kootaUniverse.reset()
    const first = createKootaWorld()
    const stale = first.spawn()
    first.destroy()
    const second = createKootaWorld()

    try {
      const current = second.spawn()

      expect(current).toBe(stale)
      expect(second.has(stale)).toBe(true)
    } finally {
      second.destroy()
      kootaUniverse.reset()
    }
  })
})
