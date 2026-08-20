import { Group, Matrix4, Plane, Vector3, type Object3D } from 'three'
import { ClippingGroup } from 'three/webgpu'
import { createWorld, type World, type Entity, type Trait } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { ClipRect, SpriteGroupOptions, RenderStats } from './types'
import { assignWorld, type WorldProvider } from '../ecs/world'
import { BatchRegistry, BatchMesh } from '../ecs/traits'
import type { RegistryData } from '../ecs/batchUtils'
import {
  BATCH_TIER_LADDER,
  ensureMaterialDisposeHook,
  evictBatchesForMaterial,
  getWorldDefaultMaterial,
  getWorldEffectVariant,
  removeMaterialDisposeHooks,
} from '../ecs/batchUtils'
import { buildBatchQueryView, type BatchQueryView } from './batchQuery'
import { _registerBatchSource, _unregisterBatchSource, type BatchSourceFn } from '../debug/debug-sink'
import { SystemSchedule } from '../ecs/SystemSchedule'
import { PERF_TRACK } from '../debug/perf-track'
import {
  createBatchAssignSystem,
  createBatchReassignSystem,
  createBatchRemoveSystem,
  createBatchSortSystem,
  createSceneGraphSyncSystem,
  deferredDestroySystem,
} from '../ecs/systems'
import { conditionalTransformSyncSystem } from '../ecs/systems/conditionalTransformSyncSystem'
import { flushDirtyRangesSystem } from '../ecs/systems/flushDirtyRangesSystem'

// Types the build-time `process.env` reads without requiring @types/node (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

/**
 * 2D render pipeline with automatic batching and sorting.
 *
 * Add SpriteGroup to your scene and add sprites to it.
 * Sprites are automatically batched by material and sorted by layer/zIndex.
 *
 * ECS systems run automatically in `updateMatrixWorld()`, which Three.js
 * calls during `renderer.render(scene, camera)`. No explicit `update()` needed.
 *
 * Batching is fully ECS-driven:
 * - Sprite entities get InBatch relations linking them to batch entities
 * - Systems handle all data flow: assignment, reassignment, buffer sync, removal
 * - No imperative BatchManager — batch entities, runs, and slot management are pure ECS
 *
 * @example
 * ```typescript
 * const spriteGroup = new SpriteGroup()
 * scene.add(spriteGroup)
 *
 * const sprite = new Sprite2D({ texture })
 * sprite.sortLayer = SortLayers.ENTITIES
 * spriteGroup.add(sprite)
 *
 * // In render loop — no update() call needed
 * renderer.render(scene, camera)
 * ```
 */
const _clipPoint = new Vector3()
const _clipInverse = new Matrix4()

export class SpriteGroup extends ClippingGroup implements WorldProvider {
  readonly isSpriteGroup = true
  /**
   * ECS world for this renderer.
   * Lazily created on first access.
   */
  private _world: World | null = null

  /**
   * Entity holding the BatchRegistry singleton trait.
   */
  private _registryEntity: ReturnType<World['spawn']> | null = null

  /** Bound source getter registered with the devtools sink. */
  private _batchSource: BatchSourceFn | null = null

  /**
   * Last observed `registry.scheduleRuns` value at the time one of
   * this SpriteGroup's own entry points (`update` /
   * `updateMatrixWorld`) invoked `schedule.run`. When the registry's
   * counter has already advanced past this value — e.g. Flatland
   * bumped it by running the schedule directly — the entry point
   * treats the run as already satisfied for this frame and skips.
   * Reset by host frame bookkeeping (Flatland does this by
   * incrementing `scheduleRuns` when it runs the schedule itself).
   */
  private _lastRunSeen = 0

  /**
   * Maximum sprites per batch (explicit `maxBatchSize` opt-in). When the
   * user doesn't pass one, batches size themselves off the tier ladder.
   */
  private _maxBatchSize: number

  /**
   * Tier ladder for batch sizing — non-null unless the user pinned an
   * explicit `maxBatchSize`, in which case every batch uses that size.
   */
  private _tierLadder: readonly number[] | null

  private _clipRect: ClipRect | null = null
  private readonly _localClipPlanes = [new Plane(), new Plane(), new Plane(), new Plane()]

  /** Local-space clip rectangle, exposed as a property for R3F props. */
  get clipRect(): ClipRect | null {
    return this._clipRect
  }

