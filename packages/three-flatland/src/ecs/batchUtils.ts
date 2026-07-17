import type { Entity, World, Trait } from 'koota'
import type { Group, Object3D, Texture } from 'three'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Sprite2D } from '../sprites/Sprite2D'
import {
  Sprite2DMaterial,
  sprite2DMaterialVariantKey,
  type Sprite2DMaterialOptions,
} from '../materials/Sprite2DMaterial'
import { SpriteBatch } from '../pipeline/SpriteBatch'
import { getAtlasMesh } from '../loaders/atlasMeshRegistry'
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
  // Check existing batches in this run for free slots
  for (const batchEntity of run.batches) {
    const batchMesh = batchEntity.get(BatchMesh)
    if (batchMesh?.mesh && !batchMesh.mesh.isFull) return batchEntity
  }

  // No free slots — try to get a batch entity from the pool
  let batchEntity = registry.batchPool.pop()
  let mesh: SpriteBatch | null = null

  // Tier ladder: each successive batch in a run is born at the next
  // tier size (1024 → 4096 → 16384), or straight at the tier sized for
  // a bulk prime. Explicit SpriteGroup users override via `maxBatchSize`,
  // which pins every batch to that size (tierLadder null).
  const batchSize = resolveBatchSize(registry, run, pendingCount)

  if (batchEntity) {
    const existing = batchEntity.get(BatchMesh)
    const wantedKind = run.material._tightMesh ? 'tight-mesh' : 'synth-quad'
    // A merge/degrade on the atlas bumps its registry version without
    // necessarily flipping `wantedKind` (tight-mesh stays tight-mesh) —
    // matching on `geometryKind` alone would hand back a pooled batch
    // whose envelope was baked from a now-stale hull. Compare versions
    // too so that case falls through to a fresh construction.
    const wantedEnvelopeVersion =
      wantedKind === 'tight-mesh' ? (getAtlasMesh(run.material.getTexture())?.version ?? -1) : -1
    if (
      existing?.mesh &&
      existing.mesh.spriteMaterial.batchId === run.materialId &&
      existing.mesh.maxSize === batchSize &&
      existing.mesh.geometryKind === wantedKind &&
      existing.mesh.envelopeVersion === wantedEnvelopeVersion
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
    batchEntity.set(
      BatchMeta,
      {
        materialId: run.materialId,
        sortLayer: run.sortLayer,
        layersMask: run.layersMask,
        batchIdx,
      },
      false
    )
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
export function recycleBatchIfEmpty(registry: RegistryData, batchEntity: Entity, run: BatchRun): void {
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
 * Live dispose listeners installed by a world, so world teardown can
 * detach them — otherwise a long-lived user material reused across
 * mount/unmount cycles would retain every dead world through its
 * listener closures.
 */
const worldDisposeHooks = new WeakMap<World, Array<{ material: Sprite2DMaterial; listener: () => void }>>()

/**
 * Detach every material dispose hook a world installed (world/group
 * disposal path).
 */
export function removeMaterialDisposeHooks(world: World): void {
  const hooks = worldDisposeHooks.get(world)
  if (!hooks) return
  for (const { material, listener } of hooks) {
    material.removeEventListener('dispose', listener)
    const hooked = (material as DisposeHookedMaterial)[HOOKED_WORLDS]
    hooked?.delete(world)
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
 * Attach the dispose teardown hook for a material used by this world's
 * batches (idempotent per world). Fires `handleMaterialDispose` so
 * batches referencing freed GPU resources are torn down and
 * default-material sprites resurrect.
 */
export function ensureMaterialDisposeHook(world: World, registry: RegistryData, material: Sprite2DMaterial): void {
  const hooked = (material as DisposeHookedMaterial)[HOOKED_WORLDS] ?? new WeakSet<World>()
  ;(material as DisposeHookedMaterial)[HOOKED_WORLDS] = hooked
  if (hooked.has(world)) return
  hooked.add(world)
  const listener = (): void => {
    handleMaterialDispose(world, registry, material)
  }
  material.addEventListener('dispose', listener)
  let hooks = worldDisposeHooks.get(world)
  if (!hooks) {
    hooks = []
    worldDisposeHooks.set(world, hooks)
  }
  hooks.push({ material, listener })
}

/**
 * Shared eviction core: for every batched entity whose `SpriteMaterialRef`
 * satisfies `shouldEvict`, free its live slot, drop the InBatch relation,
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
  shouldEvict: (matRef: { materialId: number }) => boolean
): void {
  const batched = world.query(IsBatched, SpriteMaterialRef, BatchSlot)
  for (const entity of batched) {
    const matRef = entity.get(SpriteMaterialRef)
    if (!matRef || !shouldEvict(matRef)) continue

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
 * Evict every batched entity using `materialId` from its batch.
 *
 * Shared by the tier-upgrade rebuild (material schema changed) and the
 * dispose teardown (material's GPU resources are gone).
 */
export function evictBatchesForMaterial(world: World, registry: RegistryData, materialId: number): void {
  evictMatchingBatchedEntities(world, registry, (matRef) => matRef.materialId === materialId)
}

/**
 * Dispose teardown: batches using the material are torn down; sprites
 * holding a world-supplied default resurrect with a fresh default
 * (auto-rebatching on the next system pass); sprites with user-supplied
 * custom materials fall back to three's standard "disposed material in
 * use" semantics — restored to visible, unenrolled, and warned about.
 */
export function handleMaterialDispose(world: World, registry: RegistryData, material: Sprite2DMaterial): void {
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
      sprite._autoBatched = false
      sprite.visible = true
      sprite._unenrollFromWorld()
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

  const kind = material._tightMesh ? 'tight-mesh' : 'synth-quad'
  if (!batchEntity.has(BatchGeometryStrategy)) {
    batchEntity.add(BatchGeometryStrategy({ kind }))
  } else {
    batchEntity.set(BatchGeometryStrategy, { kind }, false)
  }
}

function setTag(entity: Entity, tag: Trait, present: boolean): void {
  const has = entity.has(tag)
  if (present && !has) entity.add(tag)
  else if (!present && has) entity.remove(tag)
}
