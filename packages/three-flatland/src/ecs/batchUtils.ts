import { select, type AnyTrait, type Entity, type NumericStore, type World } from './runtime'
import type { Group, Object3D, Texture } from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import {
  Sprite2DMaterial,
  sprite2DMaterialVariantKey,
  type Sprite2DMaterialOptions,
} from '../materials/Sprite2DMaterial'
import { SpriteBatch } from '../pipeline/SpriteBatch'
import { getAtlasMesh } from '../loaders/atlasMeshRegistry'
import { retireBatchPicking, unproxyPickFromBatch } from '../react/batchPicking'
import {
  BatchGeometryStrategy,
  BatchMesh,
  BatchMeta,
  BatchSlot,
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
import { entitySlot, liveStoredEntity } from './snapshot'
import { getSpriteBatchOwnership } from '../internal/sprite-batch-ownership'
import { nextCapacity, reserveIndexedArray } from '../internal/capacity'

/** Shape of the BatchRegistry trait data, used for parameter typing. */
export interface RegistryData {
  world: World | null
  runs: Map<string, BatchRun>
  sortedRunKeys: string[]
  batchPool: Entity[]
  activeBatches: Entity[]
  renderOrderDirty: boolean
  maxBatchSize: number
  /** Tiered batch sizes for the auto-orchestrate path; null = fixed maxBatchSize. */
  tierLadder: readonly number[] | null
  materialRefs: Map<number, { material: Sprite2DMaterial; version: number }>
  /** Material ids queued for one batched liveness sweep after structural work. */
  materialReleaseCandidates: Set<number>
  /** Per-texture default materials, scoped to this world. */
  defaultMaterials: WeakMap<Texture, Sprite2DMaterial>
  /**
   * World-scoped effect-variant materials: texture → variant key →
   * material. The variant key is the non-texture fragment of
   * `Sprite2DMaterial`'s shared-cache key (transparent/lit/colorTransform/
   * alphaTest/premultipliedAlpha/effectsKey) — see
   * `sprite2DMaterialVariantKey`. Counterpart to `defaultMaterials` for
   * sprites carrying constants-effects (provider effects like
   * NormalMapProvider): two worlds resolving the same texture+effectsKey
   * combination get distinct instances instead of sharing one.
   */
  effectVariants: WeakMap<Texture, Map<string, Sprite2DMaterial>>
  batchSlots: (SpriteBatch | null)[]
  batchSlotFreeList: number[]
  /** Flat array of Sprite2D refs indexed by entity SoA index (eid).
   *  Pure array indexing — same O(1) pattern as other SoA stores. */
  spriteArr: (Sprite2D | null)[]
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
  /** Explicit invalidation latch for transforms and hierarchy visibility. */
  transformsDirty: boolean
  /** The SystemSchedule for this world. */
  schedule: SystemSchedule | null
  /** Monotonic counter of completed `schedule.run` invocations — see trait doc. */
  scheduleRuns: number
  /** Whether any occluder changed since the last shadow generation. */
  occludersDirty: boolean
}

const BatchedMaterialSlots = select(IsBatched, SpriteMaterialRef, BatchSlot)

interface BatchNumericStores {
  readonly meta: NumericStore<typeof BatchMeta.defaults>
  readonly slot: NumericStore<typeof BatchSlot.defaults>
  readonly materialRef: NumericStore<typeof SpriteMaterialRef.defaults>
}

const numericStoresByWorld = new WeakMap<World, BatchNumericStores>()

function numericStoresFor(world: World): BatchNumericStores {
  let stores = numericStoresByWorld.get(world)
  if (!stores) {
    stores = {
      meta: world.store(BatchMeta),
      slot: world.store(BatchSlot),
      materialRef: world.store(SpriteMaterialRef),
    }
    numericStoresByWorld.set(world, stores)
  }
  return stores
}

/**
 * A batch run key: fixed-width hex `sortLayer(8) | materialId(8) | mask(8)`.
 *
 * Lexicographic string order equals sortLayer-major numeric order, so the
 * sorted run-key array doubles as the render-order source without any
 * numeric packing. A string key sidesteps Float64 precision: the three
 * components total 96 bits, far past the 53-bit integer-safe range.
 */
export type RunKey = string

const hexPad = (value: number, width: number) => value.toString(16).padStart(width, '0')

/**
 * Compute a run key from sortLayer, materialId, and camera layers mask.
 * Runs are the primary batch grouping dimension: sprites in the same run
 * share (materialId, sortLayer, layers.mask) and can be in the same batch.
 * Each component is a real GPU constraint — shader pipeline, render-list
 * position, camera visibility.
 *
 * Every component gets a full 32 bits — no truncation collisions for
 * monotonic material ids, and negative sortLayers keep their ordering
 * via an offset encoding (int32 + 2^31, so -1 sorts below 0).
 */
export function computeRunKey(sortLayer: number, materialId: number, layersMask: number): RunKey {
  const orderedLayer = ((sortLayer | 0) + 0x80000000) >>> 0
  return hexPad(orderedLayer, 8) + hexPad(materialId >>> 0, 8) + hexPad(layersMask >>> 0, 8)
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
  if (registry.batchSlotFreeList.length === 0) {
    const previous = registry.batchSlots.length
    const next = nextCapacity(previous, previous + 1)
    reserveIndexedArray(registry.batchSlots, next, null)
    for (let index = next - 1; index >= previous; index--) registry.batchSlotFreeList.push(index)
  }
  const idx = registry.batchSlotFreeList.pop()!
  registry.batchSlots[idx] = mesh
  return idx
}

/** Restore every reserved batch index to the reusable free list. */
export function resetBatchSlots(registry: RegistryData): void {
  registry.batchSlots.fill(null)
  registry.batchSlotFreeList.length = 0
  for (let index = registry.batchSlots.length - 1; index >= 0; index--) registry.batchSlotFreeList.push(index)
}

/**
 * Free a batchIdx, returning it to the free list.
 */
export function freeBatchIdx(registry: RegistryData, idx: number): void {
  if (idx < 0 || idx >= registry.batchSlots.length) return
  if (registry.batchSlots[idx] === null) return
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

/** Remove a run that was published but never acquired a batch. */
export function removeRunIfEmpty(registry: RegistryData, run: BatchRun): void {
  if (run.batches.length > 0) return
  const key = computeRunKey(run.sortLayer, run.materialId, run.layersMask)
  registry.runs.delete(key)
  sortedRemove(registry.sortedRunKeys, key)
}

/**
 * Auto-batch tier ladder. Each SpriteBatch is born at a fixed tier and
 * stays that size for life; when it fills, the next batch in the run is
 * created one tier up (or, for a bulk prime — see `resolveBatchSize` —
 * straight at the tier sized for the incoming load). A small scene pays
 * for at most one ~180 KB batch (1024 slots × ~176 B/slot); a large
 * scene's runs converge on 16384-slot batches, the same steady state a
 * fixed-size SpriteGroup would reach.
 */
export const BATCH_TIER_LADDER: readonly number[] = [1024, 4096, 16384]

/**
 * Resolve the slot count for the next batch in a run.
 *
 * `registry.tierLadder` non-null → tiered sizing. By default the tier is
 * chosen by how many batches the run already has (clamped to the top
 * tier, so growth only ratchets up). When the caller passes `pendingCount`
 * — the number of sprites it's about to place in this run in one shot —
 * the tier is instead sized to the smallest tier that can hold that many,
 * clamped to the top, but never smaller than the batches-length tier
 * (growth still ratchets). Null ladder → the registry's fixed
 * `maxBatchSize` (explicit SpriteGroup opt-in).
 */
export function resolveBatchSize(registry: RegistryData, run: BatchRun, pendingCount = 0): number {
  const ladder = registry.tierLadder
  if (!ladder || ladder.length === 0) return registry.maxBatchSize
  const byGrowth = Math.min(run.batches.length, ladder.length - 1)
  if (pendingCount <= 0) return ladder[byGrowth]!

  let byBulk = ladder.length - 1
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i]! >= pendingCount) {
      byBulk = i
      break
    }
  }
  return ladder[Math.max(byGrowth, byBulk)]!
}

