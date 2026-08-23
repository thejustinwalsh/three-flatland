import { changed, select, type Entity, type NumericStore, type World } from '../runtime'
import {
  IsRenderable,
  IsBatched,
  SpriteColor,
  SpriteUV,
  SpriteFlip,
  SortLayer,
  SpriteMaterialRef,
  CameraLayersMask,
  BatchSlot,
  BatchMesh,
  BatchMeta,
  BatchRegistry,
} from '../traits'
import type { MaterialEffect } from '../../materials/MaterialEffect'
import type { Sprite2D } from '../../sprites/Sprite2D'
import type { SpriteBatch } from '../../pipeline/SpriteBatch'
import type { RegistryData } from '../batchUtils'

import { computeRunKey, getOrCreateRun, findOrCreateBatch, recycleBatchIfEmpty, removeRunIfEmpty } from '../batchUtils'
import { proxyPickToBatch, unproxyPickFromBatch } from '../../react/batchPicking'
import { entitySlot, liveStoredEntity } from '../snapshot'
import { getSpriteBatchOwnership } from '../../internal/sprite-batch-ownership'

const BatchRegistries = select(BatchRegistry)

/**
 * Create a batch-reassign system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function takes a world
 * and moves sprites between batches when their sort
 * key (layer or material) changes.
 *
 * Triggered by Changed(SortLayer), Changed(SpriteMaterialRef), or
 * Changed(CameraLayersMask) on batched sprites. If the new
 * (sortLayer, materialId, layers.mask) differs from the current batch's
 * run, removes from old batch and inserts into the correct one.
 *
 * zIndex changes within the same run do NOT require
 * batch movement — Z-offset handles depth sorting.
 *
 * Closes over its own `Changed` subscription + reused dedup Set so each
 * group has clean change-tracking state and the Set is cleared-and-
 * filled instead of allocated per frame.
 */
