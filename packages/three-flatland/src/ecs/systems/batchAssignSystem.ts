import { added, select, type AnyTrait, type Entity, type World } from '../runtime'
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
import { computeRunKey, getOrCreateRun, findOrCreateBatch, recycleBatchIfEmpty } from '../batchUtils'
import { proxyPickToBatch, unproxyPickFromBatch } from '../../react/batchPicking'
import { entitySlot } from '../snapshot'

const BatchRegistries = select(BatchRegistry)

/**
 * Create a batch-assign system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function takes a world
 * + effect-trait map and assigns newly renderable sprites to batches.
 *
 * Triggered by Added(IsRenderable). Computes the run key from
 * (sortLayer, materialId, layers.mask), finds or creates a batch in that run, allocates
 * a slot, and commits direct `BatchSlot` ownership. Also performs
 * a one-time full buffer sync from trait state.
 *
 * Closes over its own `Added` subscription + `dirtyMeshes`/`pendingCounts`
 * scratch collections so multiple SpriteGroups don't share event state,
 * and the collections are cleared-and-reused
 * instead of allocated per frame.
 */
export function createBatchAssignSystem(
  ownerWorld: World
): (world: World, effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>) => boolean {
  const AddedRenderable = added(IsRenderable)
  ownerWorld.activate(AddedRenderable)
  const dirtyMeshes = new Set<SpriteBatch>()
  const pendingCounts = new Map<string, number>()

  return function batchAssignSystem(world: World, effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>): boolean {
    const addedEntities = world.drain(AddedRenderable)
    if (addedEntities.length === 0) return false

    const registryEntities = world.view(BatchRegistries)
    if (registryEntities.length === 0) return false
    const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
    if (!registry) return false

    dirtyMeshes.clear()

    // Precompute how many pending sprites share each run in this pass —
    // a bulk prime (thousands of sprites added in one shot) sizes its
    // first batch for that load instead of the ladder's bottom tier. See
    // resolveBatchSize/findOrCreateBatch.
    pendingCounts.clear()
    for (const entity of addedEntities) {
      const sprite = registry.spriteArr[entitySlot(entity)]
      if (!sprite) continue
      const layerData = world.read(entity, SortLayer)
      const matRef = world.read(entity, SpriteMaterialRef)
      if (!layerData || !matRef) continue
      const layersMask = world.read(entity, CameraLayersMask)?.mask ?? sprite.layers.mask
      const key = computeRunKey(layerData.value, matRef.materialId, layersMask)
      pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1)
    }

    for (const entity of addedEntities) {
      const sprite = registry.spriteArr[entitySlot(entity)]
      if (!sprite) continue

      // updateMatrix() is virtual/user-owned. Run it before route capture so
      // reentrant layers/material changes are assigned to the current route.
      sprite.updateMatrix()
      const layerData = world.read(entity, SortLayer)
      const matRef = world.read(entity, SpriteMaterialRef)
      if (!layerData || !matRef) continue
      const layersMask = world.read(entity, CameraLayersMask)?.mask ?? sprite.layers.mask

      // Track material for schema version detection
      const material = sprite.material
      if (!registry.materialRefs.has(matRef.materialId)) {
        registry.materialRefs.set(matRef.materialId, {
          material,
          version: material._effectSchemaVersion,
        })
      }

      // Find or create the run for this (sortLayer, materialId, layers.mask)
      const runKey = computeRunKey(layerData.value, matRef.materialId, layersMask)
      const { run } = getOrCreateRun(registry, layerData.value, matRef.materialId, layersMask, material)

      // Find or create a batch with free slots
      const pendingCount = pendingCounts.get(runKey) ?? 0
      const batchEntity = findOrCreateBatch(world, registry, run, pendingCount)
      const batchMesh = world.read(batchEntity, BatchMesh)
      if (!batchMesh?.mesh) continue
      const mesh = batchMesh.mesh

      // Allocate a slot
      const slot = mesh.reserveSlot()
      if (slot < 0) continue

      const meta = world.read(batchEntity, BatchMeta)
      const batchIdx = meta?.batchIdx ?? -1
      let committed = false
      try {
        // Prepare every potentially-throwing projection before publishing
        // ownership. A failed preparation leaves no IsBatched or reverse row.
        syncSlotBuffers(world, entity, slot, mesh, sprite, effectTraits)
        proxyPickToBatch(sprite, mesh)
        world.patch(entity, BatchSlot, { batchEntity, batchIdx, slot }, false)
        mesh.commitSlot(slot, entity, sprite)
        committed = true

        sprite._batchMesh = mesh
        sprite._batchSlot = slot
        sprite._batchIdx = batchIdx
        if (sprite._autoRegistry || sprite._hierarchyManaged) sprite._setBatchSuppressed(true)
        world.add(entity, IsBatched)
        mesh.markSortDirty()
        dirtyMeshes.add(mesh)
      } catch (error) {
        mesh.grid.remove(sprite)
        unproxyPickFromBatch(sprite, mesh)
        if (committed) mesh.releaseSlot(slot, entity)
        else mesh.rollbackSlot(slot)
        if (world.has(entity, IsBatched)) world.remove(entity, IsBatched)
        if (world.isAlive(entity) && world.has(entity, BatchSlot)) {
          world.patch(entity, BatchSlot, { batchEntity: 0, batchIdx: -1, slot: -1 }, false)
        }
        sprite._batchMesh = null
        sprite._batchSlot = -1
        sprite._batchIdx = -1
        sprite._setBatchSuppressed(false)
        recycleBatchIfEmpty(world, registry, batchEntity, run)
        throw error
      }
    }

    // Flush syncCount once per mesh, not per entity.
    // needsUpdate and dirty ranges are tracked by SpriteBatch write methods;
    // flushDirtyRanges() is called once at end of frame by SpriteGroup.
    for (const mesh of dirtyMeshes) {
      mesh.syncCount()
    }

    if (dirtyMeshes.size > 0) registry.transformsDirty = true

    return true
  }
}

