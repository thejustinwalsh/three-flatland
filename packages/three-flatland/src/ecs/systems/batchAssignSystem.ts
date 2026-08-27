import { added, select, type Entity, type NumericStore, type World } from '../runtime'
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
import { entitySlot } from '../snapshot'
import { getSpriteBatchOwnership } from '../../internal/sprite-batch-ownership'

const BatchRegistries = select(BatchRegistry)

/**
 * Create a batch-assign system bound to its own scratch state.
 *
 * Each SpriteGroup constructs one. The returned function takes a world
 * and assigns newly renderable sprites to batches.
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
export function createBatchAssignSystem(ownerWorld: World): (world: World) => boolean {
  const AddedRenderable = added(IsRenderable)
  ownerWorld.activate(AddedRenderable)
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
  const dirtyMeshes = new Set<SpriteBatch>()
  const pendingCounts = new Map<string, number>()

  return function batchAssignSystem(world: World): boolean {
    const addedEntities = world.drain(AddedRenderable)
    if (addedEntities.length === 0) return false

    const registryEntities = world.view(BatchRegistries)
    if (registryEntities.length === 0) return false
    const registry = world.read(registryEntities[0]!, BatchRegistry) as RegistryData | undefined
    if (!registry) return false

    dirtyMeshes.clear()

    let entityPosition = -1
    try {
      // Precompute how many pending sprites share each run in this pass —
      // a bulk prime (thousands of sprites added in one shot) sizes its
      // first batch for that load instead of the ladder's bottom tier. See
      // resolveBatchSize/findOrCreateBatch.
      pendingCounts.clear()
      for (const entity of addedEntities) {
        const index = entitySlot(entity)
        const sprite = registry.spriteArr[index]
        if (!sprite) continue
        const sortLayer = sortLayerStore.value[index]
        const materialId = materialRefStore.materialId[index]
        if (sortLayer === undefined || materialId === undefined) continue
        const layersMask = cameraLayersStore.mask[index] ?? sprite.layers.mask
        const key = computeRunKey(sortLayer, materialId, layersMask)
        pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1)
      }

      for (entityPosition = 0; entityPosition < addedEntities.length; entityPosition++) {
        const entity = addedEntities[entityPosition]!
        const index = entitySlot(entity)
        const sprite = registry.spriteArr[index]
        if (!sprite) continue

        // updateMatrix() is virtual/user-owned. Run it before route capture so
        // reentrant layers/material changes are assigned to the current route.
        try {
          sprite.updateMatrix()
        } catch (error) {
          if (world.isAlive(entity) && world.has(entity, IsRenderable)) {
            world.remove(entity, IsRenderable)
            world.add(entity, IsRenderable)
          }
          throw error
        }
        if (
          !world.isAlive(entity) ||
          !world.has(entity, IsRenderable) ||
          registry.spriteArr[entitySlot(entity)] !== sprite
        ) {
          continue
        }
        const sortLayer = sortLayerStore.value[index]
        const materialId = materialRefStore.materialId[index]
        if (sortLayer === undefined || materialId === undefined) continue
        const layersMask = cameraLayersStore.mask[index] ?? sprite.layers.mask

        // Track material for schema version detection
        const material = sprite.material
        if (!registry.materialRefs.has(materialId)) {
          registry.materialRefs.set(materialId, {
            material,
            version: material._effectSchemaVersion,
          })
        }

        // Find or create the run for this (sortLayer, materialId, layers.mask)
        const runKey = computeRunKey(sortLayer, materialId, layersMask)
        const { run, created: runCreated } = getOrCreateRun(registry, sortLayer, materialId, layersMask, material)

        // Find or create a batch with free slots
        const pendingCount = pendingCounts.get(runKey) ?? 0
        let batchEntity: Entity
        try {
          batchEntity = findOrCreateBatch(world, registry, run, pendingCount)
        } catch (error) {
          if (runCreated) removeRunIfEmpty(registry, run)
          // The Added event has already drained. Preserve retry semantics even
          // when construction or trait publication fails before slot reserve.
          if (world.isAlive(entity) && world.has(entity, IsRenderable)) {
            world.remove(entity, IsRenderable)
            world.add(entity, IsRenderable)
          }
          throw error
        }
        const batchMesh = world.read(batchEntity, BatchMesh)
        if (!batchMesh?.mesh) {
          if (runCreated) removeRunIfEmpty(registry, run)
          throw new Error('three-flatland: Published batch is missing its mesh')
        }
        const mesh = batchMesh.mesh
        const ownership = getSpriteBatchOwnership(mesh)

        // Allocate a slot
        const slot = ownership.reserveSlot()
        if (slot < 0) {
          recycleBatchIfEmpty(world, registry, batchEntity, run)
          if (world.isAlive(entity) && world.has(entity, IsRenderable)) {
            world.remove(entity, IsRenderable)
            world.add(entity, IsRenderable)
          }
          throw new Error('three-flatland: Batch selected for assignment has no reservable slot')
        }

        const batchIdx = batchMetaStore.batchIdx[entitySlot(batchEntity)] ?? -1
        let committed = false
        try {
          // Prepare every potentially-throwing projection before publishing
          // ownership. A failed preparation leaves no IsBatched or reverse row.
          syncSlotBuffers(index, slot, mesh, sprite, projectionStores)
          if (
            !world.isAlive(entity) ||
            !world.has(entity, IsRenderable) ||
            registry.spriteArr[entitySlot(entity)] !== sprite
          ) {
            mesh.grid.remove(sprite)
            ownership.rollbackSlot(slot)
            recycleBatchIfEmpty(world, registry, batchEntity, run)
            continue
          }
          proxyPickToBatch(sprite, mesh)
          batchSlotStore.batchEntity[index] = batchEntity
          batchSlotStore.batchIdx[index] = batchIdx
          batchSlotStore.slot[index] = slot
          ownership.commitSlot(slot, entity, sprite)
          committed = true

          sprite._batchMesh = mesh
          sprite._batchSlot = slot
          sprite._batchIdx = batchIdx
          if ((sprite as unknown as { _autoRegistry: object | null })._autoRegistry || sprite._hierarchyManaged) {
            sprite._setBatchSuppressed(true)
          }
          world.add(entity, IsBatched)
          mesh.markSortDirty()
          dirtyMeshes.add(mesh)
        } catch (error) {
          mesh.grid.remove(sprite)
          unproxyPickFromBatch(sprite, mesh)
          if (committed) ownership.releaseSlot(slot, entity)
          else ownership.rollbackSlot(slot)
          if (world.has(entity, IsBatched)) world.remove(entity, IsBatched)
          if (world.isAlive(entity) && world.has(entity, BatchSlot)) {
            batchSlotStore.batchEntity[index] = 0
            batchSlotStore.batchIdx[index] = -1
            batchSlotStore.slot[index] = -1
          }
          sprite._batchMesh = null
          sprite._batchSlot = -1
          sprite._batchIdx = -1
          sprite._setBatchSuppressed(false)
          recycleBatchIfEmpty(world, registry, batchEntity, run)
          // The Added(IsRenderable) event that selected this entity was drained
          // before preparation failed. Re-trigger it after exact rollback so a
          // transient projection error can retry on the next schedule instead
          // of stranding a live renderable forever.
          if (world.isAlive(entity) && world.has(entity, IsRenderable)) {
            world.remove(entity, IsRenderable)
            world.add(entity, IsRenderable)
          }
          throw error
        }
      }

      finalizeDirtyMeshes(registry, dirtyMeshes)
    } catch (error) {
      // A later entity can fail after an earlier entity committed. Publish the
      // committed prefix before propagating the first error; otherwise its
      // batch owns a live row while InstancedMesh.count remains stale.
      const cleanupErrors: unknown[] = []
      try {
        finalizeDirtyMeshes(registry, dirtyMeshes)
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
      try {
        // drain() consumes the whole borrowed queue up front. The failing
        // entity normally requeues itself in its local rollback path, but an
        // invariant can throw before that transaction begins. Include current;
        // HandleQueue dedupes its retry when the local path already emitted it.
        requeueAssignments(world, addedEntities, Math.max(0, entityPosition))
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
      if (cleanupErrors.length > 0) {
        const message = error instanceof Error ? error.message : 'three-flatland: Batch assignment failed'
        throw new AggregateError([error, ...cleanupErrors], message)
      }
      throw error
    }

    return dirtyMeshes.size > 0
  }
}

/**
 * Publish all rows committed during this drain exactly once per mesh.
 *
 * This runs on both the success and exceptional paths so a committed prefix
 * remains renderable even when projection of a later entity fails.
 */