export function createBatchReassignSystem(ownerWorld: World): (world: World) => boolean {
  const ChangedAssignment = changed({
    any: [SortLayer, SpriteMaterialRef, CameraLayersMask],
    all: [IsBatched],
  })
  ownerWorld.activate(ChangedAssignment)
  const sortLayerStore = ownerWorld.store(SortLayer)
  const materialRefStore = ownerWorld.store(SpriteMaterialRef)
  const cameraLayersStore = ownerWorld.store(CameraLayersMask)
  const batchSlotStore = ownerWorld.store(BatchSlot)
  const batchMetaStore = ownerWorld.store(BatchMeta)
  const projectionStores: SpriteProjectionStores = {
    color: ownerWorld.store(SpriteColor),
    uv: ownerWorld.store(SpriteUV),
    flip: ownerWorld.store(SpriteFlip),
  }

  return function batchReassignSystem(world: World): boolean {
    const toReassign = world.drain(ChangedAssignment)
    if (toReassign.length === 0) return false

    const registryEntities = world.view(BatchRegistries)
    if (registryEntities.length === 0) return false
    const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
    if (!registry) return false

    let entityPosition = -1
    let reassigned = false
    try {
      entityLoop: for (entityPosition = 0; entityPosition < toReassign.length; entityPosition++) {
        const entity = toReassign[entityPosition]!
        const entityIndex = entitySlot(entity)
        const sprite = registry.spriteArr[entityIndex]
        if (!sprite) continue

        const oldBatchEntity = liveStoredEntity(world, batchSlotStore.batchEntity[entityIndex] ?? 0)
        if (!oldBatchEntity) continue

        const oldBatchIndex = entitySlot(oldBatchEntity)
        const oldSortLayer = batchMetaStore.sortLayer[oldBatchIndex]
        const oldMaterialId = batchMetaStore.materialId[oldBatchIndex]
        const oldLayersMask = batchMetaStore.layersMask[oldBatchIndex]
        if (oldSortLayer === undefined || oldMaterialId === undefined || oldLayersMask === undefined) continue
        const oldRunKey = computeRunKey(oldSortLayer, oldMaterialId, oldLayersMask)
        const oldSlot = batchSlotStore.slot[entityIndex] ?? -1
        const oldBatchMesh = world.read(oldBatchEntity, BatchMesh)
        if (oldSlot < 0 || !oldBatchMesh?.mesh) continue
        const oldOwnership = getSpriteBatchOwnership(oldBatchMesh.mesh)
        oldOwnership.assertSlotOwner(oldSlot, entity)

        // updateMatrix() is virtual/user-owned. Run it before reading the route
        // so a reentrant layers/material change is included in this transaction.
        // Preparation below is revalidated once and retried in the same frame.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            sprite.updateMatrix()
          } catch (error) {
            if (world.isAlive(entity) && world.has(entity, IsBatched) && world.has(entity, SpriteMaterialRef)) {
              world.touch(entity, SpriteMaterialRef)
            }
            throw error
          }
          if (
            !world.isAlive(entity) ||
            !world.has(entity, IsRenderable) ||
            !world.has(entity, IsBatched) ||
            registry.spriteArr[entitySlot(entity)] !== sprite
          ) {
            continue entityLoop
          }
          if (
            batchSlotStore.batchEntity[entityIndex] !== oldBatchEntity ||
            batchSlotStore.slot[entityIndex] !== oldSlot
          ) {
            continue entityLoop
          }
          oldOwnership.assertSlotOwner(oldSlot, entity)
          const newLayer = sortLayerStore.value[entityIndex]
          const newMaterialId = materialRefStore.materialId[entityIndex]
          if (newLayer === undefined || newMaterialId === undefined) continue entityLoop
          const newMask = cameraLayersStore.mask[entityIndex] ?? sprite.layers.mask
          const material = sprite.material
          const newRunKey = computeRunKey(newLayer, newMaterialId, newMask)

          if (oldRunKey === newRunKey) continue entityLoop

          // Reserve and seed the destination before releasing the source. A
          // failed allocation therefore leaves the existing assignment intact.
          const { run, created: runCreated } = getOrCreateRun(registry, newLayer, newMaterialId, newMask, material)
          let newBatchEntity: Entity
          try {
            newBatchEntity = findOrCreateBatch(world, registry, run)
          } catch (error) {
            if (runCreated) removeRunIfEmpty(registry, run)
            if (world.isAlive(entity) && world.has(entity, IsBatched) && world.has(entity, SpriteMaterialRef)) {
              world.touch(entity, SpriteMaterialRef)
            }
            throw error
          }
          const newBatchMesh = world.read(newBatchEntity, BatchMesh)
          if (!newBatchMesh?.mesh) {
            if (runCreated) removeRunIfEmpty(registry, run)
            throw new Error('three-flatland: Published reassignment batch is missing its mesh')
          }
          const newOwnership = getSpriteBatchOwnership(newBatchMesh.mesh)
          const newSlot = newOwnership.reserveSlot()
          if (newSlot < 0) {
            recycleBatchIfEmpty(world, registry, newBatchEntity, run)
            if (world.isAlive(entity) && world.has(entity, SpriteMaterialRef)) {
              world.touch(entity, SpriteMaterialRef)
            }
            throw new Error('three-flatland: Batch selected for reassignment has no reservable slot')
          }
          let destinationCommitted = false
          let destinationRolledBack = false
          let newBatchIdx = -1
          try {
            syncAllBuffers(entityIndex, newSlot, newBatchMesh.mesh, sprite, projectionStores)

            if (
              !world.isAlive(entity) ||
              !world.has(entity, IsRenderable) ||
              !world.has(entity, IsBatched) ||
              registry.spriteArr[entitySlot(entity)] !== sprite
            ) {
              newBatchMesh.mesh.grid.remove(sprite)
              newOwnership.rollbackSlot(newSlot)
              newBatchMesh.mesh.syncCount()
              recycleBatchIfEmpty(world, registry, newBatchEntity, run)
              destinationRolledBack = true
              continue entityLoop
            }
            const currentLayer = sortLayerStore.value[entityIndex]
            const currentMaterialId = materialRefStore.materialId[entityIndex]
            const currentMask = cameraLayersStore.mask[entityIndex] ?? sprite.layers.mask
            const ownershipStillCurrent =
              batchSlotStore.batchEntity[entityIndex] === oldBatchEntity && batchSlotStore.slot[entityIndex] === oldSlot
            if (!ownershipStillCurrent) {
              newBatchMesh.mesh.grid.remove(sprite)
              newOwnership.rollbackSlot(newSlot)
              newBatchMesh.mesh.syncCount()
              recycleBatchIfEmpty(world, registry, newBatchEntity, run)
              destinationRolledBack = true
              continue entityLoop
            }
            const routeStillCurrent =
              currentLayer === newLayer &&
              currentMaterialId === newMaterialId &&
              currentMask === newMask &&
              sprite.material === material
            if (!routeStillCurrent) {
              newBatchMesh.mesh.grid.remove(sprite)
              newOwnership.rollbackSlot(newSlot)
              newBatchMesh.mesh.syncCount()
              recycleBatchIfEmpty(world, registry, newBatchEntity, run)
              destinationRolledBack = true
              if (attempt === 0) continue
              throw new Error('three-flatland: Batch route changed repeatedly during reassignment preparation')
            }

            // Revalidate the source after preparation before publishing either
            // side of the move.
            oldOwnership.assertSlotOwner(oldSlot, entity)
            newOwnership.commitSlot(newSlot, entity, sprite)
            destinationCommitted = true
            // A reassigned transparent sprite is appended physically. Ensure
            // the same-frame sort pass places it by zIndex within the existing
            // destination batch instead of leaving insertion order indefinitely.
            newBatchMesh.mesh.markSortDirty()

            newBatchIdx = batchMetaStore.batchIdx[entitySlot(newBatchEntity)] ?? -1
            batchSlotStore.batchEntity[entityIndex] = newBatchEntity
            batchSlotStore.batchIdx[entityIndex] = newBatchIdx
            batchSlotStore.slot[entityIndex] = newSlot
          } catch (error) {
            newBatchMesh.mesh.grid.remove(sprite)
            if (!destinationRolledBack) {
              if (destinationCommitted) newOwnership.releaseSlot(newSlot, entity)
              else newOwnership.rollbackSlot(newSlot)
              newBatchMesh.mesh.syncCount()
              recycleBatchIfEmpty(world, registry, newBatchEntity, run)
            }
            if (world.isAlive(entity) && world.has(entity, IsBatched) && world.has(entity, SpriteMaterialRef)) {
              world.touch(entity, SpriteMaterialRef)
            }
            throw error
          }

          // Source ownership was fully preflighted immediately before the
          // destination publish. Nothing between that check and this release can
          // mutate its physical/stable rows, so release is the no-throw half of
          // the transaction.
          oldOwnership.releaseSlot(oldSlot, entity)
          oldBatchMesh.mesh.syncCount()

          // Drop the picking-broadphase entry with the slot — the sprite is
          // re-indexed into its new batch's grid by syncAllBuffers below.
          // The R3F pick proxy moves with it (re-proxied after insertion).
          oldBatchMesh.mesh.grid.remove(sprite)
          unproxyPickFromBatch(sprite, oldBatchMesh.mesh)

          registry.materialRefs.set(newMaterialId, {
            material,
            version: material._effectSchemaVersion,
          })

          // Update the sprite's cached batch references — the invariant is
          // that these match BatchSlot for the lifetime of the assignment.
          sprite._batchMesh = newBatchMesh.mesh
          sprite._batchSlot = newSlot
          sprite._batchIdx = newBatchIdx

          // Re-route R3F picking through the new batch.
          proxyPickToBatch(sprite, newBatchMesh.mesh)

          // Recycle old batch if empty
          if (oldBatchMesh.mesh.isEmpty) {
            const oldRun = registry.runs.get(oldRunKey)
            if (oldRun) {
              recycleBatchIfEmpty(world, registry, oldBatchEntity, oldRun)
            }
          }

          // The new slot is seeded below from the sprite's local matrix, but a
          // hierarchy/auto-managed sprite may need an ancestor-composed matrix or
          // a zero-scale hidden matrix instead. Force the transform pass that
          // follows this system to rewrite the slot and its broadphase entry in
          // the same schedule run. Retaining the previous hierarchy snapshot
          // would otherwise let the tracker early-out forever.
          sprite._batchHierarchyState = undefined
          registry.transformsDirty = true
          reassigned = true
          break
        }
      }
    } catch (error) {
      // The current entity's rollback path normally republishes its own
      // change, but source/destination invariants can throw before it. Include
      // current; HandleQueue dedupes a retry already emitted by the local path.
      requeueReassignments(world, toReassign, Math.max(0, entityPosition))
      throw error
    }
    return reassigned
  }
}

