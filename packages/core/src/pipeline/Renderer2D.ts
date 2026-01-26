import { Group, type Object3D } from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import { BatchManager } from './BatchManager'
import type { Renderer2DOptions, RenderStats } from './types'
import { DEFAULT_BATCH_SIZE } from './SpriteBatch'

/**
 * 2D render pipeline with automatic batching and sorting.
 *
 * Add Renderer2D to your scene and add sprites to it.
 * Sprites are automatically batched by material and sorted by layer/zIndex.
 *
 * @example
 * ```typescript
 * const renderer2D = new Renderer2D()
 * scene.add(renderer2D)
 *
 * const sprite = new Sprite2D({ texture })
 * sprite.layer = Layers.ENTITIES
 * renderer2D.addSprite(sprite)
 *
 * // In render loop
 * renderer2D.update()
 * renderer.render(scene, camera)
 * ```
 */
export class Renderer2D extends Group {
  /**
   * Internal batch manager.
   */
  private _batchManager: BatchManager

  /**
   * Whether frustum culling is enabled.
   */
  frustumCulling: boolean

  /**
   * Whether auto-sorting is enabled.
   */
  autoSort: boolean

  constructor(options: Renderer2DOptions = {}) {
    super()

    this.name = 'Renderer2D'
    this.frustumCulled = false

    const maxBatchSize = options.maxBatchSize ?? DEFAULT_BATCH_SIZE
    this._batchManager = new BatchManager(maxBatchSize)

    this.autoSort = options.autoSort ?? true
    this.frustumCulling = options.frustumCulling ?? true
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
    // Check if it's a Sprite2D (has layer property)
    if ('layer' in spriteOrObject && 'zIndex' in spriteOrObject) {
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
    if ('layer' in spriteOrObject && 'zIndex' in spriteOrObject) {
      this._batchManager.remove(spriteOrObject)
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
    }
    return this
  }

  /**
   * Mark a sprite as needing update.
   * Call when sprite transform, layer, zIndex, or appearance changes.
   */
  invalidate(sprite: Sprite2D): void {
    this._batchManager.invalidate(sprite)
  }

  /**
   * Mark all sprites as needing update.
   */
  invalidateAll(): void {
    this._batchManager.invalidateAll()
  }

  /**
   * Update batches for rendering.
   * Call once per frame before rendering.
   */
  update(): void {
    // Prepare batches (sort and rebuild if needed)
    this._batchManager.prepare()

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
  }
}