  set clipRect(value: ClipRect | null) {
    this._clipRect = value ? ([...value] as ClipRect) : null
    this._updateLocalClipPlanes()
    this._syncWorldClipPlanes()
  }

  /**
   * Maximum sprites per batch. Reads back whichever sizing mode is
   * active; setting it pins every future batch in this group to that
   * fixed size (tier ladder off) — the escape hatch for hand-tuned
   * scenes where the ladder's warmup tiers cost more than they save
   * (e.g. a scene that's always going to hold tens of thousands of
   * sprites). Property setter (not just a constructor option) so R3F's
   * JSX prop path (`<spriteGroup maxBatchSize={16384} />`) works — only
   * affects batches created after the set; existing live batches keep
   * their size.
   */
  get maxBatchSize(): number {
    return this._maxBatchSize
  }

  set maxBatchSize(value: number) {
    this._maxBatchSize = value
    this._tierLadder = null
    const registry = this._getRegistry()
    if (registry) {
      registry.maxBatchSize = value
      registry.tierLadder = null
    }
  }

  /**
   * Whether frustum culling is enabled.
   */
  frustumCulling: boolean

  /**
   * Whether auto-sorting is enabled.
   */
  autoSort: boolean

  /**
   * Whether to automatically invalidate transforms every frame.
   * Enable for games where sprites move frequently.
   * Disable for static UIs and call invalidateTransforms() manually.
   */
  autoInvalidateTransforms: boolean

  /**
   * Sprite count for stats.
   */
  private _spriteCount: number = 0

  /**
   * Per-instance ECS system functions. Each holds its own scratch state
   * (Koota change-tracking subscriptions, scratch arrays, Sets) so two
   * SpriteGroups don't share buffers or interfere with each other's
   * change-tracking.
   */
  private readonly _batchAssignSystem = createBatchAssignSystem()
  private readonly _batchReassignSystem = createBatchReassignSystem()
  private readonly _batchRemoveSystem = createBatchRemoveSystem()
  private readonly _batchSortSystem = createBatchSortSystem()
  private readonly _sceneGraphSyncSystem = createSceneGraphSyncSystem()

  /**
   * Per-SpriteGroup state consumed by the schedule closures (built once
   * in `get world()`). These are the SAME references the BatchRegistry
   * spawn points at, so the factory systems and the registry never
   * diverge.
   */
  private _effectTraits: Map<Trait, typeof MaterialEffect> = new Map()
  private _pendingDestroy: Entity[] = []
  private _parentAdd = Group.prototype.add.bind(this)
  private _parentRemove = Group.prototype.remove.bind(this)

  /**
   * Source sprites retained below ordinary Object3D parents. Three.js only
   * dispatches `added` / `removed` on the directly-mutated node, so a whole
   * subtree can enter or leave this group without any descendant sprite
   * receiving an event. Reconcile the authored tree before each schedule run
   * to keep ownership exact in those cases.
   */
  private readonly _hierarchySprites = new Set<Sprite2D>()
  private readonly _hierarchySeen = new Set<Sprite2D>()

  constructor(options: SpriteGroupOptions = {}) {
    super()

    this.name = 'SpriteGroup'
    this.frustumCulled = false

    // Explicit maxBatchSize pins every batch to that size; otherwise the
    // tier ladder scales allocation with usage (1024 → 4096 → 16384).
    this._maxBatchSize = options.maxBatchSize ?? BATCH_TIER_LADDER[BATCH_TIER_LADDER.length - 1]!
    this._tierLadder = options.maxBatchSize !== undefined ? null : BATCH_TIER_LADDER

    this.autoSort = options.autoSort ?? true
    this.frustumCulling = options.frustumCulling ?? true
    this.autoInvalidateTransforms = options.autoInvalidateTransforms ?? true
    this.clipRect = options.clipRect ?? null
  }

  private _updateLocalClipPlanes(): void {
    const rect = this._clipRect
    if (!rect) {
      this.clippingPlanes.length = 0
      return
    }
    const [x, y, width, height] = rect
    const minX = Math.min(x, x + width)
    const maxX = Math.max(x, x + width)
    const minY = Math.min(y, y + height)
    const maxY = Math.max(y, y + height)
    this._localClipPlanes[0]!.setComponents(1, 0, 0, -minX)
    this._localClipPlanes[1]!.setComponents(-1, 0, 0, maxX)
    this._localClipPlanes[2]!.setComponents(0, 1, 0, -minY)
    this._localClipPlanes[3]!.setComponents(0, -1, 0, maxY)
    while (this.clippingPlanes.length < 4) this.clippingPlanes.push(new Plane())
    this.clippingPlanes.length = 4
  }