function requeueReassignments(world: World, entities: readonly Entity[], start: number): void {
  for (let position = start; position < entities.length; position++) {
    const entity = entities[position]!
    if (!world.isAlive(entity) || !world.has(entity, IsBatched) || !world.has(entity, SpriteMaterialRef)) continue
    world.touch(entity, SpriteMaterialRef)
  }
}

interface SpriteProjectionStores {
  readonly color: NumericStore<typeof SpriteColor.defaults>
  readonly uv: NumericStore<typeof SpriteUV.defaults>
  readonly flip: NumericStore<typeof SpriteFlip.defaults>
}

function syncAllBuffers(
  entityIndex: number,
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  stores: SpriteProjectionStores
): void {
  const r = stores.color.r[entityIndex]
  if (r !== undefined) {
    mesh.writeColor(slot, r, stores.color.g[entityIndex]!, stores.color.b[entityIndex]!, stores.color.a[entityIndex]!)
  }

  const x = stores.uv.x[entityIndex]
  if (x !== undefined) {
    mesh.writeUV(slot, x, stores.uv.y[entityIndex]!, stores.uv.w[entityIndex]!, stores.uv.h[entityIndex]!)
  }

  const flipX = stores.flip.x[entityIndex]
  if (flipX !== undefined) {
    mesh.writeFlip(slot, flipX, stores.flip.y[entityIndex]!)
  }

  // updateMatrix() runs before route capture in the caller so any reentrant
  // route mutation participates in the same transaction.
  mesh.writeMatrix(slot, sprite.matrix)

  // Picking broadphase: index at the local translation; the world-folded
  // position lands via transformSyncSystem — see batchAssignSystem.
  mesh.indexForPicking(sprite)

  // Lighting system flags (instanceSystem.z) + shadow radius
  // (instanceExtras.x) — re-written on reassign so a slot move carries
  // the sprite's lit/shadow state. (Sort swaps preserve them via
  // swapSlots; this covers cross-batch reassignment.)
  mesh.writeSystemFlags(slot, sprite._systemFlags)
  mesh.writeShadowRadius(slot, sprite.shadowRadius ?? Math.max(Math.abs(sprite.scale.x), Math.abs(sprite.scale.y)))

  // Sync effects
  const material = sprite.material
  const tier = material._effectTier
  if (tier > 0) {
    writePackedEffects(slot, mesh, sprite)
  }

  mesh.syncCount()
}

function writePackedEffects(slot: number, mesh: SpriteBatch, sprite: Sprite2D): void {
  const material = sprite.material

  // Enable bits live in instanceSystem.w after the interleaved-buffer
  // refactor — NOT in effectBuf0. See SpriteBatch.writeEnableBits and
  // the EffectMaterial shader composition (reads instanceSystem.w).
  mesh.writeEnableBits(slot, sprite._effectFlags)

  for (const effect of sprite._effects) {
    const EffectClass = effect.constructor as typeof MaterialEffect
    for (const field of EffectClass._fields) {
      const slotKey = `${EffectClass.effectName}_${field.name}`
      const slotInfo = material._effectSlots.get(slotKey)
      if (!slotInfo) continue
      const value = effect._getField(field.name)
      if (typeof value === 'number') {
        const bufIdx = Math.floor(slotInfo.offset / 4)
        const comp = slotInfo.offset % 4
        mesh.writeEffectSlot(slot, bufIdx, comp, value)
      } else {
        for (let i = 0; i < field.size; i++) {
          const off = slotInfo.offset + i
          mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, value[i]!)
        }
      }
    }
  }
}
