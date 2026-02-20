import { Group, type Object3D } from 'three'
import { createWorld, type World } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import { BatchManager } from './BatchManager'
import type { Renderer2DOptions, RenderStats } from './types'
import { DEFAULT_BATCH_SIZE } from './SpriteBatch'
import { assignWorld, type WorldProvider } from '../ecs/world'
import {
  batchPrepareSystem,
  bufferSyncColorSystem,
  bufferSyncUVSystem,
  bufferSyncFlipSystem,
  bufferSyncEffectSystem,
} from '../ecs/systems'

/**
 * 2D render pipeline with automatic batching and sorting.
 *
 * Add Renderer2D to your scene and add sprites to it.
 * Sprites are automatically batched by material and sorted by layer/zIndex.
 *
 * ECS systems run automatically in `updateMatrixWorld()`, which Three.js
 * calls during `renderer.render(scene, camera)`. No explicit `update()` needed.
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
   * Internal batch manager.
   */
  private _batchManager: BatchManager

  /**
   * ECS world for this renderer.
   * Lazily created on first access.
   */
  private _world: World | null = null

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

  constructor(options: Renderer2DOptions = {}) {
    super()

    this.name = 'Renderer2D'
    this.frustumCulled = false

    const maxBatchSize = options.maxBatchSize ?? DEFAULT_BATCH_SIZE
    this._batchManager = new BatchManager(maxBatchSize)

    this.autoSort = options.autoSort ?? true
    this.frustumCulling = options.frustumCulling ?? true
    this.autoInvalidateTransforms = options.autoInvalidateTransforms ?? true
  }

  /**
   * The ECS world managed by this renderer.
   * Sprites added to this renderer are enrolled in this world.
   */
  get world(): World {
    if (!this._world) this._world = createWorld()
    return this._world
  }

  /**
   * Add a sprite to the renderer.
   * Note: Named addSprite to avoid conflict with Group.add()
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
      this._batchManager.add(spriteOrObject)
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
      this._batchManager.add(sprite)
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
      this._batchManager.remove(spriteOrObject)
      spriteOrObject._unenrollFromWorld()
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
      this._batchManager.remove(sprite)
      sprite._unenrollFromWorld()
    }
    return this
  }

  /**
   * Mark a sprite as needing sort recalculation.
   * Call when sprite's layer or zIndex changes.
   * Note: Property changes (tint, alpha, etc.) don't need invalidation.
   */
  invalidate(sprite: Sprite2D): void {
    this._batchManager.invalidate(sprite)
  }

  /**
   * Mark all sprites as needing update.
   * Triggers sort recalculation and transform update.
   */
  invalidateAll(): void {
    this._batchManager.invalidateAll()
  }

  /**
   * Mark transforms as needing update.
   * Call when sprite positions/rotations/scales have changed.
   * Note: This is separate from property changes which write directly to buffers.
   */
  invalidateTransforms(): void {
    this._batchManager.invalidateTransforms()
  }

  /**
   * Three.js render hook — runs ECS systems and syncs buffers.
   *
   * Called automatically by Three.js during `renderer.render(scene, camera)`
   * before drawing children. This is the main integration point — no manual
   * `update()` call is needed.
   *
   * Per-frame flow:
   * 1. batchPrepareSystem — detects added/removed entities, layer/material changes
   * 2. BatchManager.prepare — sort, rebuild if needed, full sync on assignment
   * 3. bufferSyncColorSystem — Changed(SpriteColor) + IsBatched -> batch buffer write
   * 4. bufferSyncUVSystem — Changed(SpriteUV) + IsBatched -> batch buffer write
   * 5. bufferSyncFlipSystem — Changed(SpriteFlip) + IsBatched -> batch buffer write
   * 6. bufferSyncEffectSystem — Changed(effectTrait) + IsBatched -> packed buffer write
   * 7. BatchManager.upload — sync transforms to instance matrices
   * 8. _syncBatches — scene graph child management
   * 9. super.updateMatrixWorld() — continue Three.js traversal
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
   * Run all ECS systems and sync batches.
   */
  private _runSystems(): void {
    // Check ECS for batch-relevant changes (entity add/remove, layer/material changes)
    if (this._world && batchPrepareSystem(this._world)) {
      this._batchManager.markSortDirty()
    }

    // Auto-invalidate transforms if enabled
    if (this.autoInvalidateTransforms) {
      this._batchManager.invalidateTransforms()
    }

    // Prepare batches (sort if needed, also checks for material tier changes)
    this._batchManager.prepare()

    // ECS-driven buffer sync
    if (this._world) {
      bufferSyncColorSystem(this._world)
      bufferSyncUVSystem(this._world)
      bufferSyncFlipSystem(this._world)

      const effectTraits = this._batchManager.getEffectTraits()
      if (effectTraits.size > 0) {
        bufferSyncEffectSystem(this._world, effectTraits)
      }
    }

    // Upload batch data to GPU
    this._batchManager.upload()

    // Sync batches with scene graph
    this._syncBatches()
  }

  /**
   * Sync batch objects with the Three.js scene graph.
   */
  private _syncBatches(): void {
    const batches = this._batchManager.getBatches()

    // Remove old batch children
    // Note: We iterate backwards to avoid index shifting
    for (let i = this.children.length - 1; i >= 0; i--) {
      const child = this.children[i]
      // Remove if not in active batches (check by reference)
      if (child && !batches.some((batch) => batch === child)) {
        super.remove(child)
      }
    }

    // Add new batches and set renderOrder for proper layer sorting
    // Three.js uses renderOrder to determine draw order for transparent objects
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!
      batch.renderOrder = i
      if (!this.children.includes(batch)) {
        super.add(batch)
      }
    }
  }

  /**
   * Get render statistics.
   */
  get stats(): RenderStats {
    return this._batchManager.getStats()
  }

  /**
   * Get the number of sprites.
   */
  get spriteCount(): number {
    return this._batchManager.spriteCount
  }

  /**
   * Get the number of batches.
   */
  get batchCount(): number {
    return this._batchManager.batchCount
  }

  /**
   * Check if the renderer has any sprites.
   */
  get isEmpty(): boolean {
    return this._batchManager.isEmpty
  }

  /**
   * Clear all sprites.
   */
  override clear(): this {
    this._batchManager.clear()

    // Remove all children
    while (this.children.length > 0) {
      const child = this.children[0]
      if (child) {
        super.remove(child)
      }
    }

    return this
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this._batchManager.dispose()
    if (this._world) {
      this._world.destroy()
      this._world = null
    }
  }
}
