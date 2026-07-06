import type { Entity, World, Trait } from 'koota'
import type { Group, Object3D } from 'three'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Sprite2D } from '../sprites/Sprite2D'
import { SpriteBatch } from '../pipeline/SpriteBatch'
import { BatchMesh, BatchMeta, type BatchRun } from './traits'
import type { SystemSchedule } from './SystemSchedule'

/** Shape of the BatchRegistry trait data, used for parameter typing. */
export interface RegistryData {
  runs: Map<string, BatchRun>
  sortedRunKeys: string[]
  batchPool: Entity[]
  activeBatches: Entity[]
  renderOrderDirty: boolean
  maxBatchSize: number
  /** Tiered batch sizes for the auto-orchestrate path; null = fixed maxBatchSize. */
  tierLadder: readonly number[] | null
  materialRefs: Map<number, { material: Sprite2DMaterial; version: number }>
  batchSlots: (SpriteBatch | null)[]
  batchSlotFreeList: number[]
  /** Flat array of Sprite2D refs indexed by entity SoA index (eid).
   *  Pure array indexing — same O(1) pattern as other SoA stores. */
  spriteArr: (Sprite2D | null)[]
  /** Cached effect traits across all materials. */
  effectTraits: Map<Trait, typeof MaterialEffect>
  /** Entities whose destruction is deferred to the top of the next frame. */
  pendingDestroy: Entity[]
  /** The SpriteGroup (parent Group) for scene graph sync. */
  parentGroup: Group | null
  /** Bound Group.prototype.add bypassing SpriteGroup override. */
  parentAdd: ((...objects: Object3D[]) => Group) | null
  /** Bound Group.prototype.remove bypassing SpriteGroup override. */
  parentRemove: ((...objects: Object3D[]) => Group) | null
  /** Whether auto-invalidate transforms is enabled. */
  autoInvalidateTransforms: boolean
  /** The SystemSchedule for this world. */
  schedule: SystemSchedule | null
  /** Monotonic counter of completed `schedule.run` invocations — see trait doc. */
  scheduleRuns: number
  /** Whether any occluder changed since the last shadow generation. */
  occludersDirty: boolean
}

/**
 * A batch run key: fixed-width hex `sortLayer(4) | materialId(4) | mask(8)`.
 *
 * Lexicographic string order equals sortLayer-major numeric order, so the
 * sorted run-key array doubles as the render-order source without any
 * numeric packing. A string key sidesteps Float64 precision: the three
 * components total 48+ bits, past the 53-bit integer-safe range.
 */
export type RunKey = string

const hexPad = (value: number, width: number) => value.toString(16).padStart(width, '0')

/**
 * Compute a run key from sortLayer, materialId, and camera layers mask.
 * Runs are the primary batch grouping dimension: sprites in the same run
 * share (materialId, sortLayer, layers.mask) and can be in the same batch.
 * Each component is a real GPU constraint — shader pipeline, render-list
 * position, camera visibility.
 */
export function computeRunKey(sortLayer: number, materialId: number, layersMask: number): RunKey {
  return hexPad(sortLayer & 0xffff, 4) + hexPad(materialId & 0xffff, 4) + hexPad(layersMask >>> 0, 8)
}

/**
 * Binary search for insertion point in a sorted array.
 * Returns the index where `key` should be inserted to maintain sort order.
 */
export function binarySearch<T extends number | string>(arr: T[], key: T): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const v = arr[mid]!
    if (v < key) lo = mid + 1
    else if (v > key) hi = mid - 1
    else return mid
  }
  return ~lo
}

/**
 * Insert a value into a sorted array at the correct position.
 * No-op if the value already exists.
 */
export function sortedInsert<T extends number | string>(arr: T[], key: T): void {
  const idx = binarySearch(arr, key)
  if (idx >= 0) return
  arr.splice(~idx, 0, key)
}

/**
 * Remove a value from a sorted array.
 * No-op if the value doesn't exist.
 */
export function sortedRemove<T extends number | string>(arr: T[], key: T): void {
  const idx = binarySearch(arr, key)
  if (idx >= 0) arr.splice(idx, 1)
}

/**
 * Allocate a batchIdx in the registry's batchSlots array.
 * Reuses freed indices when available.
 */
export function allocateBatchIdx(registry: RegistryData, mesh: SpriteBatch): number {
  let idx: number
  if (registry.batchSlotFreeList.length > 0) {
    idx = registry.batchSlotFreeList.pop()!
    registry.batchSlots[idx] = mesh
  } else {
    idx = registry.batchSlots.length
    registry.batchSlots.push(mesh)
  }
  return idx
}

/**
 * Free a batchIdx, returning it to the free list.
 */
export function freeBatchIdx(registry: RegistryData, idx: number): void {
  if (idx < 0 || idx >= registry.batchSlots.length) return
  registry.batchSlots[idx] = null
  registry.batchSlotFreeList.push(idx)
}

/**
 * Get or create a batch run for a given (sortLayer, materialId, layersMask) combo.
 */
export function getOrCreateRun(
  registry: RegistryData,
  sortLayer: number,
  materialId: number,
  layersMask: number,
  material: Sprite2DMaterial
): { run: BatchRun; created: boolean } {
  const key = computeRunKey(sortLayer, materialId, layersMask)
  let run = registry.runs.get(key)
  if (run) return { run, created: false }

  run = { materialId, sortLayer, layersMask, material, batches: [] }
  registry.runs.set(key, run)
  sortedInsert(registry.sortedRunKeys, key)
  return { run, created: true }
}

