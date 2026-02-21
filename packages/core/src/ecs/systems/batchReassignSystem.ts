import { createChanged } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  IsBatched,
  SpriteColor,
  SpriteUV,
  SpriteFlip,
  SpriteLayer,
  SpriteMaterialRef,
  ThreeRef,
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

const Changed = createChanged()

/**
 * Reassign sprites to different batches when their sort key changes.
 *
 * Triggered by Changed(SpriteLayer) or Changed(SpriteMaterialRef) on
 * batched sprites. If the new (layer, materialId) differs from the
 * current batch's run, removes from old batch and inserts into correct one.
 *
 * zIndex changes within the same (layer, material) do NOT require
 * batch movement — Z-offset handles depth sorting.
 */
export function batchReassignSystem(
  world: World,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  const layerChanged = world.query(Changed(SpriteLayer), IsBatched, ThreeRef)
  const matChanged = world.query(Changed(SpriteMaterialRef), IsBatched, ThreeRef)

  // Deduplicate entities that appear in both queries
  const toReassign = new Set([...layerChanged, ...matChanged])
  if (toReassign.size === 0) return

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  for (const entity of toReassign) {
    const ref = entity.get(ThreeRef)
    if (!ref?.object) continue
    const sprite = ref.object as Sprite2D

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
    entity.set(BatchSlot, { batchIdx: newMeta?.batchIdx ?? -1, slot: newSlot }, false)

    // Full sync to new batch
    syncAllBuffers(entity, newSlot, newBatchMesh.mesh, sprite, effectTraits)
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
    mesh.getColorAttribute().needsUpdate = true
  }

  const uv = entity.get(SpriteUV)
  if (uv) {
    mesh.writeUV(slot, uv.x, uv.y, uv.w, uv.h)
    mesh.getUVAttribute().needsUpdate = true
  }

  const f = entity.get(SpriteFlip)
  if (f) {
    mesh.writeFlip(slot, f.x, f.y)
    mesh.getFlipAttribute().needsUpdate = true
  }

  sprite.updateMatrix()
  mesh.writeMatrix(slot, sprite.matrix)
  mesh.instanceMatrix.needsUpdate = true

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
  const tier = material._effectTier

  mesh.writeEffectSlot(slot, 0, 0, sprite._effectFlags)

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

  const numVec4s = tier / 4
  for (let i = 0; i < numVec4s; i++) {
    const attr = mesh.getCustomAttribute(`effectBuf${i}`)
    if (attr) attr.needsUpdate = true
  }
}
