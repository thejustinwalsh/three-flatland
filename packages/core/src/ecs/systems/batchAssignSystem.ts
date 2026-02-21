import { createAdded } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  IsRenderable,
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
import { getOrCreateRun, findOrCreateBatch } from '../batchUtils'

const Added = createAdded()

/**
 * Assign newly renderable sprites to the correct batch.
 *
 * Triggered by Added(IsRenderable). Computes the run key from
 * (layer, materialId), finds or creates a batch in that run,
 * allocates a slot, and sets the InBatch relation with slot data.
 * Also performs a one-time full buffer sync from trait state.
 */
export function batchAssignSystem(
  world: World,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  const added = world.query(Added(IsRenderable), ThreeRef)
  if (added.length === 0) return

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return

  for (const entity of added) {
    const ref = entity.get(ThreeRef)
    if (!ref?.object) continue
    const sprite = ref.object as Sprite2D

    const layerData = entity.get(SpriteLayer)
    const matRef = entity.get(SpriteMaterialRef)
    if (!layerData || !matRef) continue

    // Track material for schema version detection
    const material = sprite.material
    if (!registry.materialRefs.has(matRef.materialId)) {
      registry.materialRefs.set(matRef.materialId, {
        material,
        version: material._effectSchemaVersion,
      })
    }

    // Find or create the run for this (layer, materialId)
    const { run } = getOrCreateRun(registry, layerData.layer, matRef.materialId, material)

    // Find or create a batch with free slots
    const batchEntity = findOrCreateBatch(world, registry, run)
    const batchMesh = batchEntity.get(BatchMesh)
    if (!batchMesh?.mesh) continue

    // Allocate a slot
    const slot = batchMesh.mesh.allocateSlot()
    if (slot < 0) continue

    // Set InBatch relation with slot data (no Changed observers — skip change detection)
    entity.add(InBatch(batchEntity))
    entity.set(InBatch(batchEntity), { slot }, false)

    // Set BatchSlot SoA cache for O(1) hot-path reads (no Changed observers)
    const meta = batchEntity.get(BatchMeta)
    const batchIdx = meta?.batchIdx ?? -1
    if (entity.has(BatchSlot)) {
      entity.set(BatchSlot, { batchIdx, slot }, false)
    } else {
      entity.add(BatchSlot({ batchIdx, slot }))
    }

    // Add IsBatched tag
    if (!entity.has(IsBatched)) {
      entity.add(IsBatched)
    }

    // One-time full buffer sync from current trait state
    syncAllBuffers(entity, slot, batchMesh.mesh, sprite, effectTraits)
  }
}

/**
 * Full sync of all sprite data to batch buffers.
 * Called once on batch assignment to initialize the slot.
 */
function syncAllBuffers(
  entity: Entity,
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  // Color
  const c = entity.get(SpriteColor)
  if (c) {
    mesh.writeColor(slot, c.r, c.g, c.b, c.a)
    mesh.getColorAttribute().needsUpdate = true
  }

  // UV
  const uv = entity.get(SpriteUV)
  if (uv) {
    mesh.writeUV(slot, uv.x, uv.y, uv.w, uv.h)
    mesh.getUVAttribute().needsUpdate = true
  }

  // Flip
  const f = entity.get(SpriteFlip)
  if (f) {
    mesh.writeFlip(slot, f.x, f.y)
    mesh.getFlipAttribute().needsUpdate = true
  }

  // Transform
  sprite.updateMatrix()
  mesh.writeMatrix(slot, sprite.matrix)
  mesh.instanceMatrix.needsUpdate = true

  // Effect data
  syncEffectBuffers(slot, mesh, sprite, effectTraits)

  // Sync instance count
  mesh.syncCount()
}

function syncEffectBuffers(
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  _effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
): void {
  const material = sprite.material
  const tier = material._effectTier
  if (tier === 0) return

  // Write flags to slot 0
  mesh.writeEffectSlot(slot, 0, 0, sprite._effectFlags)

  // Write effect field values
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

  // Zero out inactive effects
  for (const effectClass of material._effects) {
    const isActive = sprite._effects.some(
      (e) => (e.constructor as typeof MaterialEffect).effectName === effectClass.effectName
    )
    if (!isActive) {
      for (const field of effectClass._fields) {
        const slotKey = `${effectClass.effectName}_${field.name}`
        const slotInfo = material._effectSlots.get(slotKey)
        if (!slotInfo) continue
        for (let i = 0; i < field.size; i++) {
          const off = slotInfo.offset + i
          mesh.writeEffectSlot(slot, Math.floor(off / 4), off % 4, field.default[i]!)
        }
      }
    }
  }

  // Mark effect buffer attributes as dirty
  const numVec4s = tier / 4
  for (let i = 0; i < numVec4s; i++) {
    const attr = mesh.getCustomAttribute(`effectBuf${i}`)
    if (attr) attr.needsUpdate = true
  }
}