  private _syncWorldClipPlanes(): void {
    if (!this._clipRect) return
    for (let i = 0; i < 4; i++) {
      this.clippingPlanes[i]!.copy(this._localClipPlanes[i]!).applyMatrix4(this.matrixWorld)
    }
  }

  /** CPU counterpart to the renderer's clip planes, used by picking. @internal */
  _containsWorldPoint(point: Vector3): boolean {
    const rect = this._clipRect
    if (!rect) return true
    this.updateWorldMatrix(true, false)
    _clipInverse.copy(this.matrixWorld).invert()
    _clipPoint.copy(point).applyMatrix4(_clipInverse)
    const [x, y, width, height] = rect
    const minX = Math.min(x, x + width)
    const maxX = Math.max(x, x + width)
    const minY = Math.min(y, y + height)
    const maxY = Math.max(y, y + height)
    return _clipPoint.x >= minX && _clipPoint.x <= maxX && _clipPoint.y >= minY && _clipPoint.y <= maxY
  }

  /**
   * The ECS world managed by this renderer.
   * Sprites added to this renderer are enrolled in this world.
   */
  get world(): World {
    if (!this._world) {
      this._world = createWorld()

      // Build the SystemSchedule in execution order. The batch
      // lifecycle / sort / scene-graph systems are factory instances
      // (created ONCE as readonly fields above to hold per-SpriteGroup
      // scratch state). We register stable closures over those instances
      // here — built once at world-init, never re-`createX()`-ing per
      // frame. Lighting systems are prepended later by
      // `Flatland.setLighting` via `schedule.prepend(...)`.
      const schedule = new SystemSchedule()
      schedule
        .add(() => deferredDestroySystem(this._pendingDestroy), {
          track: PERF_TRACK.Batch,
          name: 'deferredDestroy',
        })
        // Sort-aware tier-rebuild + effect-trait collection. Uses the
        // BatchSlot-authoritative slot (kept in sync by batchSortSystem),
        // NOT the stale InBatch relation slot.
        .add(() => this._checkMaterialVersions(), {
          track: PERF_TRACK.Batch,
          name: 'checkMaterialVersions',
        })
        .add(() => this._rebuildEffectTraits(), {
          track: PERF_TRACK.Batch,
          name: 'rebuildEffectTraits',
        })
        .add((w) => this._batchAssignSystem(w, this._effectTraits), {
          track: PERF_TRACK.Batch,
          name: 'batchAssign',
        })
        .add((w) => this._batchReassignSystem(w, this._effectTraits), {
          track: PERF_TRACK.Batch,
          name: 'batchReassign',
        })
        .add(conditionalTransformSyncSystem, {
          track: PERF_TRACK.Sprites,
          name: 'transformSync',
        })
        // Re-sort instance slots by zIndex within dirty batches.
        .add((w) => this._batchSortSystem(w), {
          track: PERF_TRACK.Batch,
          name: 'batchSort',
        })
        .add((w) => this._sceneGraphSyncSystem(w, this, this._parentAdd, this._parentRemove), {
          track: PERF_TRACK.Batch,
          name: 'sceneGraphSync',
        })
        .add((w) => this._batchRemoveSystem(w, this._pendingDestroy), {
          track: PERF_TRACK.Batch,
          name: 'batchRemove',
        })
        // Late assignment: catch entities enrolled mid-frame (e.g. R3F
        // reconciliation between render calls). Uses the same factory
        // instances so the late pass shares their scratch state.
        .add(
          (w) => {
            const lateAssigned = this._batchAssignSystem(w, this._effectTraits)
            if (lateAssigned) {
              conditionalTransformSyncSystem(w)
              this._batchSortSystem(w)
              this._sceneGraphSyncSystem(w, this, this._parentAdd, this._parentRemove)
            }
          },
          { track: PERF_TRACK.Batch, name: 'batchAssignLate' }
        )
        .add(flushDirtyRangesSystem, {
          track: PERF_TRACK.Batch,
          name: 'flushDirtyRanges',
        })

      // Register with the devtools batch-source sink so the batches
      // feature can snapshot our active batches each frame. No-op in
      // prod (tree-shaken via the devtools build gate). The getter closure
      // stays allocation-free past construction.
      if (process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true') {
        this._batchSource = () => this._getRegistry()
        _registerBatchSource(this._batchSource)
      }

      // Spawn the batch registry singleton with all system context
      this._registryEntity = this._world.spawn(
        BatchRegistry({
          runs: new Map(),
          sortedRunKeys: [],
          batchPool: [],
          activeBatches: [],
          renderOrderDirty: false,
          maxBatchSize: this._maxBatchSize,
          tierLadder: this._tierLadder,
          materialRefs: new Map(),
          defaultMaterials: new WeakMap(),
          effectVariants: new WeakMap(),
          batchSlots: [],
          batchSlotFreeList: [],
          spriteArr: [],
          // Share the SpriteGroup's own references so the schedule
          // closures (which read this._effectTraits / this._pendingDestroy)
          // and any registry consumer operate on the same map/array.
          effectTraits: this._effectTraits,
          pendingDestroy: this._pendingDestroy,
          parentGroup: this,
          parentAdd: this._parentAdd,
          parentRemove: this._parentRemove,
          autoInvalidateTransforms: this.autoInvalidateTransforms,
          transformsDirty: true,
          schedule,
          scheduleRuns: 0,
          occludersDirty: true,
        })
      )
    }
    return this._world
  }

