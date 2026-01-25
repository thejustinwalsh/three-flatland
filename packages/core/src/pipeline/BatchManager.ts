import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import { SpriteBatch, DEFAULT_BATCH_SIZE } from './SpriteBatch'
import { encodeSortKey } from './layers'
import type { SpriteEntry, RenderStats } from './types'

/**
 * Manages sprite batching and sorting.
 *
 * Groups sprites by material identity, sorts by layer/material/zIndex,
 * and maintains batch pools for efficient reuse.
 */
export class BatchManager {
  /**
   * All registered sprites.
   */
  private _sprites: Map<Sprite2D, SpriteEntry> = new Map()

  /**
   * Batches grouped by material ID.
   */
  private _batchesByMaterial: Map<number, SpriteBatch[]> = new Map()

  /**
   * Pool of unused batches for reuse.
   */
  private _batchPool: SpriteBatch[] = []

  /**
   * Active batches (sorted order for rendering).
   */
  private _activeBatches: SpriteBatch[] = []

  /**
   * Whether sorting/batching needs to be recalculated.
   */
  private _dirty: boolean = false

  /**
   * Maximum sprites per batch.
   */
  private _maxBatchSize: number

  /**
   * Render statistics.
   */
  private _stats: RenderStats = {
    spriteCount: 0,
    batchCount: 0,
    drawCalls: 0,
    visibleSprites: 0,
  }

  constructor(maxBatchSize: number = DEFAULT_BATCH_SIZE) {
    this._maxBatchSize = maxBatchSize
  }

  /**
   * Add a sprite to the batch manager.
   */
  add(sprite: Sprite2D): void {
    if (this._sprites.has(sprite)) return

    const entry: SpriteEntry = {
      sprite,
      sortKey: this._computeSortKey(sprite),
      dirty: true,
    }

    this._sprites.set(sprite, entry)
    this._dirty = true
  }

  /**
   * Remove a sprite from the batch manager.
   */
  remove(sprite: Sprite2D): void {
    if (!this._sprites.has(sprite)) return

    this._sprites.delete(sprite)
    this._dirty = true
  }

  /**
   * Mark a sprite as needing update.
   * Call when sprite transform, layer, zIndex, or appearance changes.
   */
  invalidate(sprite: Sprite2D): void {
    const entry = this._sprites.get(sprite)
    if (!entry) return

    const newSortKey = this._computeSortKey(sprite)
    if (entry.sortKey !== newSortKey) {
      entry.sortKey = newSortKey
      this._dirty = true
    }
    entry.dirty = true
  }

  /**
   * Mark all sprites as needing update.
   */
  invalidateAll(): void {
    for (const entry of this._sprites.values()) {
      entry.sortKey = this._computeSortKey(entry.sprite)
      entry.dirty = true
    }
    this._dirty = true
  }

  /**
   * Compute sort key for a sprite.
   */
  private _computeSortKey(sprite: Sprite2D): number {
    const batchId = sprite.material.batchId
    return encodeSortKey(sprite.layer, batchId, sprite.zIndex)
  }

  /**
   * Prepare batches for rendering.
   * Sorts sprites and rebuilds batches if dirty.
   */
  prepare(): void {
    if (!this._dirty) {
      // Just update dirty sprites in existing batches
      this._updateDirtySprites()
      return
    }

    // Clear active batches
    this._recycleBatches()

    // Sort sprites by sort key
    const entries = Array.from(this._sprites.values())
    entries.sort((a, b) => a.sortKey - b.sortKey)

    // Group into batches by material AND layer
    // We must break batches on layer changes because GPU instance order is undefined,
    // so sprites from different layers in the same batch would have incorrect draw order.
    let currentMaterialId = -1
    let currentLayer = -1
    let currentBatch: SpriteBatch | null = null

    for (const entry of entries) {
      const sprite = entry.sprite
      const batchId = sprite.material.batchId
      const layer = sprite.layer

      // Start new batch on material change, layer change, or when batch is full
      if (batchId !== currentMaterialId || layer !== currentLayer || !currentBatch || currentBatch.isFull) {
        currentBatch = this._getOrCreateBatch(sprite.material)
        currentMaterialId = batchId
        currentLayer = layer
      }

      currentBatch.addSprite(sprite)
      entry.dirty = false
    }

    this._dirty = false
    this._updateStats()
  }

  /**
   * Update only dirty sprites without rebuilding batches.
   */
  private _updateDirtySprites(): void {
    // For now, rebuild all batches when any sprite is dirty
    // A more optimized approach would track which batches contain dirty sprites
    let hasDirty = false
    for (const entry of this._sprites.values()) {
      if (entry.dirty) {
        hasDirty = true
        entry.dirty = false
      }
    }

    if (hasDirty) {
      for (const batch of this._activeBatches) {
        batch.rebuild()
      }
    }
  }

  /**
   * Get or create a batch for the given material.
   */
  private _getOrCreateBatch(material: Sprite2DMaterial): SpriteBatch {
    // Try to get from pool first
    let batch = this._batchPool.pop()

    if (batch) {
      // Pooled batch might have different material - dispose and recreate if needed
      if (batch.spriteMaterial.batchId !== material.batchId) {
        batch.dispose()
        batch = new SpriteBatch(material, this._maxBatchSize)
      } else {
        batch.clearSprites()
      }
    } else {
      batch = new SpriteBatch(material, this._maxBatchSize)
    }

    this._activeBatches.push(batch)

    // Track by material ID
    const materialBatches = this._batchesByMaterial.get(material.batchId)
    if (materialBatches) {
      materialBatches.push(batch)
    } else {
      this._batchesByMaterial.set(material.batchId, [batch])
    }

    return batch
  }

  /**
   * Recycle all active batches to the pool.
   */
  private _recycleBatches(): void {
    for (const batch of this._activeBatches) {
      batch.clearSprites()
      this._batchPool.push(batch)
    }
    this._activeBatches.length = 0
    this._batchesByMaterial.clear()
  }

  /**
   * Upload all batch data to GPU.
   */
  upload(): void {
    for (const batch of this._activeBatches) {
      batch.upload()
    }
  }

  /**
   * Get active batches for rendering.
   * Batches are already sorted by layer/material/zIndex.
   */
  getBatches(): readonly SpriteBatch[] {
    return this._activeBatches
  }

  /**
   * Get render statistics.
   */
  getStats(): RenderStats {
    return { ...this._stats }
  }

  /**
   * Update internal statistics.
   */
  private _updateStats(): void {
    this._stats.spriteCount = this._sprites.size
    this._stats.batchCount = this._activeBatches.length
    this._stats.drawCalls = this._activeBatches.filter((b) => !b.isEmpty).length
    this._stats.visibleSprites = this._activeBatches.reduce((sum, b) => sum + b.spriteCount, 0)
  }

  /**
   * Check if the manager has any sprites.
   */
  get isEmpty(): boolean {
    return this._sprites.size === 0
  }

  /**
   * Get the total number of sprites.
   */
  get spriteCount(): number {
    return this._sprites.size
  }

  /**
   * Get the number of active batches.
   */
  get batchCount(): number {
    return this._activeBatches.length
  }

  /**
   * Clear all sprites and batches.
   */
  clear(): void {
    this._sprites.clear()
    this._recycleBatches()

    // Dispose pooled batches
    for (const batch of this._batchPool) {
      batch.dispose()
    }
    this._batchPool.length = 0

    this._dirty = false
    this._updateStats()
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clear()
  }
}
