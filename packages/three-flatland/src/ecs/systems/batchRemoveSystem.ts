import { createRemoved } from 'koota'
import type { World } from 'koota'
import {
  IsRenderable,
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
 *
 * Entity destruction is deferred — zombie entities are pushed to
 * `registry.pendingDestroy` and destroyed at the top of the next frame
 * by `deferredDestroySystem`. This pushes koota's cascading trait removal
 * cost out of the hot render frame.
 *
 * Reads pendingDestroy from BatchRegistry. Takes only (world).
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

    // Remove relation and reset BatchSlot
    entity.remove(InBatch(batchEntity))
    entity.set(BatchSlot, { batchIdx: -1, slot: -1 }, false)

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

    // Defer entity destruction to top of next frame
    registry.pendingDestroy.push(entity)
  }
}

/**
 * Destroy entities deferred from the previous frame's batchRemoveSystem.
 *
 * Runs at the top of the frame before any other system, so koota's
 * cascading trait removal cost is paid outside the hot render path.
 * The zombie entities are invisible to all systems (no IsRenderable,
 * no IsBatched) so the one-frame delay is safe.
 *
 * Reads pendingDestroy from BatchRegistry. Takes only (world).
 */
export function deferredDestroySystem(world: World): void {
  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  const pendingDestroy = registry.pendingDestroy
  if (pendingDestroy.length === 0) return
  for (const entity of pendingDestroy) {
    entity.destroy()
  }
  pendingDestroy.length = 0
}
