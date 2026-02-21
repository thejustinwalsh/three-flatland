import { createRemoved } from 'koota'
import type { World } from 'koota'
import {
  IsRenderable,
  IsBatched,
  InBatch,
  BatchSlot,
  BatchMesh,
  BatchMeta,
  BatchRegistry,
} from '../traits'
import type { RegistryData } from '../batchUtils'
import { computeRunKey, recycleBatchIfEmpty } from '../batchUtils'

const Removed = createRemoved()

/**
 * Remove sprites from batches when they lose IsRenderable.
 *
 * Triggered by Removed(IsRenderable). Reads the InBatch relation to find
 * the batch entity and slot, frees the slot, removes the relation,
 * and recycles the batch if empty.
 */
export function batchRemoveSystem(world: World): void {
  const removed = world.query(Removed(IsRenderable))
  if (removed.length === 0) return

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  for (const entity of removed) {
    // Find batch entity via InBatch relation
    const batchEntity = entity.targetFor(InBatch)
    if (!batchEntity) continue

    // Get slot and mesh
    const relationData = entity.get(InBatch(batchEntity)) as { slot: number } | undefined
    const batchMesh = batchEntity.get(BatchMesh)

    if (relationData && batchMesh?.mesh) {
      // Free the slot (sets alpha=0, adds to free list)
      batchMesh.mesh.freeSlot(relationData.slot)
      batchMesh.mesh.syncCount()
    }

    // Remove relation and IsBatched tag
    entity.remove(InBatch(batchEntity))
    if (entity.has(BatchSlot)) {
      entity.set(BatchSlot, { batchIdx: -1, slot: -1 }, false)
    }
    if (entity.has(IsBatched)) {
      entity.remove(IsBatched)
    }

    // Recycle batch if empty
    if (batchMesh?.mesh?.isEmpty) {
      const meta = batchEntity.get(BatchMeta)
      if (meta) {
        const key = computeRunKey(meta.layer, meta.materialId)
        const run = registry.runs.get(key)
        if (run) {
          recycleBatchIfEmpty(registry, batchEntity, run)
        }
      }
    }
  }
}
