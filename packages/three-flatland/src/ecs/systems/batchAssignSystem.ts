import { createAdded } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  IsRenderable,
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
import { getOrCreateRun, findOrCreateBatch } from '../batchUtils'
import { ENTITY_ID_MASK } from '../snapshot'

const Added = createAdded()

/**
 * Assign newly renderable sprites to the correct batch.
 *
 * Triggered by Added(IsRenderable). Computes the run key from
 * (layer, materialId), finds or creates a batch in that run,
 * allocates a slot, and sets the InBatch relation with slot data.
 * Also performs a one-time full buffer sync from trait state.
 *
 * Reads effectTraits from BatchRegistry. Takes only (world).
 */
export function batchAssignSystem(world: World): boolean {
  const added = world.query(Added(IsRenderable))
  if (added.length === 0) return false

  const registryEntities = world.query(BatchRegistry)
  if (registryEntities.length === 0) return false
  const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
  if (!registry) return false

  const effectTraits = registry.effectTraits

  // Track meshes that received new sprites — set needsUpdate once after the loop
  const dirtyMeshes = new Set<SpriteBatch>()

  for (const entity of added) {
    const sprite = registry.spriteArr[(entity as unknown as number) & ENTITY_ID_MASK]
    if (!sprite) continue

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
    const mesh = batchMesh.mesh

    // Allocate a slot
    const slot = mesh.allocateSlot()
    if (slot < 0) continue

    // Set InBatch relation with slot data — cache the relation pair
    const relation = InBatch(batchEntity)
    entity.add(relation)
    entity.set(relation, { slot }, false)

    // Set BatchSlot SoA cache for O(1) hot-path reads.
    // BatchSlot is pre-added at spawn time — always use set, no archetype transition.
    const meta = batchEntity.get(BatchMeta)
    const batchIdx = meta?.batchIdx ?? -1
    entity.set(BatchSlot, { batchIdx, slot }, false)

    // One-time full buffer sync from current trait state (no needsUpdate — deferred)
    syncSlotBuffers(entity, slot, mesh, sprite, effectTraits)
    dirtyMeshes.add(mesh)
  }

  // Flush syncCount once per mesh, not per entity.
  // needsUpdate and dirty ranges are tracked by SpriteBatch write methods;
  // flushDirtyRanges() is called once at end of frame by SpriteGroup.
  for (const mesh of dirtyMeshes) {
    mesh.syncCount()
  }

  return true
}

/**
 * Sync all sprite data to batch buffers for a single slot.
 * Called once on batch assignment to initialize the slot.
 * Does NOT set needsUpdate — caller batches that across all entities.
 */
function syncSlotBuffers(
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
  }

  // UV
  const uv = entity.get(SpriteUV)
  if (uv) {
    mesh.writeUV(slot, uv.x, uv.y, uv.w, uv.h)
  }

  // Flip
  const f = entity.get(SpriteFlip)
  if (f) {
    mesh.writeFlip(slot, f.x, f.y)
  }

  // Transform — use Sprite2D's updateMatrix for full 3D support
  sprite.updateMatrix()
  mesh.writeMatrix(slot, sprite.matrix)

  // Effect data
  syncEffectBuffers(slot, mesh, sprite, effectTraits)
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

}
