import type { Entity, World } from 'koota'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteBatch } from '../pipeline/SpriteBatch'
import { BatchMesh, BatchMeta, type BatchRun } from './traits'

/** Shape of the BatchRegistry trait data, used for parameter typing. */
export interface RegistryData {
  runs: Map<number, BatchRun>
  sortedRunKeys: number[]
  batchPool: Entity[]
  activeBatches: Entity[]
  renderOrderDirty: boolean
  maxBatchSize: number
  materialRefs: Map<number, { material: Sprite2DMaterial; version: number }>
  batchSlots: (SpriteBatch | null)[]
  batchSlotFreeList: number[]
}

/**
 * Compute a run key from layer and materialId.
 * Runs are the primary batch grouping dimension: sprites in the same run
 * share (layer, materialId) and can be in the same batch.
 */
export function computeRunKey(layer: number, materialId: number): number {
  return ((layer & 0xff) << 16) | (materialId & 0xffff)
}

/**
 * Binary search for insertion point in a sorted array.
 * Returns the index where `key` should be inserted to maintain sort order.
 */
export function binarySearch(arr: number[], key: number): number {
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
export function sortedInsert(arr: number[], key: number): void {
  const idx = binarySearch(arr, key)
  if (idx >= 0) return
  arr.splice(~idx, 0, key)
}

/**
 * Remove a value from a sorted array.
 * No-op if the value doesn't exist.
 */
export function sortedRemove(arr: number[], key: number): void {
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
 * Get or create a batch run for a given (layer, materialId) combo.
 */
export function getOrCreateRun(
  registry: RegistryData,
  layer: number,
  materialId: number,
  material: Sprite2DMaterial
): { run: BatchRun; created: boolean } {
  const key = computeRunKey(layer, materialId)
  let run = registry.runs.get(key)
  if (run) return { run, created: false }

  run = { materialId, layer, material, batches: [] }
  registry.runs.set(key, run)
  sortedInsert(registry.sortedRunKeys, key)
  return { run, created: true }
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

  if (batchEntity) {
    const existing = batchEntity.get(BatchMesh)
    if (existing?.mesh && existing.mesh.spriteMaterial.batchId === run.materialId) {
      mesh = existing.mesh
      mesh.resetSlots()
    } else {
      if (existing?.mesh) existing.mesh.dispose()
      mesh = new SpriteBatch(run.material, registry.maxBatchSize)
    }
  } else {
    batchEntity = world.spawn()
    mesh = new SpriteBatch(run.material, registry.maxBatchSize)
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
      layer: run.layer,
      batchIdx,
    }, false)
  } else {
    batchEntity.add(
      BatchMeta({
        materialId: run.materialId,
        layer: run.layer,
        renderOrder: 0,
        batchIdx,
      })
    )
  }

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
    const key = computeRunKey(run.layer, run.materialId)
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
