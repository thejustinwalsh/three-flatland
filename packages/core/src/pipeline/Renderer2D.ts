import { Group, type Object3D } from 'three'
import { createWorld, type World, type Trait } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Renderer2DOptions, RenderStats } from './types'
import { DEFAULT_BATCH_SIZE } from './SpriteBatch'
import { assignWorld, type WorldProvider } from '../ecs/world'
import { BatchRegistry, BatchMesh } from '../ecs/traits'
import type { RegistryData } from '../ecs/batchUtils'
import type { MaterialEffect } from '../materials/MaterialEffect'
import {
  batchAssignSystem,
  batchReassignSystem,
  batchRemoveSystem,
  bufferSyncColorSystem,
  bufferSyncFlipSystem,
  bufferSyncEffectSystem,
  transformSyncSystem,
  sceneGraphSyncSystem,
} from '../ecs/systems'
import { measure } from '../util/measure'

/**
 * 2D render pipeline with automatic batching and sorting.
 *
 * Add Renderer2D to your scene and add sprites to it.
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
 * const renderer2D = new Renderer2D()
 * scene.add(renderer2D)
 *
 * const sprite = new Sprite2D({ texture })
 * sprite.layer = Layers.ENTITIES
 * renderer2D.add(sprite)
 *
 * // In render loop — no update() call needed
 * renderer.render(scene, camera)
 * ```
 */
export class Renderer2D extends Group implements WorldProvider {
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
   * Cached effect traits across all materials (rebuilt lazily).
   */
  private _effectTraits: Map<Trait, typeof MaterialEffect> = new Map()

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
   * Dedup guard: prevents systems from running twice if user calls
   * update() AND renderer.render() in the same frame.
   */
  private _systemsRanThisFrame: boolean = false

  /**
   * Bound Group.prototype.add for bypassing Renderer2D override in scene graph sync.
   */
  private _parentAdd = Group.prototype.add.bind(this)

  /**
   * Bound Group.prototype.remove for bypassing Renderer2D override in scene graph sync.
   */
  private _parentRemove = Group.prototype.remove.bind(this)

  /**
   * Sprite count for stats.
   */
  private _spriteCount: number = 0

  constructor(options: Renderer2DOptions = {}) {
    super()

    this.name = 'Renderer2D'
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
      // Spawn the batch registry singleton
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
   *
   * Per-frame flow:
   * 1. batchAssignSystem — assign new sprites to batches via InBatch relation
   * 2. batchReassignSystem — handle layer/material changes (cross-run movement)
   * 3. batchRemoveSystem — free slots for removed sprites, recycle empty batches
   * 4. bufferSyncColorSystem — Changed(SpriteColor) + IsBatched -> batch buffer write
   * 5. bufferSyncUVSystem — Changed(SpriteUV) + IsBatched -> batch buffer write
   * 6. bufferSyncFlipSystem — Changed(SpriteFlip) + IsBatched -> batch buffer write
   * 7. bufferSyncEffectSystem — Changed(effectTrait) + IsBatched -> packed buffer write
   * 8. transformSyncSystem — sync all transforms to batch instance matrices
   * 9. sceneGraphSyncSystem — rebuild Renderer2D children from sorted batch entities
   * 10. super.updateMatrixWorld() — continue Three.js traversal
   */
  override updateMatrixWorld(force?: boolean): void {
    if (!this._systemsRanThisFrame) {
      this._runSystems()
    }
    this._systemsRanThisFrame = false

    super.updateMatrixWorld(force)
  }

  /**
   * Update batches for rendering.
   * @deprecated Use Three.js `renderer.render()` instead — systems run
   * automatically in `updateMatrixWorld()`. Kept for backwards compatibility.
   */
  update(): void {
    this._runSystems()
    this._systemsRanThisFrame = true
  }

  /**
   * Run all ECS systems.
   */
  private _runSystems(): void {
    if (!this._world) return

    // Check for material schema changes (tier upgrades)
    this._checkMaterialVersions()

    // Collect effect traits
    this._rebuildEffectTraits()

    // Batch lifecycle systems
    let end = measure(batchAssignSystem)
    batchAssignSystem(this._world, this._effectTraits)
    end()

    end = measure(batchReassignSystem)
    batchReassignSystem(this._world, this._effectTraits)
    end()

    end = measure(batchRemoveSystem)
    batchRemoveSystem(this._world)
    end()

    // Buffer sync systems (Changed-driven — color and flip change rarely)
    end = measure(bufferSyncColorSystem)
    bufferSyncColorSystem(this._world)
    end()

    // UV sync is folded into transformSyncSystem (unconditional, no change detection)

    end = measure(bufferSyncFlipSystem)
    bufferSyncFlipSystem(this._world)
    end()

    if (this._effectTraits.size > 0) {
      end = measure(bufferSyncEffectSystem)
      bufferSyncEffectSystem(this._world, this._effectTraits)
      end()
    }

    // Transform sync (every frame when autoInvalidateTransforms is on)
    if (this.autoInvalidateTransforms) {
      end = measure(transformSyncSystem)
      transformSyncSystem(this._world)
      end()
    }

    // Scene graph sync
    end = measure(sceneGraphSyncSystem)
    sceneGraphSyncSystem(this._world, this, this._parentAdd, this._parentRemove)
    end()
  }

  /**
   * Track a material for schema version detection.
   */
  private _trackMaterial(sprite: Sprite2D): void {
    const mat = sprite.material
    if (!this._world) return
    const registryEntities = this._world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return
    registry.materialRefs.set(mat.batchId, {
      material: mat,
      version: mat._effectSchemaVersion,
    })
  }

  /**
   * Check for material schema version changes (tier upgrades from effect registration).
   * When detected, triggers a full batch rebuild by removing and re-adding affected sprites.
   */
  private _checkMaterialVersions(): void {
    if (!this._world) return
    const registryEntities = this._world.query(BatchRegistry)
    if (registryEntities.length === 0) return
    const registry = registryEntities[0]!.get(BatchRegistry) as RegistryData | undefined
    if (!registry) return

    for (const [, ref] of registry.materialRefs) {
      if (ref.material._effectSchemaVersion !== ref.version) {
        ref.version = ref.material._effectSchemaVersion
        // Tier changed — batches for this material need rebuilding.
        // The batchAssignSystem and batchReassignSystem handle this
        // through the normal Changed() flow when sprites are re-enrolled.
        // For now, mark renderOrder dirty so scene graph syncs.
        registry.renderOrderDirty = true
      }
    }
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
      drawCalls: activeBatches.filter((b) => {
        const bm = b.get(BatchMesh)
        return bm?.mesh && !bm.mesh.isEmpty
      }).length,
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
    }

    this._spriteCount = 0
    this._effectTraits.clear()

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