/**
 * Sync all sprite data to batch buffers for a single slot.
 * Called once on batch assignment to initialize the slot.
 * Does NOT set needsUpdate — caller batches that across all entities.
 */
function syncSlotBuffers(
  world: World,
  entity: Entity,
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>
): void {
  // Color
  const c = world.read(entity, SpriteColor)
  if (c) {
    mesh.writeColor(slot, c.r, c.g, c.b, c.a)
  }

  // UV
  const uv = world.read(entity, SpriteUV)
  if (uv) {
    mesh.writeUV(slot, uv.x, uv.y, uv.w, uv.h)
  }

  // Flip
  const f = world.read(entity, SpriteFlip)
  if (f) {
    mesh.writeFlip(slot, f.x, f.y)
  }

  // updateMatrix() runs before route capture in the caller.
  mesh.writeMatrix(slot, sprite.matrix)

  // Picking broadphase: index at the local translation; the group-folded
  // world position lands via transformSyncSystem's grid.update the same run.
  mesh.indexForPicking(sprite)

  // Lighting system flags (lit/receiveShadows/castsShadow → instanceSystem.z)
  // and per-instance shadow radius (instanceExtras.x). Written for every
  // sprite, not just effect-bearing ones — a flat sprite can still be lit.
  mesh.writeSystemFlags(slot, sprite._systemFlags)
  mesh.writeShadowRadius(slot, sprite.shadowRadius ?? Math.max(Math.abs(sprite.scale.x), Math.abs(sprite.scale.y)))

  // Effect data
  syncEffectBuffers(slot, mesh, sprite, effectTraits)
}

function syncEffectBuffers(
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  _effectTraits: ReadonlyMap<AnyTrait, typeof MaterialEffect>
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
