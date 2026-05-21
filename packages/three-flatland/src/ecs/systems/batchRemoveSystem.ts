import { createRemoved } from 'koota'
import type { World, Entity } from 'koota'
import { IsRenderable, InBatch, BatchSlot, BatchMesh, BatchMeta, BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { computeRunKey, recycleBatchIfEmpty } from '../batchUtils'
import { ENTITY_ID_MASK } from '../snapshot'

/**
 * Create a batch-remove system bound to its own change-tracking
 * subscription.
 *
 * Each SpriteGroup constructs one. Removes sprites from batches when
 * they lose IsRenderable.
 *
 * Triggered by Removed(IsRenderable). Reads the InBatch relation to find
 * the batch entity and slot, frees the slot, removes the relation,
 * and recycles the batch if empty.
 *
 * Entity destruction is deferred — zombie entities are returned to the
 * caller and destroyed at the top of the next frame by
 * `deferredDestroySystem`. This pushes koota's cascading trait removal
 * cost out of the hot render frame.
 */
export function createBatchRemoveSystem(): (world: World, pendingDestroy: Entity[]) => void {
  const Removed = createRemoved()

  return function batchRemoveSystem(world: World, pendingDestroy: Entity[]): void {
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

      const batchMesh = batchEntity.get(BatchMesh)

      // BatchSlot.slot is the authoritative live slot: batchSortSystem keeps it
      // in sync on swaps, whereas InBatch.slot is never rewritten and can be a
      // stale pre-swap index that points at another sprite's row. Read it from
      // the SoA, not sprite._batchSlot — _unenrollFromWorld has already nulled
      // the spriteArr entry by the time this deferred system runs.
      const slot = entity.get(BatchSlot)?.slot ?? -1

      if (slot >= 0 && batchMesh?.mesh) {
        batchMesh.mesh.freeSlot(slot)
        batchMesh.mesh.syncCount()
      }

      // Clear the sprite's cached batch references — once we free the
      // slot, setter direct-write paths must fall back to standalone-mode
      // until the next batchAssignSystem pass.
      const eid = (entity as unknown as number) & ENTITY_ID_MASK
      const sprite = registry.spriteArr[eid]
      if (sprite) {
        sprite._batchMesh = null
        sprite._batchSlot = -1
        sprite._batchIdx = -1
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
      pendingDestroy.push(entity)
    }
  }
}

/**
 * Destroy entities deferred from the previous frame's batchRemoveSystem.
 *
 * Runs at the top of the frame before any other system, so koota's
 * cascading trait removal cost is paid outside the hot render path.
 * The zombie entities are invisible to all systems (no IsRenderable,
 * no IsBatched) so the one-frame delay is safe.
 */
export function deferredDestroySystem(pendingDestroy: Entity[]): void {
  if (pendingDestroy.length === 0) return
  for (const entity of pendingDestroy) {
    entity.destroy()
  }
  pendingDestroy.length = 0
}
