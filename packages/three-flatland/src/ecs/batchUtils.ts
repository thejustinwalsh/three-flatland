import type { Entity, World, Trait } from 'koota'
import type { Group, Object3D, Texture } from 'three'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Sprite2D } from '../sprites/Sprite2D'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteBatch } from '../pipeline/SpriteBatch'
import {
  BatchGeometryStrategy,
  BatchMesh,
  BatchMeta,
  BatchSlot,
  InBatch,
  IsAlphaBlendedBatch,
  IsAlphaTestedBatch,
  IsBatched,
  IsLitBatch,
  IsRenderable,
  IsUnlitBatch,
  SpriteMaterialRef,
  type BatchRun,
} from './traits'
import type { SystemSchedule } from './SystemSchedule'
import { ENTITY_ID_MASK } from './snapshot'

/** Shape of the BatchRegistry trait data, used for parameter typing. */
export interface RegistryData {
  runs: Map<string, BatchRun>
  sortedRunKeys: string[]
  batchPool: Entity[]
  activeBatches: Entity[]
  renderOrderDirty: boolean
  maxBatchSize: number
  /** Tiered batch sizes for the auto-orchestrate path; null = fixed maxBatchSize. */
  tierLadder: readonly number[] | null
  materialRefs: Map<number, { material: Sprite2DMaterial; version: number }>
  /** Per-texture default materials, scoped to this world. */
  defaultMaterials: WeakMap<Texture, Sprite2DMaterial>
  batchSlots: (SpriteBatch | null)[]
  batchSlotFreeList: number[]
  /** Flat array of Sprite2D refs indexed by entity SoA index (eid).
   *  Pure array indexing — same O(1) pattern as other SoA stores. */
  spriteArr: (Sprite2D | null)[]
  /** Cached effect traits across all materials. */
  effectTraits: Map<Trait, typeof MaterialEffect>
  /** Entities whose destruction is deferred to the top of the next frame. */
  pendingDestroy: Entity[]
  /** The SpriteGroup (parent Group) for scene graph sync. */
  parentGroup: Group | null
  /** Bound Group.prototype.add bypassing SpriteGroup override. */
  parentAdd: ((...objects: Object3D[]) => Group) | null
  /** Bound Group.prototype.remove bypassing SpriteGroup override. */
  parentRemove: ((...objects: Object3D[]) => Group) | null
  /** Whether auto-invalidate transforms is enabled. */
  autoInvalidateTransforms: boolean
  /** The SystemSchedule for this world. */
  schedule: SystemSchedule | null
  /** Monotonic counter of completed `schedule.run` invocations — see trait doc. */
  scheduleRuns: number
  /** Whether any occluder changed since the last shadow generation. */
  occludersDirty: boolean
}

/**
 * A batch run key: fixed-width hex `sortLayer(4) | materialId(4) | mask(8)`.
 *
 * Lexicographic string order equals sortLayer-major numeric order, so the
 * sorted run-key array doubles as the render-order source without any
 * numeric packing. A string key sidesteps Float64 precision: the three
 * components total 48+ bits, past the 53-bit integer-safe range.
 */
export type RunKey = string

const hexPad = (value: number, width: number) => value.toString(16).padStart(width, '0')

/**
 * Compute a run key from sortLayer, materialId, and camera layers mask.
 * Runs are the primary batch grouping dimension: sprites in the same run
 * share (materialId, sortLayer, layers.mask) and can be in the same batch.
 * Each component is a real GPU constraint — shader pipeline, render-list
 * position, camera visibility.
 */
export function computeRunKey(sortLayer: number, materialId: number, layersMask: number): RunKey {
  return hexPad(sortLayer & 0xffff, 4) + hexPad(materialId & 0xffff, 4) + hexPad(layersMask >>> 0, 8)
}

/**
 * Binary search for insertion point in a sorted array.
 * Returns the index where `key` should be inserted to maintain sort order.
 */
