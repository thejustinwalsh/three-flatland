import { createChanged } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  IsBatched,
  SpriteColor,
  SpriteUV,
  SpriteFlip,
  SortLayer,
  SpriteMaterialRef,
  CameraLayersMask,
  InBatch,
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
import { ENTITY_ID_MASK } from '../snapshot'

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
export function createBatchReassignSystem(): (
  world: World,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
) => void {
  const Changed = createChanged()
  const toReassign = new Set<Entity>()

  return function batchReassignSystem(world: World, effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>): void {
    const layerChanged = world.query(Changed(SortLayer), IsBatched)
    const matChanged = world.query(Changed(SpriteMaterialRef), IsBatched)
    const maskChanged = world.query(Changed(CameraLayersMask), IsBatched)

    // Dedup entities that appear in multiple queries — reuse the closure
    // Set, clear-and-fill instead of allocating a new one + array spreads.
    toReassign.clear()
    for (const e of layerChanged) toReassign.add(e)
    for (const e of matChanged) toReassign.add(e)
    for (const e of maskChanged) toReassign.add(e)
    if (toReassign.size === 0) return

    const registryEntities = world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    for (const entity of toReassign) {
      const sprite = registry.spriteArr[(entity as unknown as number) & ENTITY_ID_MASK]
      if (!sprite) continue

      const newLayer = entity.get(SortLayer)
      const newMatRef = entity.get(SpriteMaterialRef)
      if (!newLayer || !newMatRef) continue
      const newMask = entity.get(CameraLayersMask)?.mask ?? sprite.layers.mask

      // Check if the batch entity still exists
      const oldBatchEntity = entity.targetFor(InBatch)
      if (!oldBatchEntity) continue

      const oldMeta = oldBatchEntity.get(BatchMeta)
      if (!oldMeta) continue

      // Compare run keys — only reassign if the run actually changed
      const oldRunKey = computeRunKey(oldMeta.sortLayer, oldMeta.materialId, oldMeta.layersMask)
      const newRunKey = computeRunKey(newLayer.value, newMatRef.materialId, newMask)

      if (oldRunKey === newRunKey) continue // Same run — no batch movement needed

      // --- Remove from old batch ---
      // BatchSlot.slot is the authoritative live slot: batchSortSystem keeps it
      // in sync on swaps, whereas InBatch.slot is never rewritten and can be a
      // stale pre-swap index that points at another sprite's row.
      const oldSlot = entity.get(BatchSlot)?.slot ?? -1
      const oldBatchMesh = oldBatchEntity.get(BatchMesh)

      if (oldSlot >= 0 && oldBatchMesh?.mesh) {
        oldBatchMesh.mesh.freeSlot(oldSlot)
        oldBatchMesh.mesh.syncCount()
      }

      // Drop the picking-broadphase entry with the slot — the sprite is
      // re-indexed into its new batch's grid by syncAllBuffers below.
      // The R3F pick proxy moves with it (re-proxied after insertion).
      if (oldBatchMesh?.mesh) {
        oldBatchMesh.mesh.grid.remove(sprite)
        unproxyPickFromBatch(sprite, oldBatchMesh.mesh)
      }

      entity.remove(InBatch(oldBatchEntity))

      // Recycle old batch if empty
      if (oldBatchMesh?.mesh?.isEmpty) {
        const oldRun = registry.runs.get(oldRunKey)
        if (oldRun) {
          recycleBatchIfEmpty(registry, oldBatchEntity, oldRun)
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

      // --- Insert into new batch ---
      const material = sprite.material
      registry.materialRefs.set(newMatRef.materialId, {
        material,
        version: material._effectSchemaVersion,
      })

      const { run } = getOrCreateRun(registry, newLayer.value, newMatRef.materialId, newMask, material)
      const newBatchEntity = findOrCreateBatch(world, registry, run)
      const newBatchMesh = newBatchEntity.get(BatchMesh)
      if (!newBatchMesh?.mesh) continue

      const newSlot = newBatchMesh.mesh.allocateSlot()
      if (newSlot < 0) continue

      entity.add(InBatch(newBatchEntity))

      // Update BatchSlot SoA cache (no Changed observers) — the slot's
      // single source of truth, kept in sync by batchSortSystem.
      const newMeta = newBatchEntity.get(BatchMeta)
      const newBatchIdx = newMeta?.batchIdx ?? -1
      entity.set(BatchSlot, { batchIdx: newBatchIdx, slot: newSlot }, false)

      // Update the sprite's cached batch references — the invariant is
      // that these match BatchSlot for the lifetime of the assignment.
      sprite._batchMesh = newBatchMesh.mesh
      sprite._batchSlot = newSlot
      sprite._batchIdx = newBatchIdx

      // Re-route R3F picking through the new batch.
      proxyPickToBatch(sprite, newBatchMesh.mesh)

      // Full sync to new batch
      syncAllBuffers(entity, newSlot, newBatchMesh.mesh, sprite, effectTraits)
    }
  }
}

function syncAllBuffers(
  entity: Entity,
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  _effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  const c = entity.get(SpriteColor)
  if (c) {
    mesh.writeColor(slot, c.r, c.g, c.b, c.a)
  }

  const uv = entity.get(SpriteUV)
  if (uv) {
    mesh.writeUV(slot, uv.x, uv.y, uv.w, uv.h)
  }

  const f = entity.get(SpriteFlip)
  if (f) {
    mesh.writeFlip(slot, f.x, f.y)
  }

  // Transform — use Sprite2D's updateMatrix for full 3D support
  sprite.updateMatrix()
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