  /**
   * Add a sprite to the renderer.
   */
  override add(...objects: Object3D[]): this
  override add(sprite: Sprite2D): this
  override add(spriteOrObject: Sprite2D | Object3D, ...rest: Object3D[]): this {
    // If called with multiple arguments, delegate to parent
    if (rest.length > 0) {
      return super.add(spriteOrObject, ...rest)
    }
    // Check if it's a Sprite2D (has _enrollInWorld — duck typing)
    if ('_enrollInWorld' in spriteOrObject && '_flatlandWorld' in spriteOrObject) {
      if (spriteOrObject._batchEnrollmentBlockedMaterial === spriteOrObject.material) return this
      const targetWorld = this.world
      // Skip if already enrolled (R3F insertBefore re-adds during reconciliation)
      if (spriteOrObject.entity && spriteOrObject._flatlandWorld === targetWorld) return this
      if (spriteOrObject._autoRegistry && spriteOrObject._autoRegistry.group !== this) {
        spriteOrObject._releaseAutoOrchestration()
      }
      if (spriteOrObject.entity) this._releasePreviousWorldEnrollment(spriteOrObject)
      // Assign ECS world, resolve world-scoped default material, enroll
      assignWorld(spriteOrObject, targetWorld)
      this._resolveDefaultMaterial(spriteOrObject)
      spriteOrObject._enrollInWorld(targetWorld)
      this._spriteCount++
      this._trackMaterial(spriteOrObject)
    } else {
      super.add(spriteOrObject)
      spriteOrObject.traverse((object) => {
        if ('_enrollInWorld' in object && '_flatlandWorld' in object) {
          this._enrollHierarchySprite(object as Sprite2D)
        }
      })
    }
    return this
  }

  /** Enroll a sprite while leaving it under its authored Object3D parent. @internal */
  _enrollHierarchySprite(sprite: Sprite2D): void {
    if (
      sprite._renderOrderOverridden ||
      sprite._batchEnrollmentBlockedMaterial === sprite.material ||
      !this._ownsHierarchySprite(sprite)
    )
      return

    if (sprite._hierarchyOwner && sprite._hierarchyOwner !== this) {
      sprite._hierarchyOwner._releaseHierarchySprite?.(sprite)
    }
    if (sprite._autoRegistry) sprite._releaseAutoOrchestration()

    const targetWorld = this.world
    if (sprite.entity && sprite._flatlandWorld !== targetWorld) {
      this._releasePreviousWorldEnrollment(sprite)
    }

    // A sprite can already belong to this ECS world through the direct-add
    // API, then later be parented below an ordinary Object3D. Convert that
    // enrollment in-place so the authored ancestor chain starts contributing
    // transforms and visibility without changing the sprite count.
    if (sprite.entity) {
      sprite._hierarchyManaged = true
      sprite._hierarchyOwner = this
      this._hierarchySprites.add(sprite)
      const registry = this._getRegistry()
      if (registry) registry.transformsDirty = true
      return
    }

    assignWorld(sprite, targetWorld)
    this._resolveDefaultMaterial(sprite)
    sprite._hierarchyManaged = true
    sprite._hierarchyOwner = this
    this._hierarchySprites.add(sprite)
    sprite._enrollInWorld(targetWorld)
    this._spriteCount++
    this._trackMaterial(sprite)
  }

