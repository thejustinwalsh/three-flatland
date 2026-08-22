import { describe, expect, it } from 'vitest'
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
    untrackedDrainCount: 0,
    directWriteDrainCount: 0,
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
      originalAliveAtEnd: false,
      finalHandleDiffers: true,
    },
  },
} satisfies ScenarioReport

describe('Flatland entity-store behavior contract', () => {
  it('is deterministic in the independent reference model', () => {
    expect(captureReferenceScenarios(createReferenceAdapter())).toEqual(FLATLAND_CONTRACT)
  })

  it('records the current Koota baseline exactly', () => {
    expect(captureReferenceScenarios(kootaAdapter)).toEqual(KOOTA_BASELINE)
  })

  it.each([
    ['anchored scan', createAnchoredScanAdapter],
    ['signature persistent', createSignaturePersistentAdapter],
    ['sparse persistent', createSparsePersistentAdapter],
  ])('%s candidate matches the Flatland contract', (_name, createAdapter) => {
    expect(captureReferenceScenarios(createAdapter())).toEqual(FLATLAND_CONTRACT)
  })

  it('classifies the nine intentional Koota deltas explicitly', () => {
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

    // Koota's packed handle has a 12-bit generation and aliases the original
    // handle on the 4,096th recycle. Flatland uses safe-integer generations
    // and retires an index when it reaches the last safe generation.
    expect(koota.generationSafety.recycleHorizon).toEqual({
      sameIndexThroughout: true,
      everAliasedOriginal: true,
      originalAliveAtEnd: false,
      finalHandleDiffers: true,
    })
  })
})