function finalizeDirtyMeshes(registry: RegistryData, dirtyMeshes: ReadonlySet<SpriteBatch>): void {
  // needsUpdate and dirty ranges are tracked by SpriteBatch write methods;
  // flushDirtyRanges() is called once at end of frame by SpriteGroup.
  for (const mesh of dirtyMeshes) {
    mesh.syncCount()
  }

  if (dirtyMeshes.size > 0) registry.transformsDirty = true
}

function requeueAssignments(world: World, entities: readonly Entity[], start: number): void {
  for (let position = start; position < entities.length; position++) {
    const entity = entities[position]!
    if (!world.isAlive(entity) || !world.has(entity, IsRenderable) || world.has(entity, IsBatched)) continue
    world.remove(entity, IsRenderable)
    world.add(entity, IsRenderable)
  }
}

/**
 * Sync all sprite data to batch buffers for a single slot.
 * Called once on batch assignment to initialize the slot.
 * Does NOT set needsUpdate — caller batches that across all entities.
 */
interface SpriteProjectionStores {
  readonly color: NumericStore<typeof SpriteColor.defaults>
  readonly uv: NumericStore<typeof SpriteUV.defaults>
  readonly flip: NumericStore<typeof SpriteFlip.defaults>
}

function syncSlotBuffers(
  entityIndex: number,
  slot: number,
  mesh: SpriteBatch,
  sprite: Sprite2D,
  stores: SpriteProjectionStores
): void {
  // Color
  const r = stores.color.r[entityIndex]
  if (r !== undefined) {
    mesh.writeColor(slot, r, stores.color.g[entityIndex]!, stores.color.b[entityIndex]!, stores.color.a[entityIndex]!)
  }

  // UV
  const x = stores.uv.x[entityIndex]
  if (x !== undefined) {
    mesh.writeUV(slot, x, stores.uv.y[entityIndex]!, stores.uv.w[entityIndex]!, stores.uv.h[entityIndex]!)
  }

  // Flip
  const flipX = stores.flip.x[entityIndex]
  if (flipX !== undefined) {
    mesh.writeFlip(slot, flipX, stores.flip.y[entityIndex]!)
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
  syncEffectBuffers(slot, mesh, sprite)
}

function syncEffectBuffers(slot: number, mesh: SpriteBatch, sprite: Sprite2D): void {
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
        for (let i = 0; i < field.size; i++) {
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