  /** Release a retained source descendant from this group's world. @internal */
  _releaseHierarchySprite(sprite: Sprite2D): void {
    if (sprite._hierarchyOwner !== this) return
    this._hierarchySprites.delete(sprite)
    sprite._hierarchyManaged = false
    sprite._hierarchyOwner = null
    sprite._batchWorldFresh = false
    sprite._batchHierarchyState = undefined
    sprite._setBatchSuppressed(false)
    sprite._unenrollFromWorld()
    // Hierarchy ownership follows the authored scene graph. Once fully
    // released, the sprite may be adopted by another SpriteGroup world.
    sprite._flatlandWorld = null
    this._spriteCount--
  }

  /** Release a direct (non-hierarchy) enrollment so another world can adopt it. */
  private _releaseDirectEnrollment(sprite: Sprite2D): void {
    if (!sprite.entity || sprite._flatlandWorld !== this._world) return
    sprite._setBatchSuppressed(false)
    sprite._unenrollFromWorld()
    sprite._flatlandWorld = null
    this._spriteCount--
  }

  /** Resolve and release the SpriteGroup that owns a sprite's previous ECS world. */
  private _releasePreviousWorldEnrollment(sprite: Sprite2D): void {
    const previousWorld = sprite._flatlandWorld
    if (!previousWorld) return
    const registryEntity = previousWorld.query(BatchRegistry)[0]
    const registry = registryEntity?.get(BatchRegistry) as RegistryData | undefined
    const previousGroup = registry?.parentGroup
    if (previousGroup && 'isSpriteGroup' in previousGroup && previousGroup.isSpriteGroup === true) {
      const previousSpriteGroup = previousGroup as SpriteGroup
      previousSpriteGroup._releaseDirectEnrollment(sprite)
      return
    }
    sprite._setBatchSuppressed(false)
    sprite._unenrollFromWorld()
    sprite._flatlandWorld = null
  }

  /** True when this is the first SpriteGroup above the source sprite. */
  private _ownsHierarchySprite(sprite: Sprite2D): boolean {
    let parent = sprite.parent
    while (parent) {
      if ('isSpriteGroup' in parent && parent.isSpriteGroup === true) return parent === this
      parent = parent.parent
    }
    return false
  }

  /** Collect authored descendants without crossing a nested SpriteGroup boundary. */
  private _collectHierarchySprites(object: Object3D): void {
    if ('isSpriteGroup' in object && object.isSpriteGroup === true) return

    if ('_enrollInWorld' in object && '_flatlandWorld' in object) {
      const sprite = object as Sprite2D
      if (!sprite._renderOrderOverridden && sprite._batchEnrollmentBlockedMaterial !== sprite.material) {
        this._hierarchySeen.add(sprite)
        if (sprite._hierarchyOwner !== this || !sprite.entity) this._enrollHierarchySprite(sprite)
      }
    }

    for (const child of object.children) this._collectHierarchySprites(child)
  }

  /**
   * Repair descendant ownership after subtree attach/detach/reparent mutations.
   * The steady-state direct-sprite path visits only SpriteBatch children.
   */
  private _reconcileHierarchySprites(): void {
    this._hierarchySeen.clear()
    for (const child of this.children) this._collectHierarchySprites(child)

    for (const sprite of this._hierarchySprites) {
      if (!this._hierarchySeen.has(sprite)) this._releaseHierarchySprite(sprite)
    }
  }

  /**
   * Re-resolve a bootstrap default or bootstrap effect-variant material
   * to this group's world-scoped store for the sprite's texture.
   * Explicit user materials pass through untouched (their dispose hook
   * still installs via _trackMaterial → ensureMaterialDisposeHook).
   */
  private _resolveDefaultMaterial(sprite: Sprite2D): void {
    const texture = sprite.texture
    if (!texture) return
    if (sprite._materialIsBootstrapDefault) {
      const registry = this._getRegistry()
      if (!registry) return
      sprite._resolveDefaultMaterial(getWorldDefaultMaterial(this.world, registry, texture))
    } else if (sprite._materialIsBootstrapVariant) {
      const registry = this._getRegistry()
      if (!registry) return
      sprite._resolveEffectVariantMaterial(
        getWorldEffectVariant(this.world, registry, texture, sprite._currentVariantOptions())
      )
    }
  }