/**
 * Auto-batch tier ladder. Each SpriteBatch is born at a fixed tier and
 * stays that size for life; when it fills, the next batch in the run is
 * created one tier up. Memory scales with actual usage: 2 sprites cost
 * ~11 KB (tier 0), not the 2.75 MB a max-size batch would.
 */
export const BATCH_TIER_LADDER: readonly number[] = [64, 256, 1024, 4096, 16384]

/**
 * Resolve the slot count for the next batch in a run.
 *
 * `registry.tierLadder` non-null → tiered sizing indexed by how many
 * batches the run already has (clamped to the top tier). Null → the
 * registry's fixed `maxBatchSize` (explicit SpriteGroup opt-in).
 */
export function resolveBatchSize(registry: RegistryData, run: BatchRun): number {
  const ladder = registry.tierLadder
  if (!ladder || ladder.length === 0) return registry.maxBatchSize
  return ladder[Math.min(run.batches.length, ladder.length - 1)]!
}

/**
 * Find a batch in a run that has free slots, or create a new one.
 * Tries the batch pool first for reuse.
 */
export function findOrCreateBatch(
  world: World,
  registry: RegistryData,
  run: BatchRun
): Entity {
  // Check existing batches in this run for free slots
  for (const batchEntity of run.batches) {
    const batchMesh = batchEntity.get(BatchMesh)
    if (batchMesh?.mesh && !batchMesh.mesh.isFull) return batchEntity
  }

  // No free slots — try to get a batch entity from the pool
  let batchEntity = registry.batchPool.pop()
  let mesh: SpriteBatch | null = null

  // Tier ladder: each successive batch in a run is born at the next
  // tier size (64 → 256 → 1024 → 4096 → 16384). Explicit SpriteGroup
  // users override via `maxBatchSize`, which pins every batch to that
  // size (tierLadder null).
  const batchSize = resolveBatchSize(registry, run)

  if (batchEntity) {
    const existing = batchEntity.get(BatchMesh)
    if (
      existing?.mesh &&
      existing.mesh.spriteMaterial.batchId === run.materialId &&
      existing.mesh.maxSize === batchSize
    ) {
      mesh = existing.mesh
      mesh.resetSlots()
    } else {
      if (existing?.mesh) existing.mesh.dispose()
      mesh = new SpriteBatch(run.material, batchSize)
    }
  } else {
    batchEntity = world.spawn()
    mesh = new SpriteBatch(run.material, batchSize)
  }

  // Allocate a batchIdx for O(1) mesh lookup from BatchSlot
  const batchIdx = allocateBatchIdx(registry, mesh)

  // Set/update traits on batch entity (no Changed observers — skip change detection)
  if (batchEntity.has(BatchMesh)) {
    batchEntity.set(BatchMesh, { mesh }, false)
  } else {
    batchEntity.add(BatchMesh({ mesh }))
  }

  if (batchEntity.has(BatchMeta)) {
    batchEntity.set(BatchMeta, {
      materialId: run.materialId,
      sortLayer: run.sortLayer,
      layersMask: run.layersMask,
      batchIdx,
    }, false)
  } else {
    batchEntity.add(
      BatchMeta({
        materialId: run.materialId,
        sortLayer: run.sortLayer,
        layersMask: run.layersMask,
        renderOrder: 0,
        batchIdx,
      })
    )
  }

  // The batch's camera mask mirrors its run — sprites with a custom
  // `layers` mask route to a batch the same cameras see.
  mesh.layers.mask = run.layersMask

  // Set descriptive name for devtools scene tree
  mesh.name = `SpriteBatch[sortLayer=${run.sortLayer}, mat=${run.materialId}, mask=${run.layersMask}]`

  run.batches.push(batchEntity)
  registry.activeBatches.push(batchEntity)
  registry.renderOrderDirty = true

  return batchEntity
}

/**
 * Recycle a batch entity to the pool if it's empty.
 * Removes it from its run and from activeBatches.
 */
export function recycleBatchIfEmpty(
  registry: RegistryData,
  batchEntity: Entity,
  run: BatchRun
): void {
  const batchMesh = batchEntity.get(BatchMesh)
  if (!batchMesh?.mesh || !batchMesh.mesh.isEmpty) return

  // Remove from run
  const idx = run.batches.indexOf(batchEntity)
  if (idx >= 0) run.batches.splice(idx, 1)

  // If run is now empty, remove it
  if (run.batches.length === 0) {
    const key = computeRunKey(run.sortLayer, run.materialId, run.layersMask)
    registry.runs.delete(key)
    sortedRemove(registry.sortedRunKeys, key)
  }

  // Free the batchIdx
  const meta = batchEntity.get(BatchMeta)
  if (meta && meta.batchIdx >= 0) {
    freeBatchIdx(registry, meta.batchIdx)
    batchEntity.set(BatchMeta, { batchIdx: -1 }, false)
  }

  // Remove from active batches
  const activeIdx = registry.activeBatches.indexOf(batchEntity)
  if (activeIdx >= 0) registry.activeBatches.splice(activeIdx, 1)

  // Add to pool
  registry.batchPool.push(batchEntity)
  registry.renderOrderDirty = true
}

/**
 * Rebuild the sorted order of active batches based on run key ordering.
 * Assigns renderOrder to each batch entity.
 */
export function rebuildBatchOrder(registry: RegistryData): void {
  if (!registry.renderOrderDirty) return

  registry.activeBatches.length = 0
  let order = 0
  for (const key of registry.sortedRunKeys) {
    const run = registry.runs.get(key)
    if (!run) continue
    for (const batchEntity of run.batches) {
      batchEntity.set(BatchMeta, { renderOrder: order++ }, false)
      registry.activeBatches.push(batchEntity)
    }
  }

  registry.renderOrderDirty = false
}
