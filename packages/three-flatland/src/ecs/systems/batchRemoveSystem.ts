import { removed, select, type Entity, type World } from '../runtime'
import { IsRenderable, IsBatched, BatchSlot, BatchMesh, BatchMeta, BatchRegistry } from '../traits'
import type { RegistryData } from '../batchUtils'
import { computeRunKey, recycleBatchIfEmpty } from '../batchUtils'
import { unproxyPickFromBatch } from '../../react/batchPicking'
import { entitySlot, liveStoredEntity } from '../snapshot'

const BatchRegistries = select(BatchRegistry)

/**
 * Create a batch-remove system bound to its own change-tracking
 * subscription.
 *
 * Each SpriteGroup constructs one. Removes sprites from batches when
 * they lose IsRenderable.
 *
 * Triggered by Removed(IsRenderable). Reads direct `BatchSlot` ownership to
 * find the batch entity and physical row, frees it, clears the ownership,
 * and recycles the batch if empty.
 *
 * Entity destruction is deferred — zombie entities are returned to the
 * caller and destroyed at the top of the next frame by
 * `deferredDestroySystem`. This pushes full trait teardown
 * cost out of the hot render frame.
 */
export function createBatchRemoveSystem(ownerWorld: World): (world: World, pendingDestroy: Entity[]) => void {
  const RemovedRenderable = removed(IsRenderable)
  ownerWorld.activate(RemovedRenderable)

  return function batchRemoveSystem(world: World, pendingDestroy: Entity[]): void {
    const removedEntities = world.drain(RemovedRenderable)
    if (removedEntities.length === 0) return

    const registryEntity = world.view(BatchRegistries)[0]
    const registry = registryEntity
      ? (world.read(registryEntity, BatchRegistry) as RegistryData | undefined)
      : undefined

    for (const entity of removedEntities) {
      // Material/schema eviction deliberately remove+adds IsRenderable on the
      // same live entity to trigger assignment. Its queued Removed event is
      // stale by the time this system runs and must not retire the survivor.
      if (!world.isAlive(entity) || world.has(entity, IsRenderable)) continue

      const assignment = world.read(entity, BatchSlot)
      const batchEntity = liveStoredEntity(world, assignment?.batchEntity ?? 0)
      const batchMesh = batchEntity ? world.read(batchEntity, BatchMesh) : undefined

      // BatchSlot.slot is the authoritative live slot: batchSortSystem keeps it
      // in sync on swaps. Read it from the SoA, not sprite._batchSlot —
      // _unenrollFromWorld has already nulled
      // the spriteArr entry by the time this deferred system runs.
      const slot = assignment?.slot ?? -1

      if (slot >= 0 && batchMesh?.mesh) {
        batchMesh.mesh.releaseSlot(slot, entity)
        batchMesh.mesh.syncCount()
      }

      // Clear the sprite's cached batch references — once we free the
      // slot, setter direct-write paths must fall back to standalone-mode
      // until the next batchAssignSystem pass.
      const eid = entitySlot(entity)
      const sprite = registry?.spriteArr[eid]
      if (sprite) {
        // Drop the picking-broadphase entry. The common removal path
        // (Sprite2D._unenrollFromWorld) has already nulled spriteArr AND
        // removed the grid entry itself; this covers removal triggers
        // where the sprite is still enrolled.
        if (batchMesh?.mesh) {
          batchMesh.mesh.grid.remove(sprite)
          // Hand picking back from the batch (R3F batch-root proxy).
          unproxyPickFromBatch(sprite, batchMesh.mesh)
        }
        sprite._batchMesh = null
        sprite._batchSlot = -1
        sprite._batchIdx = -1
      }

      if (world.has(entity, BatchSlot)) {
        world.patch(entity, BatchSlot, { batchEntity: 0, batchIdx: -1, slot: -1 }, false)
      }
      if (world.has(entity, IsBatched)) world.remove(entity, IsBatched)

      // Recycle batch if empty
      if (registry && batchEntity && batchMesh?.mesh?.isEmpty) {
        const meta = world.read(batchEntity, BatchMeta)
        if (meta) {
          const key = computeRunKey(meta.sortLayer, meta.materialId, meta.layersMask)
          const run = registry.runs.get(key)
          if (run) {
            recycleBatchIfEmpty(world, registry, batchEntity, run)
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
 * Runs at the top of the frame before any other system, so full trait
 * teardown is paid outside the hot render path.
 * The zombie entities are invisible to all systems (no IsRenderable,
 * no IsBatched) so the one-frame delay is safe.
 */
export function deferredDestroySystem(world: World, pendingDestroy: Entity[]): void {
  if (pendingDestroy.length === 0) return
  for (const entity of pendingDestroy) {
    if (world.isAlive(entity)) world.destroy(entity)
  }
  pendingDestroy.length = 0
}