  /**
   * Add multiple sprites to the renderer.
   */
  addSprites(...sprites: Sprite2D[]): this {
    for (const sprite of sprites) {
      this.add(sprite)
    }
    return this
  }

  /**
   * Remove a sprite from the renderer.
   */
  override remove(...objects: Object3D[]): this
  override remove(sprite: Sprite2D): this
  override remove(spriteOrObject: Sprite2D | Object3D, ...rest: Object3D[]): this {
    // If called with multiple arguments, delegate to parent
    if (rest.length > 0) {
      return super.remove(spriteOrObject, ...rest)
    }
    // Check if it's a Sprite2D
    if ('_unenrollFromWorld' in spriteOrObject && '_flatlandWorld' in spriteOrObject) {
      if (spriteOrObject._hierarchyOwner === this) {
        // Match Object3D.remove(): a retained descendant is not this
        // group's direct child, so removing it from here is a no-op.
        if (spriteOrObject.parent !== this) return this
        this._releaseHierarchySprite(spriteOrObject)
        super.remove(spriteOrObject)
      } else {
        this._releaseDirectEnrollment(spriteOrObject)
        if (spriteOrObject.parent === this) super.remove(spriteOrObject)
      }
    } else {
      spriteOrObject.traverse((object) => {
        if ('_hierarchyManaged' in object && (object as Sprite2D)._hierarchyManaged) {
          this._releaseHierarchySprite(object as Sprite2D)
        }
      })
      super.remove(spriteOrObject)
    }
    return this
  }

  /**
   * Remove multiple sprites from the renderer.
   */
  removeSprites(...sprites: Sprite2D[]): this {
    for (const sprite of sprites) {
      this._releaseDirectEnrollment(sprite)
    }
    return this
  }

  /**
   * Mark a sprite as needing sort recalculation.
   * Call when sprite's layer or zIndex changes.
   * Note: With pure ECS batching, Changed() queries detect this automatically.
   * This method is kept for explicit invalidation if needed.
   */
  invalidate(_sprite: Sprite2D): void {
    // No-op: batchReassignSystem detects Changed(SortLayer/SpriteMaterialRef/CameraLayersMask) automatically
  }

  /**
   * Mark all sprites as needing update.
   * Note: With pure ECS batching, this is largely a no-op since systems detect changes.
   */
  invalidateAll(): void {
    // No-op: ECS systems detect all changes automatically
  }

  /**
   * Mark transforms as needing update.
   * Note: With autoInvalidateTransforms=true (default), this happens every frame.
   */
  invalidateTransforms(): void {
    const registry = this._getRegistry()
    if (registry) registry.transformsDirty = true
  }

  /**
   * Three.js render hook — runs ECS systems and syncs buffers.
   *
   * Called automatically by Three.js during `renderer.render(scene, camera)`
   * before drawing children. This is the main integration point — no manual
   * `update()` call is needed.
   *
   * Per-frame flow is the `SystemSchedule` built in `get world()`:
   * deferredDestroy → material-version/effect-traits → batchAssign →
   * batchReassign → conditionalTransformSync → batchSort → sceneGraphSync
   * → batchRemove → late-assign → flushDirtyRanges, with lighting systems
   * prepended by `Flatland.setLighting`. Color / UV / flip / effect writes
   * are NOT in the schedule — they happen at the setter site via the
   * sprite's cached `_batchMesh`/`_batchSlot`; the BucketedDirtyTracker on
   * each instance attribute coalesces uploads.
   */
  private _inSystems = false

  override updateMatrixWorld(force?: boolean): void {
    if (!this._inSystems) this._reconcileHierarchySprites()

    // Reentrancy guard: systems (e.g. shadowPipelineSystem) can trigger a
    // nested renderer.render() for offscreen passes, and three.js will call
    // scene.updateMatrixWorld inside it. Running the ECS schedule again from
    // that nested call recurses forever, so skip straight to the matrix
    // update on reentry — systems already ran for this frame.
    if (this._world && !this._inSystems) {
      const registry = this._getRegistry()
      if (registry?.schedule) {
        // Skip if the schedule has already run this frame (e.g.
        // Flatland owns the frame and already called schedule.run
        // directly). Without this check `scene.updateMatrixWorld(true)`
        // from inside Flatland.render would trigger a second run in
        // the same frame, which is how `shadowPipelineSystem` was
        // firing N times per frame.
        if (registry.scheduleRuns !== this._lastRunSeen) {
          this._lastRunSeen = registry.scheduleRuns
        } else {
          registry.autoInvalidateTransforms = this.autoInvalidateTransforms
          registry.schedule.nextFrame()
          this._inSystems = true
          try {
            registry.schedule.run(this._world)
            registry.scheduleRuns++
            this._lastRunSeen = registry.scheduleRuns
          } finally {
            this._inSystems = false
          }
        }
      }
    }

    super.updateMatrixWorld(force)
    this._syncWorldClipPlanes()
  }

