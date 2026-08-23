import { changed, select, type AnyTrait, type Entity, type World } from '../runtime'
import {
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

import { computeRunKey, getOrCreateRun, findOrCreateBatch, recycleBatchIfEmpty } from '../batchUtils'
import { proxyPickToBatch, unproxyPickFromBatch } from '../../react/batchPicking'
import { entitySlot, liveStoredEntity } from '../snapshot'

const BatchRegistries = select(BatchRegistry)

/**
 * Create a batch-reassign system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function takes a world
 * + effect-trait map and moves sprites between batches when their sort
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
export function createBatchReassignSystem(
  ownerWorld: World
): (world: World, effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>) => void {
  const ChangedAssignment = changed({
    any: [SortLayer, SpriteMaterialRef, CameraLayersMask],
    all: [IsBatched],
  })
  ownerWorld.activate(ChangedAssignment)

  return function batchReassignSystem(world: World, effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>): void {
    const toReassign = world.drain(ChangedAssignment)
    if (toReassign.length === 0) return

    const registryEntities = world.view(BatchRegistries)
    if (registryEntities.length === 0) return
    const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
    if (!registry) return

    entityLoop: for (const entity of toReassign) {
      const sprite = registry.spriteArr[entitySlot(entity)]
      if (!sprite) continue

      const oldAssignment = world.read(entity, BatchSlot)
      const oldBatchEntity = liveStoredEntity(world, oldAssignment?.batchEntity ?? 0)
      if (!oldBatchEntity) continue

      const oldMeta = world.read(oldBatchEntity, BatchMeta)
      if (!oldMeta) continue
      const oldRunKey = computeRunKey(oldMeta.sortLayer, oldMeta.materialId, oldMeta.layersMask)
      const oldSlot = oldAssignment?.slot ?? -1
      const oldBatchMesh = world.read(oldBatchEntity, BatchMesh)
      if (oldSlot < 0 || !oldBatchMesh?.mesh) continue
      oldBatchMesh.mesh.assertSlotOwner(oldSlot, entity)

      // updateMatrix() is virtual/user-owned. Run it before reading the route
      // so a reentrant layers/material change is included in this transaction.
      // Preparation below is revalidated once and retried in the same frame.
      for (let attempt = 0; attempt < 2; attempt++) {
        sprite.updateMatrix()
        const newLayer = world.read(entity, SortLayer)
        const newMatRef = world.read(entity, SpriteMaterialRef)
        if (!newLayer || !newMatRef) continue entityLoop
        const newMask = world.read(entity, CameraLayersMask)?.mask ?? sprite.layers.mask
        const material = sprite.material
        const newRunKey = computeRunKey(newLayer.value, newMatRef.materialId, newMask)

        if (oldRunKey === newRunKey) continue entityLoop

        // Reserve and seed the destination before releasing the source. A
        // failed allocation therefore leaves the existing assignment intact.
        const { run } = getOrCreateRun(registry, newLayer.value, newMatRef.materialId, newMask, material)
        const newBatchEntity = findOrCreateBatch(world, registry, run)
        const newBatchMesh = world.read(newBatchEntity, BatchMesh)
        if (!newBatchMesh?.mesh) continue entityLoop
        const newSlot = newBatchMesh.mesh.reserveSlot()
        if (newSlot < 0) continue entityLoop
        let destinationCommitted = false
        let destinationRolledBack = false
        let newBatchIdx = -1
        try {
          syncAllBuffers(world, entity, newSlot, newBatchMesh.mesh, sprite, effectTraits)

          const currentLayer = world.read(entity, SortLayer)
          const currentMatRef = world.read(entity, SpriteMaterialRef)
          const currentMask = world.read(entity, CameraLayersMask)?.mask ?? sprite.layers.mask
          const routeStillCurrent =
            currentLayer?.value === newLayer.value &&
            currentMatRef?.materialId === newMatRef.materialId &&
            currentMask === newMask &&
            sprite.material === material
          if (!routeStillCurrent) {
            newBatchMesh.mesh.grid.remove(sprite)
            newBatchMesh.mesh.rollbackSlot(newSlot)
            newBatchMesh.mesh.syncCount()
            recycleBatchIfEmpty(world, registry, newBatchEntity, run)
            destinationRolledBack = true
            if (attempt === 0) continue
            throw new Error('three-flatland: Batch route changed repeatedly during reassignment preparation')
          }

          // Revalidate the source after preparation before publishing either
          // side of the move.
          oldBatchMesh.mesh.assertSlotOwner(oldSlot, entity)
          newBatchMesh.mesh.commitSlot(newSlot, entity, sprite)
          destinationCommitted = true

          const newMeta = world.read(newBatchEntity, BatchMeta)
          newBatchIdx = newMeta?.batchIdx ?? -1
          world.patch(entity, BatchSlot, { batchEntity: newBatchEntity, batchIdx: newBatchIdx, slot: newSlot }, false)
        } catch (error) {
          newBatchMesh.mesh.grid.remove(sprite)
          if (!destinationRolledBack) {
            if (destinationCommitted) newBatchMesh.mesh.releaseSlot(newSlot, entity)
            else newBatchMesh.mesh.rollbackSlot(newSlot)
            newBatchMesh.mesh.syncCount()
            recycleBatchIfEmpty(world, registry, newBatchEntity, run)
          }
          throw error
        }

        // Source ownership was fully preflighted immediately before the
        // destination publish. Nothing between that check and this release can
        // mutate its physical/stable rows, so release is the no-throw half of
        // the transaction.
        oldBatchMesh.mesh.releaseSlot(oldSlot, entity)
        oldBatchMesh.mesh.syncCount()

        // Drop the picking-broadphase entry with the slot — the sprite is
        // re-indexed into its new batch's grid by syncAllBuffers below.
        // The R3F pick proxy moves with it (re-proxied after insertion).
        oldBatchMesh.mesh.grid.remove(sprite)
        unproxyPickFromBatch(sprite, oldBatchMesh.mesh)

        registry.materialRefs.set(newMatRef.materialId, {
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

        // If the material itself changed, the old material's materialRefs
        // entry (a strong ref — keeps the material, and transitively its
        // texture, alive) is dead weight once no run still batches it.
        // registry.runs is sized by distinct (sortLayer, materialId, mask)
        // combinations, not sprite count, so this scan is cheap and only
        // runs on this reassignment event, never per frame.
        if (oldMeta.materialId !== newMatRef.materialId) {
          let stillBatched = false
          for (const otherRun of registry.runs.values()) {
            if (otherRun.materialId === oldMeta.materialId) {
              stillBatched = true
              break
            }
          }
          if (!stillBatched) {
            registry.materialRefs.delete(oldMeta.materialId)
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
        continue entityLoop
      }
    }
  }
}

function syncAllBuffers(
  world: World,
  entity: Entity,
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  _effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>
): void {
  const c = world.read(entity, SpriteColor)
  if (c) {
    mesh.writeColor(slot, c.r, c.g, c.b, c.a)
  }

  const uv = world.read(entity, SpriteUV)
  if (uv) {
    mesh.writeUV(slot, uv.x, uv.y, uv.w, uv.h)
  }

  const f = world.read(entity, SpriteFlip)
  if (f) {
    mesh.writeFlip(slot, f.x, f.y)
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
        for (let i = 0; i < value.length; i++) {
          const off = slotInfo.offset + i
          mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, value[i]!)
        }
      }
    }
  }
}