export function binarySearch<T extends number | string>(arr: T[], key: T): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const v = arr[mid]!
    if (v < key) lo = mid + 1
    else if (v > key) hi = mid - 1
    else return mid
  }
  return ~lo
}

/**
 * Insert a value into a sorted array at the correct position.
 * No-op if the value already exists.
 */
export function sortedInsert<T extends number | string>(arr: T[], key: T): void {
  const idx = binarySearch(arr, key)
  if (idx >= 0) return
  arr.splice(~idx, 0, key)
}

/**
 * Remove a value from a sorted array.
 * No-op if the value doesn't exist.
 */
export function sortedRemove<T extends number | string>(arr: T[], key: T): void {
  const idx = binarySearch(arr, key)
  if (idx >= 0) arr.splice(idx, 1)
}

/**
 * Allocate a batchIdx in the registry's batchSlots array.
 * Reuses freed indices when available.
 */
export function allocateBatchIdx(registry: RegistryData, mesh: SpriteBatch): number {
  let idx: number
  if (registry.batchSlotFreeList.length > 0) {
    idx = registry.batchSlotFreeList.pop()!
    registry.batchSlots[idx] = mesh
  } else {
    idx = registry.batchSlots.length
    registry.batchSlots.push(mesh)
  }
  return idx
}

/**
 * Free a batchIdx, returning it to the free list.
 */
export function freeBatchIdx(registry: RegistryData, idx: number): void {
  if (idx < 0 || idx >= registry.batchSlots.length) return
  registry.batchSlots[idx] = null
  registry.batchSlotFreeList.push(idx)
}

/**
 * Get or create a batch run for a given (sortLayer, materialId, layersMask) combo.
 */
export function getOrCreateRun(
  registry: RegistryData,
  sortLayer: number,
  materialId: number,
  layersMask: number,
  material: Sprite2DMaterial
): { run: BatchRun; created: boolean } {
  const key = computeRunKey(sortLayer, materialId, layersMask)
  let run = registry.runs.get(key)
  if (run) return { run, created: false }

  run = { materialId, sortLayer, layersMask, material, batches: [] }
  registry.runs.set(key, run)
  sortedInsert(registry.sortedRunKeys, key)
  return { run, created: true }
}

/**
 * Auto-batch tier ladder. Each SpriteBatch is born at a fixed tier and
 * stays that size for life; when it fills, the next batch in the run is
 * created one tier up. Memory scales with actual usage: 2 sprites cost
 * ~11 KB (tier 0), not the 2.75 MB a max-size batch would.
 */
export const BATCH_TIER_LADDER: readonly number[] = [64, 256, 1024, 4096, 16384]

/**
 * Resolve the slot count for the next batch in a run.
 *
 * `registry.tierLadder` non-null → tiered sizing indexed by how many
 * batches the run already has (clamped to the top tier). Null → the
 * registry's fixed `maxBatchSize` (explicit SpriteGroup opt-in).
 */
export function resolveBatchSize(registry: RegistryData, run: BatchRun): number {
  const ladder = registry.tierLadder
  if (!ladder || ladder.length === 0) return registry.maxBatchSize
  return ladder[Math.min(run.batches.length, ladder.length - 1)]!
}

/**
 * Find a batch in a run that has free slots, or create a new one.
 * Tries the batch pool first for reuse.
 */
