import { createAdded } from 'koota'
import type { World, Entity, Trait } from 'koota'
import {
  IsRenderable,
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
import { getOrCreateRun, findOrCreateBatch } from '../batchUtils'
import { ENTITY_ID_MASK } from '../snapshot'

/**
 * Create a batch-assign system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function takes a world
 * + effect-trait map and assigns newly renderable sprites to batches.
 *
 * Triggered by Added(IsRenderable). Computes the run key from
 * (sortLayer, materialId, layers.mask), finds or creates a batch in that run, allocates
 * a slot, and sets the InBatch relation with slot data. Also performs
 * a one-time full buffer sync from trait state.
 *
 * Closes over its own `Added` subscription + `dirtyMeshes` scratch Set
 * so multiple SpriteGroups don't share Koota change-tracking state and
 * the Set is cleared-and-reused instead of allocated per frame.
 */
export function createBatchAssignSystem(): (
  world: World,
  effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
) => boolean {
  const Added = createAdded()
  const dirtyMeshes = new Set<SpriteBatch>()

  return function batchAssignSystem(
    world: World,
    effectTraits: ReadonlyMap<Trait, typeof MaterialEffect>
  ): boolean {
    const added = world.query(Added(IsRenderable))
    if (added.length === 0) return false

    const registryEntities = world.query(BatchRegistry)
    if (registryEntities.length === 0) return false
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return false

    dirtyMeshes.clear()

    for (const entity of added) {
      const sprite = registry.spriteArr[(entity as unknown as number) & ENTITY_ID_MASK]
      if (!sprite) continue

      const layerData = entity.get(SortLayer)
      const matRef = entity.get(SpriteMaterialRef)
      if (!layerData || !matRef) continue
      const layersMask = entity.get(CameraLayersMask)?.mask ?? sprite.layers.mask

      // Track material for schema version detection
      const material = sprite.material
      if (!registry.materialRefs.has(matRef.materialId)) {
        registry.materialRefs.set(matRef.materialId, {
          material,
          version: material._effectSchemaVersion,
        })
      }

      // Find or create the run for this (sortLayer, materialId, layers.mask)
      const { run } = getOrCreateRun(
        registry,
        layerData.value,
        matRef.materialId,
        layersMask,
        material
      )

      // Find or create a batch with free slots
      const batchEntity = findOrCreateBatch(world, registry, run)
      const batchMesh = batchEntity.get(BatchMesh)
      if (!batchMesh?.mesh) continue
      const mesh = batchMesh.mesh

      // Allocate a slot
      const slot = mesh.allocateSlot()
      if (slot < 0) continue

      // Add the InBatch membership relation. The slot lives in BatchSlot
      // (set below) — the single source of truth kept in sync by the sort.
      entity.add(InBatch(batchEntity))

      // Set BatchSlot SoA cache for O(1) hot-path reads.
      // BatchSlot is pre-added at spawn time — always use set, no archetype transition.
      const meta = batchEntity.get(BatchMeta)
      const batchIdx = meta?.batchIdx ?? -1
      entity.set(BatchSlot, { batchIdx, slot }, false)

      // Cache batch references on the sprite for O(1) direct-write
      // dispatch from setters. While the sprite is in a batch, this
      // triplet is the invariant: _batchMesh === mesh, _batchSlot === slot,
      // _batchIdx === batchIdx. Setters check `_batchMesh !== null` as the
      // "am I batched?" test.
      sprite._batchMesh = mesh
      sprite._batchSlot = slot
      sprite._batchIdx = batchIdx

      // Auto-orchestrated sprites live in the user's scene tree — once a
      // batch draws them, their own Mesh must stop rendering. Explicit
      // SpriteGroup sprites were never tree children; leave them alone.
      if (sprite._autoRegistry) {
        sprite._autoBatched = true
        sprite.visible = false
      }

      // Signal that this batch needs sorting on the next pass — the new
      // sprite was just inserted at an arbitrary slot (allocateSlot's
      // free-list / nextIndex), not its sorted position. For gated
      // materials this is a no-op since batchSortSystem skips them
      // anyway; the marker is harmless.
      mesh.markSortDirty()

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

  // Lighting system flags (lit/receiveShadows/castsShadow → instanceSystem.z)
  // and per-instance shadow radius (instanceExtras.x). Written for every
  // sprite, not just effect-bearing ones — a flat sprite can still be lit.
  mesh.writeSystemFlags(slot, sprite._systemFlags)
  mesh.writeShadowRadius(
    slot,
    sprite.shadowRadius ?? Math.max(Math.abs(sprite.scale.x), Math.abs(sprite.scale.y))
  )

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

  // Effect-enable bitmask → instanceSystem.w (the slot the shader reads;
  // see EffectMaterial + SpriteBatch.writeEnableBits). On first assign
  // this is the ONLY writer of .w — _writeEffectStateToBatch only fires
  // on add/removeEffect and reassign is a later event, so without this a
  // sprite that had effects added before enrollment would land with
  // .w = 0 and render its effects disabled. (Was a stale write to the
  // now-pure-data effectBuf0.x.)
  mesh.writeEnableBits(slot, sprite._effectFlags)

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
