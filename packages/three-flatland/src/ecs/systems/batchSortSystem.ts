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

/** Per-batch entity list — indices into entity array for each batch. */
let batchEntityBuckets: number[][] = []

/** Scratch array of entity IDs belonging to one batch, populated per batch. */
const scratchEids: number[] = []
/** Scratch array of zIndices parallel to scratchEids. */
const scratchZ: number[] = []
/** Scratch array of current physical slots parallel to scratchEids. */
const scratchSlots: number[] = []

function ensureDirtyCapacity(n: number): void {
  if (dirtyBatches.length < n) {
    const next = new Uint8Array(Math.max(n, dirtyBatches.length * 2))
    dirtyBatches = next
  }
  for (let i = 0; i < n; i++) dirtyBatches[i] = 0
}

function ensureBucketCapacity(n: number): void {
  while (batchEntityBuckets.length < n) batchEntityBuckets.push([])
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

  // --- Pass 1: mark batches dirty from Changed(SpriteZIndex) ---
  ensureDirtyCapacity(batchCount)

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

  // --- Pass 3: for each dirty batch, check material gate and sort. ---
  for (let bi = 0; bi < batchCount; bi++) {
    if (dirtyBatches[bi] !== 1) continue
    dirtyBatches[bi] = 0

    const mesh = batchSlots[bi] as SpriteBatch | null
    if (!mesh) continue

    // Material gate: alphaTest + depthWrite means GPU depth test handles ordering.
    const mat = mesh.spriteMaterial
    if (mat.alphaTest > 0 && mat.depthWrite) continue

    const eids = batchEntityBuckets[bi]!
    const n = eids.length
    if (n < 2) continue

    // Populate scratch arrays (zero-alloc: truncate + push).
    scratchEids.length = 0
    scratchZ.length = 0
    scratchSlots.length = 0
    for (let i = 0; i < n; i++) {
      const eid = eids[i]!
      scratchEids.push(eid)
      scratchZ.push(zIndexArr[eid]!)
      scratchSlots.push(slotArr[eid]!)
    }

    // Sort scratchEids & scratchZ by zIndex ascending using an insertion
    // sort — near-sorted after the first frame, so O(n) in practice.
    for (let i = 1; i < n; i++) {
      const zi = scratchZ[i]!
      const ei = scratchEids[i]!
      let j = i - 1
      while (j >= 0 && scratchZ[j]! > zi) {
        scratchZ[j + 1] = scratchZ[j]!
        scratchEids[j + 1] = scratchEids[j]!
        j--
      }
      scratchZ[j + 1] = zi
      scratchEids[j + 1] = ei
    }

    // scratchSlots still holds the original physical slots in unsorted
    // enumeration order. To produce a stable target mapping, sort those
    // slots ascending — this preserves the set of physical indices
    // (leaves _freeList holes untouched) while ordering occupied slots
    // by zIndex.
    scratchSlots.sort((a, b) => a - b)

    // Apply permutation: entity scratchEids[i] (in sorted-zIndex order)
    // should occupy physical slot scratchSlots[i] (in ascending order).
    //
    // We need to move GPU rows from each entity's CURRENT slot to its
    // target slot. Cycle-style in-place permutation using swapSlots.
    //
    // Build desiredSlotByEid in-line: for i in [0..n): target of
    // scratchEids[i] is scratchSlots[i].
    //
    // Since eids don't form a dense range, we drive by iterating target
    // positions 0..n-1, finding the entity whose current slot equals our
    // target, and swapping if needed.
    for (let i = 0; i < n; i++) {
      const targetSlot = scratchSlots[i]!
      const targetEid = scratchEids[i]!
      const currentSlot = slotArr[targetEid]!
      if (currentSlot === targetSlot) continue

      // Find the entity currently occupying targetSlot (among remaining
      // unsorted entities i..n-1). Swap GPU rows + update slotArr.
      let otherIdx = -1
      for (let k = i + 1; k < n; k++) {
        if (slotArr[scratchEids[k]!]! === targetSlot) {
          otherIdx = k
          break
        }
      }
      if (otherIdx < 0) continue // Shouldn't happen — set invariant broken.

      const otherEid = scratchEids[otherIdx]!
      // Swap GPU attribute rows.
      mesh.swapSlots(currentSlot, targetSlot)
      // Swap slot assignments in SoA.
      slotArr[targetEid] = targetSlot
      slotArr[otherEid] = currentSlot
    }
  }
}