  /**
   * Explicitly run all ECS systems for a new frame.
   * @deprecated Use Three.js `renderer.render()` instead — systems run
   * automatically in `updateMatrixWorld()`. Kept for backwards compatibility.
   */
  update(): void {
    this._runScheduleNow()
  }

  /**
   * Force-run the ECS schedule for this frame if it hasn't already run.
   * The non-deprecated internal used by callers that need the schedule
   * to have executed before they proceed this frame (e.g. the
   * auto-orchestration scene sweep) — `update()` is the deprecated
   * public alias of this same logic.
   * @internal
   */
  _runScheduleNow(): void {
    if (this._inSystems) return
    this._reconcileHierarchySprites()
    if (!this._world) return
    const registry = this._getRegistry()
    if (registry?.schedule) {
      // Skip when the schedule has already run this frame (e.g. via
      // Flatland.render's direct `schedule.run`). Becoming a no-op under
      // Flatland is intentional — the direct call above it already did
      // the work. Standalone callers who haven't run the schedule yet
      // still get a full run here.
      if (registry.scheduleRuns !== this._lastRunSeen) {
        this._lastRunSeen = registry.scheduleRuns
        return
      }
      registry.autoInvalidateTransforms = this.autoInvalidateTransforms
      registry.schedule.nextFrame()
      this._inSystems = true
      try {
        registry.schedule.run(this._world)
        registry.scheduleRuns++
        this._lastRunSeen = registry.scheduleRuns
      } finally {
        this._inSystems = false
      }
    }
  }

  /**
   * Track a material for schema version detection.
   */
  private _trackMaterial(sprite: Sprite2D): void {
    const mat = sprite.material
    if (!this._world) return
    const registry = this._getRegistry()
    if (!registry) return
    registry.materialRefs.set(mat.batchId, {
      material: mat,
      version: mat._effectSchemaVersion,
    })
    ensureMaterialDisposeHook(this._world, registry, mat)
  }

  /**
   * Check for material schema version changes (tier upgrades from effect registration).
   * When detected, evicts sprites from old batches (wrong buffer layout) and
   * re-triggers IsRenderable so batchAssignSystem creates new batches with
   * the correct effect buffer tier.
   */
  private _checkMaterialVersions(): void {
    if (!this._world) return
    const registryEntities = this._world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    for (const [materialId, ref] of registry.materialRefs) {
      // Late atlas-mesh registration (loader finished after sprites
      // batched) flips the geometry strategy here — the flip bumps the
      // schema version, and the standard rebuild below re-batches with
      // matching geometry. Cheap when nothing changed: a WeakMap lookup
      // + boolean compare per tracked material.
      ref.material._resolveGeometryStrategy()
      if (ref.material._effectSchemaVersion !== ref.version) {
        ref.version = ref.material._effectSchemaVersion
        this._rebuildBatchesForMaterial(registry, materialId)
      }
    }
  }

  /**
   * Force-rebuild batches for a material by evicting sprite entities from
   * old batches and re-triggering IsRenderable for batchAssignSystem.
   * Called when a material's effect tier changes (e.g., new effect registered
   * that requires larger GPU buffers).
   */
  private _rebuildBatchesForMaterial(registry: RegistryData, materialId: number): void {
    if (!this._world) return
    evictBatchesForMaterial(this._world, registry, materialId)
  }

  /**
   * Rebuild the effect traits map from tracked materials.
   */
  private _rebuildEffectTraits(): void {
    if (!this._world) return
    const registryEntities = this._world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    this._effectTraits.clear()
    for (const { material } of registry.materialRefs.values()) {
      for (const effectClass of material.getEffects()) {
        this._effectTraits.set(effectClass._trait, effectClass)
      }
    }
  }

