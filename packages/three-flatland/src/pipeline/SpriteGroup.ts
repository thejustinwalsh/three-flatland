import { Group, type Object3D } from 'three'
import { createWorld, type World } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { SpriteGroupOptions, RenderStats } from './types'
import { DEFAULT_BATCH_SIZE } from './SpriteBatch'
import { assignWorld, type WorldProvider } from '../ecs/world'
import {
  BatchRegistry,
  BatchMesh,
} from '../ecs/traits'
import type { RegistryData } from '../ecs/batchUtils'
import { SystemSchedule } from '../ecs/SystemSchedule'
import {
  deferredDestroySystem,
  batchAssignSystem,
  batchReassignSystem,
  bufferSyncColorSystem,
  bufferSyncFlipSystem,
  bufferSyncEffectSystem,
  sceneGraphSyncSystem,
  batchRemoveSystem,
} from '../ecs/systems'
import { materialVersionSystem } from '../ecs/systems/materialVersionSystem'
import { effectTraitsSystem } from '../ecs/systems/effectTraitsSystem'
import { conditionalTransformSyncSystem } from '../ecs/systems/conditionalTransformSyncSystem'
import { lateAssignSystem } from '../ecs/systems/lateAssignSystem'
import { flushDirtyRangesSystem } from '../ecs/systems/flushDirtyRangesSystem'

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
 * sprite.layer = Layers.ENTITIES
 * spriteGroup.add(sprite)
 *
 * // In render loop — no update() call needed
 * renderer.render(scene, camera)
 * ```
 */
export class SpriteGroup extends Group implements WorldProvider {
  /**
   * ECS world for this renderer.
   * Lazily created on first access.
   */
  private _world: World | null = null

  /**
   * Entity holding the BatchRegistry singleton trait.
   */
  private _registryEntity: ReturnType<World['spawn']> | null = null

  /**
   * Maximum sprites per batch.
   */
  private _maxBatchSize: number

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

  constructor(options: SpriteGroupOptions = {}) {
    super()

    this.name = 'SpriteGroup'
    this.frustumCulled = false

    this._maxBatchSize = options.maxBatchSize ?? DEFAULT_BATCH_SIZE

    this.autoSort = options.autoSort ?? true
    this.frustumCulling = options.frustumCulling ?? true
    this.autoInvalidateTransforms = options.autoInvalidateTransforms ?? true
  }

  /**
   * The ECS world managed by this renderer.
   * Sprites added to this renderer are enrolled in this world.
   */
  get world(): World {
    if (!this._world) {
      this._world = createWorld()

      // Build the SystemSchedule with all sprite systems in order
      const schedule = new SystemSchedule()
      // Systems are registered in execution order per the plan
      schedule
        .add(deferredDestroySystem)
        .add(materialVersionSystem)
        .add(effectTraitsSystem)
        .add(batchAssignSystem as (world: World) => void)
        .add(batchReassignSystem)
        .add(bufferSyncColorSystem)
        .add(bufferSyncFlipSystem)
        .add(bufferSyncEffectSystem)
        .add(conditionalTransformSyncSystem)
        .add(sceneGraphSyncSystem)
        .add(batchRemoveSystem)
        .add(lateAssignSystem)
        .add(flushDirtyRangesSystem)

      // Spawn the batch registry singleton with all system context
      this._registryEntity = this._world.spawn(
        BatchRegistry({
          runs: new Map(),
          sortedRunKeys: [],
          batchPool: [],
          activeBatches: [],
          renderOrderDirty: false,
          maxBatchSize: this._maxBatchSize,
          materialRefs: new Map(),
          batchSlots: [],
          batchSlotFreeList: [],
          spriteArr: [],
          effectTraits: new Map(),
          pendingDestroy: [],
          parentGroup: this,
          parentAdd: Group.prototype.add.bind(this),
          parentRemove: Group.prototype.remove.bind(this),
          autoInvalidateTransforms: this.autoInvalidateTransforms,
          schedule,
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
      // Skip if already enrolled (R3F insertBefore re-adds during reconciliation)
      if (spriteOrObject.entity) return this
      // Assign ECS world and enroll entity
      assignWorld(spriteOrObject, this.world)
      spriteOrObject._enrollInWorld(this.world)
      this._spriteCount++
      this._trackMaterial(spriteOrObject)
    } else {
      super.add(spriteOrObject)
    }
    return this
  }

  /**
   * Add multiple sprites to the renderer.
   */
  addSprites(...sprites: Sprite2D[]): this {
    for (const sprite of sprites) {
      assignWorld(sprite, this.world)
      sprite._enrollInWorld(this.world)
      this._spriteCount++
      this._trackMaterial(sprite)
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
      spriteOrObject._unenrollFromWorld()
      this._spriteCount--
    } else {
      super.remove(spriteOrObject)
    }
    return this
  }

  /**
   * Remove multiple sprites from the renderer.
   */
  removeSprites(...sprites: Sprite2D[]): this {
    for (const sprite of sprites) {
      sprite._unenrollFromWorld()
      this._spriteCount--
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
    // No-op: batchReassignSystem detects Changed(SpriteLayer/SpriteMaterialRef) automatically
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
    // No-op: transformSyncSystem runs every frame when autoInvalidateTransforms=true
  }

  /**
   * Three.js render hook — runs ECS systems and syncs buffers.
   *
   * Called automatically by Three.js during `renderer.render(scene, camera)`
   * before drawing children. This is the main integration point — no manual
   * `update()` call is needed.
   */
  private _inSystems = false

  override updateMatrixWorld(force?: boolean): void {
    // Reentrancy guard: systems (e.g. shadowPipelineSystem) can trigger a
    // nested renderer.render() for offscreen passes, and three.js will call
    // scene.updateMatrixWorld inside it. Running the ECS schedule again from
    // that nested call recurses forever, so skip straight to the matrix
    // update on reentry — systems already ran for this frame.
    if (this._world && !this._inSystems) {
      const registry = this._getRegistry()
      if (registry?.schedule) {
        // Keep autoInvalidateTransforms in sync
        registry.autoInvalidateTransforms = this.autoInvalidateTransforms
        // nextFrame + run — idempotent if update() already ran this frame
        registry.schedule.nextFrame()
        this._inSystems = true
        try {
          registry.schedule.run(this._world)
        } finally {
          this._inSystems = false
        }
      }
    }

    super.updateMatrixWorld(force)
  }

  /**
   * Explicitly run all ECS systems for a new frame.
   * @deprecated Use Three.js `renderer.render()` instead — systems run
   * automatically in `updateMatrixWorld()`. Kept for backwards compatibility.
   */
  update(): void {
    if (!this._world) return
    const registry = this._getRegistry()
    if (registry?.schedule) {
      // Keep autoInvalidateTransforms in sync
      registry.autoInvalidateTransforms = this.autoInvalidateTransforms
      // Always advance + run — explicit call always means "new frame"
      registry.schedule.nextFrame()
      registry.schedule.run(this._world)
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
  }

  /**
   * Sprite-domain stats: sprite count, batch count, visible-after-
   * culling. Does NOT include renderer-level stats (draw calls,
   * triangles, GPU timing, etc.) — subscribe to the devtools bus's
   * `stats` feature for those. Keeps this path free of renderer.info
   * math in prod builds.
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
    return registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined ?? null
  }

  /**
   * Clone for devtools/serialization compatibility.
   * SpriteGroup manages an ECS world that cannot be meaningfully cloned.
   * Returns a Group containing cloned child meshes (the SpriteBatch instances).
   */
  override clone(recursive?: boolean): this {
    const cloned = new Group()
    cloned.name = this.name
    cloned.visible = this.visible
    cloned.frustumCulled = this.frustumCulled
    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
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
    if (this._world) {
      this._world.destroy()
      this._world = null
      this._registryEntity = null
    }
  }
}
