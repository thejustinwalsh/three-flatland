import { describe, expect, it } from 'vitest'
import { kootaAdapter } from './adapters/koota.ts'
import { createReferenceAdapter } from './adapters/reference.ts'
import { createAnchoredScanAdapter } from './candidates/anchored-scan.ts'
import { createSignaturePersistentAdapter } from './candidates/signature-persistent.ts'
import { createSparsePersistentAdapter } from './candidates/sparse-persistent.ts'
import { captureReferenceScenarios, type ScenarioReport } from './scenarios.ts'

const FLATLAND_CONTRACT = {
  initialization: {
    defaults: { x: 1, y: 2 },
    partial: { x: 7, y: 2 },
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
    foreignRejected: true,
  },
  disposal: { readableBefore: true, disposed: true, entityAliveAfter: false },
  dynamicTraits: {
    hasAfterAdd: true,
    value: { strength: 0.75, radius: 0 },
    afterRemove: false,
  },
  exclusiveAssignment: { firstTarget: true, replacementTarget: true, cleared: true },
} satisfies ScenarioReport

const KOOTA_BASELINE = {
  ...FLATLAND_CONTRACT,
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

  it('classifies the three intentional Koota deltas explicitly', () => {
    const koota = captureReferenceScenarios(kootaAdapter)

    // Koota replaces an AoS factory result when an initializer is supplied;
    // Flatland's private runtime will merge the partial into a fresh result.
    expect(koota.factoryIsolation.partialInitializerPreservesDefaults).toBe(false)

    // Koota 0.6.5 tracking queries do not enforce ordinary required traits.
    // The current routing system tolerates this only because it later rejects
    // entities without an InBatch target. The replacement filters at enqueue.
    expect(koota.events.changedDeduplicated).toEqual(['not-batched', 'routed'])

    // Koota evaluates Added against current composition at query time. The
    // replacement keeps independent event queues, so add-then-remove is seen
    // once by both consumers even when neither has drained yet.
    expect(koota.events.addThenRemoveAdded).toEqual([])
    expect(koota.events.addThenRemoveRemoved).toEqual(['transient'])
  })
})