  /**
   * Get render statistics.
   *
   * Note: `drawCalls` is NOT computed here — it must come from
   * `renderer.info.render.calls` after the actual Three.js render pass.
   * See Flatland.stats for the real value, or capture the delta yourself:
   * ```ts
   * const before = renderer.info.render.calls
   * renderer.render(scene, camera)
   * const drawCalls = renderer.info.render.calls - before
   * ```
   */
  get stats(): RenderStats {
    const registry = this._getRegistry()
    const activeBatches = registry?.activeBatches ?? []
    const batchCount = activeBatches.length
    let visibleSprites = 0

    for (const batchEntity of activeBatches) {
      const batchMeshData = batchEntity.get(BatchMesh)
      const mesh = batchMeshData?.mesh ?? null
      if (mesh) visibleSprites += mesh.activeCount
    }

    return {
      spriteCount: this._spriteCount,
      batchCount,
      visibleSprites,
    }
  }

  /**
   * Read-only view of this group's batches keyed by run key, with the
   * classification query facade (`group.batches.where(IsLitBatch)`).
   */
  get batches(): BatchQueryView {
    return buildBatchQueryView(this._world, this._getRegistry())
  }

  /**
   * Get the number of sprites.
   */
  get spriteCount(): number {
    return this._spriteCount
  }

  /**
   * Get the number of batches.
   */
  get batchCount(): number {
    const registry = this._getRegistry()
    return registry?.activeBatches.length ?? 0
  }

  /**
   * Check if the renderer has any sprites.
   */
  get isEmpty(): boolean {
    return this._spriteCount === 0
  }

  /**
   * Clear all sprites.
   */
  override clear(): this {
    for (const sprite of this._hierarchySprites) this._releaseHierarchySprite(sprite)

    // Remove all batch children from scene graph
    while (this.children.length > 0) {
      const child = this.children[0]
      if (child) {
        super.remove(child)
      }
    }

    // Clear registry state
    const registry = this._getRegistry()
    if (registry) {
      // Dispose all active batch meshes
      for (const batchEntity of registry.activeBatches) {
        const batchMeshData = batchEntity.get(BatchMesh)
        const mesh = batchMeshData?.mesh ?? null
        if (mesh) mesh.dispose()
      }
      // Dispose pooled batch meshes
      for (const batchEntity of registry.batchPool) {
        const batchMeshData = batchEntity.get(BatchMesh)
        const mesh = batchMeshData?.mesh ?? null
        if (mesh) mesh.dispose()
      }
      registry.activeBatches.length = 0
      registry.batchPool.length = 0
      registry.runs.clear()
      registry.sortedRunKeys.length = 0
      registry.materialRefs.clear()
      registry.renderOrderDirty = false
      registry.batchSlots.length = 0
      registry.batchSlotFreeList.length = 0
      registry.spriteArr.length = 0
      registry.effectTraits.clear()

      // Flush deferred destroys so zombies don't outlive the group
      for (const entity of registry.pendingDestroy) {
        entity.destroy()
      }
      registry.pendingDestroy.length = 0
    }

    this._spriteCount = 0

    return this
  }

  /**
   * Get the BatchRegistry data from the world singleton.
   */
  private _getRegistry(): RegistryData | null {
    if (!this._world) return null
    const registryEntities = this._world.query(BatchRegistry)
    if (registryEntities.length === 0) return null
    return (registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined) ?? null
  }

  /**
   * Clone for devtools/serialization compatibility.
   * SpriteGroup manages an ECS world that cannot be meaningfully cloned.
   * Returns a Group containing cloned child meshes (the SpriteBatch instances).
   */
  override clone(recursive?: boolean): this {
    const cloned = new ClippingGroup()
    cloned.name = this.name
    cloned.visible = this.visible
    cloned.frustumCulled = this.frustumCulled
    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
    cloned.clippingPlanes = this.clippingPlanes.map((plane) => plane.clone())
    if (recursive !== false) {
      for (const child of this.children) {
        cloned.add(child.clone(true))
      }
    }
    return cloned as unknown as this
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clear()
    if ((process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true') && this._batchSource !== null) {
      _unregisterBatchSource(this._batchSource)
      this._batchSource = null
    }
    if (this._world) {
      removeMaterialDisposeHooks(this._world)
      this._world.destroy()
      this._world = null
      this._registryEntity = null
    }
  }
}
