import { createChanged, getStore as kootaGetStore, type World, type Trait } from 'koota'
import {
  IsBatched,
  BatchSlot,
  BatchRegistry,
  SpriteZIndex,
} from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import { ENTITY_ID_MASK } from '../snapshot'

const Changed = createChanged()

/** Resolve SoA store for a numeric trait — one lookup, reused for all entities. */
function getNumericStore(world: World, trait: Trait): Record<string, number[]> {
  return kootaGetStore(world, trait) as Record<string, number[]>
}

// ============================================
// Reusable scratch arrays (module-scope, zero-alloc per frame)
// ============================================

/** Per-batch dirty flag. Grown as needed, reset each frame. */
let dirtyBatches: Uint8Array = new Uint8Array(16)

/** Per-batch gate flag — 1 means skip (alphaTest+depthWrite path).
 *  Precomputed once per frame from each batch's material so Pass 1
 *  can avoid even MARKING gated batches dirty — no full-world query
 *  payload accrues for batches that will be skipped anyway. */
let gatedBatches: Uint8Array = new Uint8Array(16)

/** Per-batch entity list — indices into entity array for each batch. */
const batchEntityBuckets: number[][] = []

/** Scratch array of entity IDs belonging to one batch, populated per batch. */
const scratchEids: number[] = []
/** Scratch array of current physical slots parallel to scratchEids. */
const scratchSlots: number[] = []

/** Inverse slot map for the swap pass — `slotToScratchIdx[physicalSlot]`
 *  gives the scratch index whose entity currently occupies that slot.
 *  Sized lazily to the largest mesh.maxSize seen so far. */
let slotToScratchIdx: Int32Array = new Int32Array(0)

function ensureDirtyCapacity(n: number): void {
  if (dirtyBatches.length < n) {
    const grown = Math.max(n, dirtyBatches.length * 2)
    dirtyBatches = new Uint8Array(grown)
    gatedBatches = new Uint8Array(grown)
  }
  for (let i = 0; i < n; i++) {
    dirtyBatches[i] = 0
    gatedBatches[i] = 0
  }
}

function ensureBucketCapacity(n: number): void {
  while (batchEntityBuckets.length < n) batchEntityBuckets.push([])
}

function ensureSlotMapCapacity(n: number): void {
  if (slotToScratchIdx.length < n) {
    slotToScratchIdx = new Int32Array(Math.max(n, slotToScratchIdx.length * 2))
  }
}

/**
 * Re-sort batch instance rows by zIndex.
 *
 * Runs after bufferSyncSystem / transformSyncSystem, before render.
 * For each batch whose member sprites had `Changed(SpriteZIndex)` this
 * frame, re-orders physical slots so that instances render back-to-front
 * by zIndex (ascending — lower zIndex renders first, higher renders on top).
 *
 * Skips batches whose material opts into GPU depth ordering via
 * `alphaTest > 0 && depthWrite`. Those materials rely on the GPU depth
 * test (with the layer/zIndex-derived Z baked into the instance matrix)
 * and don't need CPU-side sorting.
 *
 * Zero-alloc: scratch arrays are module-scoped and reused frame to frame.
 */