export function findOrCreateBatch(
  world: World,
  registry: RegistryData,
  run: BatchRun
): Entity {
  // Check existing batches in this run for free slots
  for (const batchEntity of run.batches) {
    const batchMesh = batchEntity.get(BatchMesh)
    if (batchMesh?.mesh && !batchMesh.mesh.isFull) return batchEntity
  }

  // No free slots — try to get a batch entity from the pool
  let batchEntity = registry.batchPool.pop()
  let mesh: SpriteBatch | null = null

  // Tier ladder: each successive batch in a run is born at the next
  // tier size (64 → 256 → 1024 → 4096 → 16384). Explicit SpriteGroup
  // users override via `maxBatchSize`, which pins every batch to that
  // size (tierLadder null).
  const batchSize = resolveBatchSize(registry, run)

  if (batchEntity) {
    const existing = batchEntity.get(BatchMesh)
    if (
      existing?.mesh &&
      existing.mesh.spriteMaterial.batchId === run.materialId &&
      existing.mesh.maxSize === batchSize
    ) {
      mesh = existing.mesh
      mesh.resetSlots()
    } else {
      if (existing?.mesh) existing.mesh.dispose()
      mesh = new SpriteBatch(run.material, batchSize)
    }
  } else {
    batchEntity = world.spawn()
    mesh = new SpriteBatch(run.material, batchSize)
  }

  // Allocate a batchIdx for O(1) mesh lookup from BatchSlot
  const batchIdx = allocateBatchIdx(registry, mesh)

  // Set/update traits on batch entity (no Changed observers — skip change detection)
  if (batchEntity.has(BatchMesh)) {
    batchEntity.set(BatchMesh, { mesh }, false)
  } else {
    batchEntity.add(BatchMesh({ mesh }))
  }

  if (batchEntity.has(BatchMeta)) {
    batchEntity.set(BatchMeta, {
      materialId: run.materialId,
      sortLayer: run.sortLayer,
      layersMask: run.layersMask,
      batchIdx,
    }, false)
  } else {
    batchEntity.add(
      BatchMeta({
        materialId: run.materialId,
        sortLayer: run.sortLayer,
        layersMask: run.layersMask,
        renderOrder: 0,
        batchIdx,
      })
    )
  }

  // The batch's camera mask mirrors its run — sprites with a custom
  // `layers` mask route to a batch the same cameras see.
  mesh.layers.mask = run.layersMask

  // Classification traits — declared once at construction (the facts
  // are per-batch-lifetime: pooled entities are reclassified here since
  // their material may differ from the previous tenancy).
  classifyBatch(batchEntity, run.material)

  // Set descriptive name for devtools scene tree
  mesh.name = `SpriteBatch[sortLayer=${run.sortLayer}, mat=${run.materialId}, mask=${run.layersMask}]`

  run.batches.push(batchEntity)
  registry.activeBatches.push(batchEntity)
  registry.renderOrderDirty = true

  return batchEntity
}

/**
 * Recycle a batch entity to the pool if it's empty.
 * Removes it from its run and from activeBatches.
 */
export function recycleBatchIfEmpty(
  registry: RegistryData,
  batchEntity: Entity,
  run: BatchRun
): void {
  const batchMesh = batchEntity.get(BatchMesh)
  if (!batchMesh?.mesh || !batchMesh.mesh.isEmpty) return

  // Remove from run
  const idx = run.batches.indexOf(batchEntity)
  if (idx >= 0) run.batches.splice(idx, 1)

  // If run is now empty, remove it
  if (run.batches.length === 0) {
    const key = computeRunKey(run.sortLayer, run.materialId, run.layersMask)
    registry.runs.delete(key)
    sortedRemove(registry.sortedRunKeys, key)
  }

  // Free the batchIdx
  const meta = batchEntity.get(BatchMeta)
  if (meta && meta.batchIdx >= 0) {
    freeBatchIdx(registry, meta.batchIdx)
    batchEntity.set(BatchMeta, { batchIdx: -1 }, false)
  }

  // Remove from active batches
  const activeIdx = registry.activeBatches.indexOf(batchEntity)
  if (activeIdx >= 0) registry.activeBatches.splice(activeIdx, 1)

  // Add to pool
  registry.batchPool.push(batchEntity)
  registry.renderOrderDirty = true
}

/**
 * Rebuild the sorted order of active batches based on run key ordering.
 * Assigns renderOrder to each batch entity.
 */
