import { getStore as kootaGetStore, type World, type Trait } from 'koota'
import { IsBatched, BatchSlot, BatchRegistry, SpriteZIndex } from '../traits'
import type { RegistryData } from '../batchUtils'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import { ENTITY_ID_MASK } from '../snapshot'

/** Resolve SoA store for a numeric trait — one lookup, reused for all entities. */
function getNumericStore(world: World, trait: Trait): Record<string, number[]> {
  return kootaGetStore(world, trait) as Record<string, number[]>
}

/**
 * Create a batch-sort system bound to its own scratch buffers.
 *
 * Each SpriteGroup constructs one; the returned function is called per
 * frame with the world to sort. Scratch state lives in this closure
 * so multiple SpriteGroups don't share buffers (each world gets clean
 * state and resizes its own arrays independently).
 *
 * Re-sorts batch instance rows by zIndex.
 *
 * Sort-dirty signal comes from each `SpriteBatch._sortDirty` boolean,
 * flipped by `Sprite2D.zIndex` setter (non-gated batches only) and by
 * `batchAssignSystem` on new sprite insertion. Replaces the prior
 * `Changed(SpriteZIndex)` channel — Koota's Changed tracker enumerated
 * every zIndex flip every frame even when the batch's material gate
 * trivially skipped the sort, costing ~7ms/frame at 12k sprites with
 * alphaTest. The per-batch boolean is the minimum information needed.
 *
 * Skips batches whose material opts into GPU depth ordering via
 * `alphaTest > 0 && depthWrite`. Those materials rely on the GPU depth
 * test (with the layer/zIndex-derived Z baked into the instance matrix
 * by transformSyncSystem) and don't need CPU-side sorting.
 *
 * Zero-alloc per frame: scratch arrays in closure are reused frame to
 * frame, growing to the high-water mark of the largest mesh seen.
 */
export function createBatchSortSystem(): (world: World) => void {
  /** Per-batch dirty flag (consumed from each mesh's sort-dirty boolean). */
  let dirtyBatches: Uint8Array = new Uint8Array(16)

  /** Per-batch entity list — populated only for dirty batches. */
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
      dirtyBatches = new Uint8Array(Math.max(n, dirtyBatches.length * 2))
    }
    for (let i = 0; i < n; i++) dirtyBatches[i] = 0
  }

  function ensureBucketCapacity(n: number): void {
    while (batchEntityBuckets.length < n) batchEntityBuckets.push([])
  }

  function ensureSlotMapCapacity(n: number): void {
    if (slotToScratchIdx.length < n) {
      slotToScratchIdx = new Int32Array(Math.max(n, slotToScratchIdx.length * 2))
    }
  }

  return function batchSortSystem(world: World): void {
    const registryEntities = world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    const batchSlots = registry.batchSlots
    const batchCount = batchSlots.length
    if (batchCount === 0) return

    // --- Pass 0: consume per-batch sort-dirty flags and apply the gate ---
    //
    // Read-and-clear `_sortDirty` on every batch. If no non-gated batch
    // has unsorted changes, return immediately — typical knightmark frame.
    ensureDirtyCapacity(batchCount)
    let anyDirty = false
    for (let bi = 0; bi < batchCount; bi++) {
      const mesh = batchSlots[bi] as SpriteBatch | null
      if (!mesh) continue
      if (!mesh.consumeSortDirty()) continue
      const mat = mesh.spriteMaterial
      if (mat.alphaTest > 0 && mat.depthWrite) continue
      dirtyBatches[bi] = 1
      anyDirty = true
    }
    if (!anyDirty) return

    // --- Pass 1: bucket batched entities into the dirty batches ---
    const bsStore = getNumericStore(world, BatchSlot)
    const batchIdxArr = bsStore['batchIdx']!
    const slotArr = bsStore['slot']!

    const zIndexArr = getNumericStore(world, SpriteZIndex)['zIndex']!

    ensureBucketCapacity(batchCount)
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

    // --- Pass 2: sort each dirty batch ---
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

      // Sort scratchEids by zIndex ascending via V8's TimSort. O(n) on
      // near-sorted (steady state) and O(n log n) worst case (cold start
      // when allocation order is unrelated to zIndex).
      scratchEids.sort((a, b) => zIndexArr[a]! - zIndexArr[b]!)

      // scratchSlots holds the original physical slots in unsorted
      // enumeration order. Sort ascending to produce a stable target
      // mapping that preserves the set of physical indices (leaves
      // _freeList holes untouched) while ordering occupied slots by
      // zIndex.
      scratchSlots.sort((a, b) => a - b)

      // Apply permutation: entity scratchEids[i] (in sorted-zIndex order)
      // should occupy physical slot scratchSlots[i] (in ascending order).
      // Build slot → scratchIdx inverse map for O(1) swap-partner lookup;
      // maintain it as we permute.
      ensureSlotMapCapacity(mesh.maxSize)
      for (let i = 0; i < n; i++) {
        slotToScratchIdx[slotArr[scratchEids[i]!]!] = i
      }
      // Pull the sprite SoA cache so we can keep each swapped sprite's
      // cached `_batchSlot` in sync with the Koota store. Without this,
      // any direct-write setter (color, zIndex, addEffect → writeColor /
      // writeEnableBits / etc.) would target the stale pre-sort slot
      // and clobber a different sprite's data.
      const spriteArr = registry.spriteArr

      for (let i = 0; i < n; i++) {
        const targetSlot = scratchSlots[i]!
        const targetEid = scratchEids[i]!
        const currentSlot = slotArr[targetEid]!
        if (currentSlot === targetSlot) continue

        const otherIdx = slotToScratchIdx[targetSlot]!
        if (otherIdx <= i) continue // Set invariant broken — shouldn't happen.
        const otherEid = scratchEids[otherIdx]!

        mesh.swapSlots(currentSlot, targetSlot)
        slotArr[targetEid] = targetSlot
        slotArr[otherEid] = currentSlot
        slotToScratchIdx[targetSlot] = i
        slotToScratchIdx[currentSlot] = otherIdx

        // Update per-sprite cache so direct-write setters land at the
        // correct slot on subsequent calls.
        const targetSprite = spriteArr[targetEid & ENTITY_ID_MASK]
        const otherSprite = spriteArr[otherEid & ENTITY_ID_MASK]
        if (targetSprite) targetSprite._batchSlot = targetSlot
        if (otherSprite) otherSprite._batchSlot = currentSlot
      }
    }
  }
}