export function batchSortSystem(world: World): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  const batchSlots = registry.batchSlots
  const batchCount = batchSlots.length
  if (batchCount === 0) return

  // --- Pass 0: precompute the material gate per batch ---
  //
  // The previous implementation deferred the gate check until Pass 3 — which
  // meant a knightmark frame with alphaTest enabled still paid for ~10k
  // Changed iterations + a full-world IsBatched query just to discover the
  // batch was gated and skip the sort. Hoisting the gate to Pass 0 lets
  // Pass 1 ignore Changed events on gated batches entirely, so the
  // common-case "alphaTest path with moving sprites" returns in O(1) per
  // frame instead of O(world size).
  ensureDirtyCapacity(batchCount)
  for (let bi = 0; bi < batchCount; bi++) {
    const mesh = batchSlots[bi] as SpriteBatch | null
    if (!mesh) continue
    const mat = mesh.spriteMaterial
    if (mat.alphaTest > 0 && mat.depthWrite) gatedBatches[bi] = 1
  }

  // --- Pass 1: mark non-gated batches dirty from Changed(SpriteZIndex) ---
  const bsStore = getNumericStore(world, BatchSlot)
  const batchIdxArr = bsStore['batchIdx']!
  const slotArr = bsStore['slot']!

  const zStore = getNumericStore(world, SpriteZIndex)
  const zIndexArr = zStore['zIndex']!

  const changedEntities = world.query(Changed(SpriteZIndex), IsBatched, BatchSlot)
  let anyDirty = false
  for (const ent of changedEntities) {
    const eid = (ent as unknown as number) & ENTITY_ID_MASK
    const bi = batchIdxArr[eid]
    if (bi === undefined || bi < 0 || bi >= batchCount) continue
    if (gatedBatches[bi] === 1) continue
    dirtyBatches[bi] = 1
    anyDirty = true
  }
  if (!anyDirty) return

  // --- Pass 2: bucket all batched entities by batchIdx (only buckets
  //            corresponding to dirty batches will be consumed). ---
  ensureBucketCapacity(batchCount)
  // Reset buckets we might touch.
  for (let i = 0; i < batchCount; i++) {
    if (dirtyBatches[i] === 1) batchEntityBuckets[i]!.length = 0
  }

  const allBatched = world.query(IsBatched, BatchSlot)
  for (const ent of allBatched) {
    const eid = (ent as unknown as number) & ENTITY_ID_MASK
    const bi = batchIdxArr[eid]
    if (bi === undefined || bi < 0 || bi >= batchCount) continue
    if (dirtyBatches[bi] !== 1) continue
    batchEntityBuckets[bi]!.push(eid)
  }

  // --- Pass 3: for each dirty batch, sort (gate already applied in Pass 1). ---
  for (let bi = 0; bi < batchCount; bi++) {
    if (dirtyBatches[bi] !== 1) continue
    dirtyBatches[bi] = 0

    const mesh = batchSlots[bi] as SpriteBatch | null
    if (!mesh) continue

    const eids = batchEntityBuckets[bi]!
    const n = eids.length
    if (n < 2) continue

    // Populate scratch arrays (zero-alloc: truncate + push).
    scratchEids.length = 0
    scratchSlots.length = 0
    for (let i = 0; i < n; i++) {
      const eid = eids[i]!
      scratchEids.push(eid)
      scratchSlots.push(slotArr[eid]!)
    }

    // Sort scratchEids by zIndex ascending via V8's TimSort. Hand-rolled
    // insertion sort sat at O(n²) worst case — pathological on a cold-
    // start batch (allocation order is random vs zIndex), which for a
    // 20k-sprite batch is 400M comparisons. TimSort is O(n) on near-
    // sorted data (the comment's claim about insertion sort was only
    // half-true — steady-state is fine, the cold start is the cliff)
    // and O(n log n) worst case.
    scratchEids.sort((a, b) => zIndexArr[a]! - zIndexArr[b]!)

    // scratchSlots still holds the original physical slots in unsorted
    // enumeration order. To produce a stable target mapping, sort those
    // slots ascending — this preserves the set of physical indices
    // (leaves _freeList holes untouched) while ordering occupied slots
    // by zIndex.
    scratchSlots.sort((a, b) => a - b)

    // Apply permutation: entity scratchEids[i] (in sorted-zIndex order)
    // should occupy physical slot scratchSlots[i] (in ascending order).
    //
    // The previous implementation found the "other" entity to swap via a
    // linear scan of scratchEids[i+1..n-1] — O(n²) on full permutations,
    // pathological with many sprites and frequent y-crossings.
    //
    // Build a slot → scratchIdx inverse map in one pass, then O(1) lookup
    // per swap. Maintain the map as we permute so subsequent lookups stay
    // valid.
    ensureSlotMapCapacity(mesh.maxSize)
    for (let i = 0; i < n; i++) {
      slotToScratchIdx[slotArr[scratchEids[i]!]!] = i
    }
    for (let i = 0; i < n; i++) {
      const targetSlot = scratchSlots[i]!
      const targetEid = scratchEids[i]!
      const currentSlot = slotArr[targetEid]!
      if (currentSlot === targetSlot) continue

      const otherIdx = slotToScratchIdx[targetSlot]!
      if (otherIdx <= i) continue // Set invariant broken — shouldn't happen.
      const otherEid = scratchEids[otherIdx]!

      // Swap GPU attribute rows.
      mesh.swapSlots(currentSlot, targetSlot)
      // Swap slot assignments in SoA.
      slotArr[targetEid] = targetSlot
      slotArr[otherEid] = currentSlot
      // Keep inverse map consistent — targetEid is now at targetSlot,
      // otherEid is now at currentSlot.
      slotToScratchIdx[targetSlot] = i
      slotToScratchIdx[currentSlot] = otherIdx
    }
  }
}