export function rebuildBatchOrder(registry: RegistryData): void {
  if (!registry.renderOrderDirty) return

  registry.activeBatches.length = 0
  let order = 0
  for (const key of registry.sortedRunKeys) {
    const run = registry.runs.get(key)
    if (!run) continue
    for (const batchEntity of run.batches) {
      batchEntity.set(BatchMeta, { renderOrder: order++ }, false)
      registry.activeBatches.push(batchEntity)
    }
  }

  registry.renderOrderDirty = false
}

// ============================================
// Material lifecycle (world-scoped defaults + dispose handling)
// ============================================

/**
 * Marker for materials whose dispose event is already hooked into a
 * world's teardown path. Lives on the material instance — a material
 * tracked by two worlds gets one hook per world via the listener list,
 * guarded per world in `ensureMaterialDisposeHook`.
 * @internal
 */
const HOOKED_WORLDS = Symbol.for('three-flatland.material-dispose-hooks')

interface DisposeHookedMaterial extends Sprite2DMaterial {
  [HOOKED_WORLDS]?: WeakSet<World>
}

/**
 * Get (or create) the world-scoped default material for a texture.
 *
 * Replaces the static shared-material cache: two worlds (two Flatlands,
 * two SpriteGroups, two auto-registries) resolving the same texture get
 * two material instances, so effect registration and dispose stay
 * isolated. Three's pipeline cache dedupes the compiled shader by
 * source, so the only cost is a JS instance.
 */
export function getWorldDefaultMaterial(
  world: World,
  registry: RegistryData,
  texture: Texture
): Sprite2DMaterial {
  let material = registry.defaultMaterials.get(texture)
  if (!material) {
    material = new Sprite2DMaterial({ map: texture, transparent: true })
    registry.defaultMaterials.set(texture, material)
    ensureMaterialDisposeHook(world, registry, material)
  }
  return material
}

/**
 * Attach the dispose teardown hook for a material used by this world's
 * batches (idempotent per world). Fires `handleMaterialDispose` so
 * batches referencing freed GPU resources are torn down and
 * default-material sprites resurrect.
 */
export function ensureMaterialDisposeHook(
  world: World,
  registry: RegistryData,
  material: Sprite2DMaterial
): void {
  const hooked = (material as DisposeHookedMaterial)[HOOKED_WORLDS] ?? new WeakSet<World>()
  ;(material as DisposeHookedMaterial)[HOOKED_WORLDS] = hooked
  if (hooked.has(world)) return
  hooked.add(world)
  material.addEventListener('dispose', () => {
    handleMaterialDispose(world, registry, material)
  })
}

/**
 * Evict every batched entity using `materialId` from its batch: free
 * the slot, drop the InBatch relation, recycle empty batches, and
 * re-trigger IsRenderable so `batchAssignSystem` re-batches survivors
 * with whatever material they hold by then.
 *
 * Shared by the tier-upgrade rebuild (material schema changed) and the
 * dispose teardown (material's GPU resources are gone).
 */