/**
 * Find a batch in a run that has free slots, or create a new one.
 * Tries the batch pool first for reuse.
 *
 * `pendingCount`, when passed, is the number of sprites the caller is
 * about to place in this run during the current pass — see
 * `resolveBatchSize`.
 */
export function findOrCreateBatch(world: World, registry: RegistryData, run: BatchRun, pendingCount = 0): Entity {
  const { meta } = numericStoresFor(world)
  // Check existing batches in this run for free slots
  for (const batchEntity of run.batches) {
    const batchMesh = world.read(batchEntity, BatchMesh)
    if (batchMesh?.mesh && !batchMesh.mesh.isFull) return batchEntity
  }

  // Peek at the pool. Publication removes it only after all potentially
  // throwing construction and trait work succeeds, so a failed attempt
  // cannot silently consume the reusable entity.
  let batchEntity = registry.batchPool.at(-1)
  const pooledEntity = batchEntity
  let mesh: SpriteBatch | null = null
  let previousMesh: SpriteBatch | null = null
  let createdMesh = false
  let createdEntity = false
  let batchIdx = -1
  let published = false

  // Tier ladder: each successive batch in a run is born at the next
  // tier size (1024 → 4096 → 16384), or straight at the tier sized for
  // a bulk prime. Explicit SpriteGroup users override via `maxBatchSize`,
  // which pins every batch to that size (tierLadder null).
  const batchSize = resolveBatchSize(registry, run, pendingCount)

  try {
    if (batchEntity !== undefined) {
      const existing = world.read(batchEntity, BatchMesh)
      previousMesh = existing?.mesh ?? null
      const wantedKind = run.material._tightMesh ? 'tight-mesh' : 'synth-quad'
      // A merge/degrade on the atlas bumps its registry version without
      // necessarily flipping `wantedKind` (tight-mesh stays tight-mesh) —
      // matching on `geometryKind` alone would hand back a pooled batch
      // whose envelope was baked from a now-stale hull. Compare versions
      // too so that case falls through to a fresh construction.
      const wantedEnvelopeVersion =
        wantedKind === 'tight-mesh' ? (getAtlasMesh(run.material.getTexture())?.version ?? -1) : -1
      if (
        previousMesh &&
        previousMesh.spriteMaterial.batchId === run.materialId &&
        previousMesh.maxSize === batchSize &&
        previousMesh.geometryKind === wantedKind &&
        previousMesh.envelopeVersion === wantedEnvelopeVersion
      ) {
        mesh = previousMesh
        getSpriteBatchOwnership(mesh).resetSlots()
      } else {
        // Construct the replacement before disposing the pooled mesh. If
        // construction throws, the pool entry remains intact and reusable.
        mesh = new SpriteBatch(run.material, batchSize)
        createdMesh = true
      }
    } else {
      mesh = new SpriteBatch(run.material, batchSize)
      createdMesh = true
      batchEntity = world.spawn()
      createdEntity = true
    }

    // Allocate a batchIdx for O(1) mesh lookup from BatchSlot.
    batchIdx = allocateBatchIdx(registry, mesh)

    // Set/update traits on batch entity (no Changed observers — skip change detection).
    if (world.has(batchEntity, BatchMesh)) {
      world.patch(batchEntity, BatchMesh, { mesh }, false)
    } else {
      world.add(batchEntity, BatchMesh({ mesh }))
    }

    if (world.has(batchEntity, BatchMeta)) {
      const index = entitySlot(batchEntity)
      meta.materialId[index] = run.materialId
      meta.sortLayer[index] = run.sortLayer
      meta.layersMask[index] = run.layersMask
      meta.batchIdx[index] = batchIdx
    } else {
      world.add(
        batchEntity,
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
    classifyBatch(world, batchEntity, run.material)

    // Set descriptive name for devtools scene tree.
    mesh.name = `SpriteBatch[sortLayer=${run.sortLayer}, mat=${run.materialId}, mask=${run.layersMask}]`

    if (pooledEntity !== undefined) {
      const poppedEntity = registry.batchPool.pop()
      if (poppedEntity !== pooledEntity) throw new Error('three-flatland: Batch pool changed during publication')
    }
    run.batches.push(batchEntity)
    registry.activeBatches.push(batchEntity)
    registry.renderOrderDirty = true
    published = true

    // Disposal dispatches user listeners and is terminal: once the replacement
    // is published, never roll back to an old mesh whose cleanup has begun.
    if (previousMesh && previousMesh !== mesh) previousMesh.dispose()
    if (
      !world.isAlive(batchEntity) ||
      !run.batches.includes(batchEntity) ||
      !registry.activeBatches.includes(batchEntity) ||
      world.read(batchEntity, BatchMesh)?.mesh !== mesh
    ) {
      throw new Error('three-flatland: Batch publication changed during replacement disposal')
    }

    return batchEntity
  } catch (error) {
    if (published) throw error
    if (batchIdx >= 0) freeBatchIdx(registry, batchIdx)

    if (createdEntity && batchEntity !== undefined && world.isAlive(batchEntity)) {
      world.destroy(batchEntity)
    } else if (pooledEntity !== undefined && batchEntity !== undefined && world.isAlive(batchEntity)) {
      // A pooled entity remains unpublished. Restore its prior mesh/meta so a
      // later attempt cannot observe the failed tenancy.
      if (previousMesh && world.has(batchEntity, BatchMesh)) {
        world.patch(batchEntity, BatchMesh, { mesh: previousMesh }, false)
      }
      if (world.has(batchEntity, BatchMeta)) {
        meta.batchIdx[entitySlot(batchEntity)] = -1
      }
    }
    if (createdMesh && mesh) {
      try {
        mesh.dispose()
      } catch {
        // Cleanup must preserve the original transaction failure.
      }
    }
    throw error
  }
}

/**
 * Recycle a batch entity to the pool if it's empty.
 * Removes it from its run and from activeBatches.
 */
export function recycleBatchIfEmpty(world: World, registry: RegistryData, batchEntity: Entity, run: BatchRun): void {
  if (registry.batchPool.includes(batchEntity)) return
  const batchMesh = world.read(batchEntity, BatchMesh)
  if (!batchMesh?.mesh || !batchMesh.mesh.isEmpty) return

  // Defensive: a pooled mesh must never linger in an R3F interaction
  // list (the last member's unproxy normally already retired it).
  retireBatchPicking(batchMesh.mesh)

  // Remove from run
  const idx = run.batches.indexOf(batchEntity)
  if (idx >= 0) run.batches.splice(idx, 1)

  // If run is now empty, remove it
  if (run.batches.length === 0) {
    const key = computeRunKey(run.sortLayer, run.materialId, run.layersMask)
    registry.runs.delete(key)
    sortedRemove(registry.sortedRunKeys, key)
    releaseMaterialIfUnused(world, registry, run.materialId)
  }

  // Free the batchIdx
  const meta = numericStoresFor(world).meta
  const batchIndex = entitySlot(batchEntity)
  const batchIdx = meta.batchIdx[batchIndex]
  if (batchIdx !== undefined && batchIdx >= 0) {
    freeBatchIdx(registry, batchIdx)
    meta.batchIdx[batchIndex] = -1
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
export function rebuildBatchOrder(world: World, registry: RegistryData): boolean {
  if (!registry.renderOrderDirty) return false

  const renderOrders = numericStoresFor(world).meta.renderOrder
  registry.activeBatches.length = 0
  let order = 0
  for (const key of registry.sortedRunKeys) {
    const run = registry.runs.get(key)
    if (!run) continue
    for (const batchEntity of run.batches) {
      renderOrders[entitySlot(batchEntity)] = order++
      registry.activeBatches.push(batchEntity)
    }
  }

  registry.renderOrderDirty = false
  return true
}

// ============================================
// Material lifecycle (world-scoped defaults + dispose handling)
// ============================================

interface MaterialDisposeHook {
  readonly material: WeakRef<Sprite2DMaterial>
  readonly listener: () => void
  readonly unregisterToken: object
}

/**
 * Live pre-dispose hooks installed by a world. Both directions are weak:
 * the world table holds materials through WeakRef, while each material's
 * listener holds only WeakRefs back to the world and registry. WeakMap-
 * cached default/variant materials therefore remain collectible with their
 * texture keys instead of being rooted by lifecycle bookkeeping.
 */
const worldDisposeHooks = new WeakMap<World, Map<number, MaterialDisposeHook>>()
const materialHookFinalizer = new FinalizationRegistry<{
  readonly world: WeakRef<World>
  readonly materialId: number
}>(({ world, materialId }) => {
  const liveWorld = world.deref()
  if (!liveWorld) return
  const hooks = worldDisposeHooks.get(liveWorld)
  hooks?.delete(materialId)
  if (hooks?.size === 0) worldDisposeHooks.delete(liveWorld)
})

/**
 * Detach every material dispose hook a world installed (world/group
 * disposal path).
 */
export function removeMaterialDisposeHooks(world: World): void {
  const hooks = worldDisposeHooks.get(world)
  if (!hooks) return
  for (const hook of hooks.values()) {
    const material = hook.material.deref()
    if (material) material._removePreDisposeHook(hook.listener)
    materialHookFinalizer.unregister(hook.unregisterToken)
  }
  worldDisposeHooks.delete(world)
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
export function getWorldDefaultMaterial(world: World, registry: RegistryData, texture: Texture): Sprite2DMaterial {
  let material = registry.defaultMaterials.get(texture)
  if (!material) {
    material = new Sprite2DMaterial({ map: texture, transparent: true })
    registry.defaultMaterials.set(texture, material)
    ensureMaterialDisposeHook(world, registry, material)
  }
  return material
}

/**
 * Get (or create) the world-scoped effect-variant material for a
 * texture + configuration. Counterpart to `getWorldDefaultMaterial` for
 * sprites carrying constants-effects (provider effects like
 * `NormalMapProvider`): two worlds resolving the same
 * (texture, effectsKey, …) combination get distinct material instances,
 * so effect registration and dispose stay isolated the same way
 * defaults do.
 */
export function getWorldEffectVariant(
  world: World,
  registry: RegistryData,
  texture: Texture,
  options: Sprite2DMaterialOptions
): Sprite2DMaterial {
  const variantKey = sprite2DMaterialVariantKey(options)
  let variants = registry.effectVariants.get(texture)
  if (!variants) {
    variants = new Map()
    registry.effectVariants.set(texture, variants)
  }
  let material = variants.get(variantKey)
  if (!material) {
    material = new Sprite2DMaterial({ ...options, map: texture })
    variants.set(variantKey, material)
    ensureMaterialDisposeHook(world, registry, material)
  }
  return material
}

/**
 * Attach the pre-dispose teardown hook for a material used by this world's
 * batches (idempotent per world). Fires `handleMaterialDispose` so
 * batches referencing freed GPU resources are torn down and
 * default-material sprites resurrect.
 */
export function ensureMaterialDisposeHook(world: World, registry: RegistryData, material: Sprite2DMaterial): void {
  let hooks = worldDisposeHooks.get(world)
  if (!hooks) {
    hooks = new Map()
    worldDisposeHooks.set(world, hooks)
  }
  const existing = hooks.get(material.batchId)
  if (existing?.material.deref() === material) return
  if (existing) {
    const previous = existing.material.deref()
    if (previous) previous._removePreDisposeHook(existing.listener)
    materialHookFinalizer.unregister(existing.unregisterToken)
  }

  const worldRef = new WeakRef(world)
  const registryRef = new WeakRef(registry)
  const materialRef = new WeakRef(material)
  const listener = (): void => {
    const liveWorld = worldRef.deref()
    const liveRegistry = registryRef.deref()
    const liveMaterial = materialRef.deref()
    if (liveWorld && liveRegistry && liveMaterial) handleMaterialDispose(liveWorld, liveRegistry, liveMaterial)
  }
  const unregisterToken = {}
  material._addPreDisposeHook(listener)
  hooks.set(material.batchId, { material: new WeakRef(material), listener, unregisterToken })
  materialHookFinalizer.register(material, { world: worldRef, materialId: material.batchId }, unregisterToken)
}

function removeMaterialDisposeHook(world: World, material: Sprite2DMaterial): void {
  const hooks = worldDisposeHooks.get(world)
  const hook = hooks?.get(material.batchId)
  if (!hooks || !hook || hook.material.deref() !== material) return
  material._removePreDisposeHook(hook.listener)
  materialHookFinalizer.unregister(hook.unregisterToken)
  hooks.delete(material.batchId)
  if (hooks.size === 0) worldDisposeHooks.delete(world)
}

function isWorldCachedMaterial(registry: RegistryData, material: Sprite2DMaterial): boolean {
  const texture = material.getTexture()
  if (!texture) return false
  if (registry.defaultMaterials.get(texture) === material) return true
  const variants = registry.effectVariants.get(texture)
  if (!variants) return false
  for (const candidate of variants.values()) {
    if (candidate === material) return true
  }
  return false
}

/** Queue a material for the next batched liveness sweep. */
export function releaseMaterialIfUnused(
  _world: World,
  registry: RegistryData,
  materialOrId: Sprite2DMaterial | number
): void {
  const materialId = typeof materialOrId === 'number' ? materialOrId : materialOrId.batchId
  registry.materialReleaseCandidates.add(materialId)
}

/**
 * Release queued material records in one O(runs + sprites + candidates)
 * pass. Structural churn can retire thousands of one-sprite runs in one
 * frame; scanning the whole registry once per retired run would become
 * quadratic.
 */
export function flushUnusedMaterials(world: World, registry: RegistryData): void {
  const candidates = registry.materialReleaseCandidates
  if (candidates.size === 0) return

  for (const run of registry.runs.values()) {
    candidates.delete(run.materialId)
  }
  for (const sprite of registry.spriteArr) {
    if (sprite) candidates.delete(sprite.material.batchId)
  }

  for (const materialId of candidates) {
    const material = registry.materialRefs.get(materialId)?.material
    registry.materialRefs.delete(materialId)
    if (material && !isWorldCachedMaterial(registry, material)) removeMaterialDisposeHook(world, material)
  }
  candidates.clear()
}

/**
 * Shared eviction core: for every batched entity whose `SpriteMaterialRef`
 * satisfies `shouldEvict`, free its live slot, clear its direct ownership,
 * recycle the batch if it goes empty, clear the sprite's cached
 * direct-write refs, and re-trigger IsRenderable so `batchAssignSystem`
 * re-batches the survivor with whatever material/batch it resolves to
 * by then.
 *
 * Extracted so `evictBatchesForMaterial` stays a thin materialId filter
 * over the mechanics — the eviction machinery itself (slot free, recycle,
 * re-trigger) is the reusable part.
 */
function evictMatchingBatchedEntities(
  world: World,
  registry: RegistryData,
  shouldEvict: (materialId: number) => boolean
): void {
  const stores = numericStoresFor(world)
  const batched = world.view(BatchedMaterialSlots)
  // Removing IsBatched below mutates this persistent selector in place using
  // swap-remove. Walk backward so the swapped member is never skipped.
  for (let position = batched.length - 1; position >= 0; position--) {
    const entity = batched[position]!
    const entityIndex = entitySlot(entity)
    const materialId = stores.materialRef.materialId[entityIndex]
    if (materialId === undefined || !shouldEvict(materialId)) continue

    const sprite = registry.spriteArr[entityIndex]

    const batchEntity = liveStoredEntity(world, stores.slot.batchEntity[entityIndex] ?? 0)
    if (batchEntity) {
      // BatchSlot.slot is the authoritative live slot (kept in sync by
      // batchSortSystem), so it remains correct after physical-row swaps.
      const slot = stores.slot.slot[entityIndex] ?? -1
      const batchMesh = world.read(batchEntity, BatchMesh)
      if (slot >= 0 && batchMesh?.mesh) {
        getSpriteBatchOwnership(batchMesh.mesh).releaseSlot(slot, entity)
        batchMesh.mesh.syncCount()
      }

      // Drop the picking-broadphase entry with the slot — re-assignment
      // (IsRenderable re-trigger below) re-indexes into the new batch.
      // The R3F pick proxy is handed back too; re-assignment re-proxies.
      if (sprite && batchMesh?.mesh) {
        batchMesh.mesh.grid.remove(sprite)
        unproxyPickFromBatch(sprite, batchMesh.mesh)
      }

      if (batchMesh?.mesh?.isEmpty) {
        const batchIndex = entitySlot(batchEntity)
        const sortLayer = stores.meta.sortLayer[batchIndex]
        const batchMaterialId = stores.meta.materialId[batchIndex]
        const layersMask = stores.meta.layersMask[batchIndex]
        if (sortLayer !== undefined && batchMaterialId !== undefined && layersMask !== undefined) {
          const key = computeRunKey(sortLayer, batchMaterialId, layersMask)
          const run = registry.runs.get(key)
          if (run) {
            recycleBatchIfEmpty(world, registry, batchEntity, run)
          }
        }
      }
    }

    // Clear the sprite's cached direct-write refs — its slot is gone.
    if (sprite) {
      sprite._batchMesh = null
      sprite._batchSlot = -1
      sprite._batchIdx = -1
    }

    // The tag describes committed physical ownership, not render intent.
    // Clear it before re-triggering IsRenderable so assignment can add it
    // exactly once after the replacement row has committed.
    world.remove(entity, IsBatched)
    stores.slot.batchEntity[entityIndex] = 0
    stores.slot.batchIdx[entityIndex] = -1
    stores.slot.slot[entityIndex] = -1

    // Re-trigger assignment for entities that still render
    world.remove(entity, IsRenderable)
    world.add(entity, IsRenderable)
  }

  registry.renderOrderDirty = true
}

/**
 * Evict every batched entity using `materialId` from its batch.
 *
 * Shared by the tier-upgrade rebuild (material schema changed) and the
 * dispose teardown (material's GPU resources are gone).
 */
export function evictBatchesForMaterial(world: World, registry: RegistryData, materialId: number): void {
  evictMatchingBatchedEntities(world, registry, (candidateId) => candidateId === materialId)
}

/**
 * Dispose teardown: batches using the material are torn down; sprites
 * holding a world-supplied default resurrect with a fresh default
 * (auto-rebatching on the next system pass); sprites with user-supplied
 * custom materials fall back to three's standard "disposed material in
 * use" semantics — restored to visible, unenrolled, and warned about.
 */
export function handleMaterialDispose(world: World, registry: RegistryData, material: Sprite2DMaterial): void {
  try {
    // Drop the default-cache entry first so re-resolution mints a fresh
    // material instead of handing the disposed one back out.
    const texture = material.getTexture()
    if (texture && registry.defaultMaterials.get(texture) === material) {
      registry.defaultMaterials.delete(texture)
    }

    // Same for the effect-variant store — find this material's variant
    // slot by identity (small per-texture Map, no reverse index needed)
    // and drop it so re-resolution mints a fresh variant.
    if (texture) {
      const variants = registry.effectVariants.get(texture)
      if (variants) {
        for (const [variantKey, variantMaterial] of variants) {
          if (variantMaterial === material) {
            variants.delete(variantKey)
            break
          }
        }
        if (variants.size === 0) registry.effectVariants.delete(texture)
      }
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
      } else if (sprite._materialWasRegistryVariant && sprite.texture) {
        sprite._resolveEffectVariantMaterial(
          getWorldEffectVariant(world, registry, sprite.texture, sprite._currentVariantOptions())
        )
      } else {
        orphaned++
        sprite._batchEnrollmentBlockedMaterial = material
        if (sprite._hierarchyOwner) sprite._hierarchyOwner._releaseHierarchySprite?.(sprite)
        else {
          const owner = registry.parentGroup as
            | (Object3D & { _releaseDirectEnrollment?(source: Sprite2D): void })
            | null
          if (owner?._releaseDirectEnrollment) owner._releaseDirectEnrollment(sprite)
          else {
            sprite._setBatchSuppressed(false)
            sprite._unenrollFromWorld()
          }
        }
      }
    }

    registry.materialRefs.delete(material.batchId)

    if (orphaned > 0) {
      console.warn(
        `three-flatland: disposed material ${material.name || material.batchId} had ${orphaned} ` +
          "sprite(s) attached with a user-supplied material — they now render with three.js's " +
          'standard "disposed material in use" semantics.'
      )
    }
  } finally {
    // Detach this world's internal hook even when teardown throws, otherwise the
    // hook map keeps the disposed material and world alive until group
    // disposal and a repeated dispose invokes stale teardown again.
    removeMaterialDisposeHook(world, material)
  }
}

/**
 * Tag a batch entity with its classification traits, replacing any
 * stale tags from a previous pool tenancy. Systems still branch on the
 * material directly — see the trait docs for the query-vs-branch rule.
 */
export function classifyBatch(world: World, batchEntity: Entity, material: Sprite2DMaterial): void {
  const alphaTested = material.alphaTest > 0
  const alphaBlended = material.transparent && material.alphaTest === 0
  const lit = material.colorTransform !== null

  setTag(world, batchEntity, IsAlphaTestedBatch, alphaTested)
  setTag(world, batchEntity, IsAlphaBlendedBatch, alphaBlended)
  setTag(world, batchEntity, IsLitBatch, lit)
  setTag(world, batchEntity, IsUnlitBatch, !lit)

  const kind = material._tightMesh ? 'tight-mesh' : 'synth-quad'
  if (!world.has(batchEntity, BatchGeometryStrategy)) {
    world.add(batchEntity, BatchGeometryStrategy({ kind }))
  } else {
    world.patch(batchEntity, BatchGeometryStrategy, { kind }, false)
  }
}

function setTag(world: World, entity: Entity, tag: AnyTrait, present: boolean): void {
  const has = world.has(entity, tag)
  if (present && !has) world.add(entity, tag)
  else if (!present && has) world.remove(entity, tag)
}
