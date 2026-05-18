import { createChanged } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  IsBatched,
  SpriteColor,
  SpriteUV,
  SpriteFlip,
  SpriteLayer,
  SpriteMaterialRef,
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

import {
  computeRunKey,
  getOrCreateRun,
  findOrCreateBatch,
  recycleBatchIfEmpty,
} from '../batchUtils'
import { ENTITY_ID_MASK } from '../snapshot'

/**
 * Create a batch-reassign system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function takes a world
 * + effect-trait map and moves sprites between batches when their sort
 * key (layer or material) changes.
 *
 * Triggered by Changed(SpriteLayer) or Changed(SpriteMaterialRef) on
 * batched sprites. If the new (layer, materialId) differs from the
 * current batch's run, removes from old batch and inserts into correct one.
 *
 * zIndex changes within the same (layer, material) do NOT require
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

  return function batchReassignSystem(
    world: World,
    effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
  ): void {
    const layerChanged = world.query(Changed(SpriteLayer), IsBatched)
    const matChanged = world.query(Changed(SpriteMaterialRef), IsBatched)

    // Dedup entities that appear in both queries — reuse the closure
    // Set, clear-and-fill instead of allocating a new one + array spreads.
    toReassign.clear()
    for (const e of layerChanged) toReassign.add(e)
    for (const e of matChanged) toReassign.add(e)
    if (toReassign.size === 0) return

    const registryEntities = world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    for (const entity of toReassign) {
      const sprite = registry.spriteArr[(entity as unknown as number) & ENTITY_ID_MASK]
      if (!sprite) continue

      const newLayer = entity.get(SpriteLayer)
      const newMatRef = entity.get(SpriteMaterialRef)
      if (!newLayer || !newMatRef) continue

      // Check if the batch entity still exists
      const oldBatchEntity = entity.targetFor(InBatch)
      if (!oldBatchEntity) continue

      const oldMeta = oldBatchEntity.get(BatchMeta)
      if (!oldMeta) continue

      // Compare run keys — only reassign if (layer, materialId) actually changed
      const oldRunKey = computeRunKey(oldMeta.layer, oldMeta.materialId)
      const newRunKey = computeRunKey(newLayer.layer, newMatRef.materialId)

      if (oldRunKey === newRunKey) continue // Same run — no batch movement needed

      // --- Remove from old batch ---
      const oldRelation = entity.get(InBatch(oldBatchEntity)) as { slot: number } | undefined
      const oldBatchMesh = oldBatchEntity.get(BatchMesh)

      if (oldRelation && oldBatchMesh?.mesh) {
        oldBatchMesh.mesh.freeSlot(oldRelation.slot)
        oldBatchMesh.mesh.syncCount()
      }

      entity.remove(InBatch(oldBatchEntity))

      // Recycle old batch if empty
      if (oldBatchMesh?.mesh?.isEmpty) {
        const oldRun = registry.runs.get(oldRunKey)
        if (oldRun) {
          recycleBatchIfEmpty(registry, oldBatchEntity, oldRun)
        }
      }

      // --- Insert into new batch ---
      const material = sprite.material
      registry.materialRefs.set(newMatRef.materialId, {
        material,
        version: material._effectSchemaVersion,
      })

      const { run } = getOrCreateRun(registry, newLayer.layer, newMatRef.materialId, material)
      const newBatchEntity = findOrCreateBatch(world, registry, run)
      const newBatchMesh = newBatchEntity.get(BatchMesh)
      if (!newBatchMesh?.mesh) continue

      const newSlot = newBatchMesh.mesh.allocateSlot()
      if (newSlot < 0) continue

      entity.add(InBatch(newBatchEntity))
      entity.set(InBatch(newBatchEntity), { slot: newSlot }, false)

      // Update BatchSlot SoA cache (no Changed observers)
      const newMeta = newBatchEntity.get(BatchMeta)
      const newBatchIdx = newMeta?.batchIdx ?? -1
      entity.set(BatchSlot, { batchIdx: newBatchIdx, slot: newSlot }, false)

      // Update the sprite's cached batch references — the invariant is
      // that these match BatchSlot for the lifetime of the assignment.
      sprite._batchMesh = newBatchMesh.mesh
      sprite._batchSlot = newSlot
      sprite._batchIdx = newBatchIdx

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