export function evictBatchesForMaterial(
  world: World,
  registry: RegistryData,
  materialId: number
): void {
  const batched = world.query(IsBatched, SpriteMaterialRef, BatchSlot)
  for (const entity of batched) {
    const matRef = entity.get(SpriteMaterialRef)
    if (!matRef || matRef.materialId !== materialId) continue

    const batchEntity = entity.targetFor(InBatch)
    if (batchEntity) {
      // BatchSlot.slot is the authoritative live slot (kept in sync by
      // batchSortSystem); InBatch's own slot can be a stale pre-swap index.
      const slot = entity.get(BatchSlot)?.slot ?? -1
      const batchMesh = batchEntity.get(BatchMesh)
      if (slot >= 0 && batchMesh?.mesh) {
        batchMesh.mesh.freeSlot(slot)
        batchMesh.mesh.syncCount()
      }

      entity.remove(InBatch(batchEntity))

      if (batchMesh?.mesh?.isEmpty) {
        const meta = batchEntity.get(BatchMeta)
        if (meta) {
          const key = computeRunKey(meta.sortLayer, meta.materialId, meta.layersMask)
          const run = registry.runs.get(key)
          if (run) {
            recycleBatchIfEmpty(registry, batchEntity, run)
          }
        }
      }
    }

    // Clear the sprite's cached direct-write refs — its slot is gone.
    const sprite = registry.spriteArr[(entity as unknown as number) & ENTITY_ID_MASK]
    if (sprite) {
      sprite._batchMesh = null
      sprite._batchSlot = -1
      sprite._batchIdx = -1
    }

    entity.set(BatchSlot, { batchIdx: -1, slot: -1 }, false)

    // Re-trigger assignment for entities that still render
    entity.remove(IsRenderable)
    entity.add(IsRenderable)
  }

  registry.renderOrderDirty = true
}

/**
 * Dispose teardown: batches using the material are torn down; sprites
 * holding a world-supplied default resurrect with a fresh default
 * (auto-rebatching on the next system pass); sprites with user-supplied
 * custom materials fall back to three's standard "disposed material in
 * use" semantics — restored to visible, unenrolled, and warned about.
 */
export function handleMaterialDispose(
  world: World,
  registry: RegistryData,
  material: Sprite2DMaterial
): void {
  // Drop the default-cache entry first so re-resolution mints a fresh
  // material instead of handing the disposed one back out.
  const texture = material.getTexture()
  if (texture && registry.defaultMaterials.get(texture) === material) {
    registry.defaultMaterials.delete(texture)
  }

  // Tear down batches while SpriteMaterialRef still points at the old
  // material (eviction filters on it).
  evictBatchesForMaterial(world, registry, material.batchId)

  // Then re-point or demote the affected sprites.
  let orphaned = 0
  for (const sprite of registry.spriteArr) {
    if (!sprite || sprite.material !== material) continue
    if (sprite._materialWasRegistryDefault && sprite.texture) {
      sprite._resolveDefaultMaterial(getWorldDefaultMaterial(world, registry, sprite.texture))
    } else {
      orphaned++
      sprite._autoBatched = false
      sprite.visible = true
      sprite._unenrollFromWorld()
    }
  }

  registry.materialRefs.delete(material.batchId)

  if (orphaned > 0) {
    console.warn(
      `three-flatland: disposed material ${material.name || material.batchId} had ${orphaned} ` +
        'sprite(s) attached with a user-supplied material — they now render with three.js\'s ' +
        'standard "disposed material in use" semantics.'
    )
  }
}

/**
 * Tag a batch entity with its classification traits, replacing any
 * stale tags from a previous pool tenancy. Systems still branch on the
 * material directly — see the trait docs for the query-vs-branch rule.
 */
export function classifyBatch(batchEntity: Entity, material: Sprite2DMaterial): void {
  const alphaTested = material.alphaTest > 0
  const alphaBlended = material.transparent && material.alphaTest === 0
  const lit = material.colorTransform !== null

  setTag(batchEntity, IsAlphaTestedBatch, alphaTested)
  setTag(batchEntity, IsAlphaBlendedBatch, alphaBlended)
  setTag(batchEntity, IsLitBatch, lit)
  setTag(batchEntity, IsUnlitBatch, !lit)

  if (!batchEntity.has(BatchGeometryStrategy)) {
    batchEntity.add(BatchGeometryStrategy({ kind: 'synth-quad' }))
  } else {
    batchEntity.set(BatchGeometryStrategy, { kind: 'synth-quad' }, false)
  }
}

function setTag(entity: Entity, tag: Trait, present: boolean): void {
  const has = entity.has(tag)
  if (present && !has) entity.add(tag)
  else if (!present && has) entity.remove(tag)
}
