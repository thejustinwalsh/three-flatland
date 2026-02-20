import type { Trait } from 'koota'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { MaterialEffect } from '../materials/MaterialEffect'
import { SpriteBatch, DEFAULT_BATCH_SIZE } from './SpriteBatch'
import { encodeSortKey } from './layers'
import type { SpriteEntry, RenderStats } from './types'

/**
 * Manages sprite batching and sorting.
 *
 * Groups sprites by material identity, sorts by layer/material/zIndex,
 * and maintains batch pools for efficient reuse.
 *
 * With the shared buffer architecture, sprites write directly to batch buffers.
 * BatchManager only handles:
 * - Adding/removing sprites from batches
 * - Sorting and reordering when layer/zIndex changes
 * - Transform updates (safest to read from sprites)
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
  private _sortDirty: boolean = false

  /**
   * Whether transforms need to be re-read.
   */
  private _transformsDirty: boolean = false

  /**
   * Material references for version tracking.
   * Used to detect tier changes that require batch rebuild.
   */
  private _materialRefs: Map<number, { material: Sprite2DMaterial; version: number }> = new Map()

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
      dirty: false, // Not used for property changes anymore, only for sort changes
    }

    this._sprites.set(sprite, entry)
    this._sortDirty = true

    // Track material for version detection
    const mat = sprite.material
    this._materialRefs.set(mat.batchId, {
      material: mat,
      version: mat._effectSchemaVersion,
    })
  }

  /**
   * Remove a sprite from the batch manager.
   */
  remove(sprite: Sprite2D): void {
    if (!this._sprites.has(sprite)) return

    // Remove from its current batch
    if (sprite._batchTarget) {
      // Find the batch and remove
      for (const batch of this._activeBatches) {
        if (batch === sprite._batchTarget) {
          batch.removeSprite(sprite)
          break
        }
      }
    }

    this._sprites.delete(sprite)
    this._sortDirty = true
  }

  /**
   * Mark a sprite as needing sort recalculation.
   * Call when sprite's layer or zIndex changes.
   */
  invalidate(sprite: Sprite2D): void {
    const entry = this._sprites.get(sprite)
    if (!entry) return

    const newSortKey = this._computeSortKey(sprite)
    if (entry.sortKey !== newSortKey) {
      entry.sortKey = newSortKey
      this._sortDirty = true
    }
  }

  /**
   * Mark all sprites as needing update.
   * Triggers sort recalculation and transform update.
   */
  invalidateAll(): void {
    for (const entry of this._sprites.values()) {
      entry.sortKey = this._computeSortKey(entry.sprite)
    }
    this._sortDirty = true
    this._transformsDirty = true
  }

  /**
   * Mark transforms as needing update (for position/rotation/scale changes).
   */
  invalidateTransforms(): void {
    this._transformsDirty = true
  }

  /**
   * Compute sort key for a sprite.
   */
  private _computeSortKey(sprite: Sprite2D): number {
    const batchId = sprite.material.batchId
    return encodeSortKey(sprite.layer, batchId, sprite.zIndex)
  }

  /**
   * Mark sort as dirty, forcing a batch rebuild on next prepare().
   * Used when external changes (tier upgrades, ECS events) require resorting.
   */
  markSortDirty(): void {
    this._sortDirty = true
  }

  /**
   * Prepare batches for rendering.
   * Checks for material schema changes, sorts sprites, and rebuilds batches if needed.
   */
  prepare(): void {
    // Check for material schema changes (tier upgrades from effect registration)
    if (!this._sortDirty) {
      for (const [batchId, ref] of this._materialRefs) {
        if (ref.material._effectSchemaVersion !== ref.version) {
          ref.version = ref.material._effectSchemaVersion
          this._sortDirty = true
          break
        }
      }
    }

    if (this._sortDirty) {
      this._rebuildBatches()
      this._sortDirty = false
    }

    // Mark all batches as needing transform update
    if (this._transformsDirty) {
      for (const batch of this._activeBatches) {
        batch.invalidateTransforms()
      }
      this._transformsDirty = false
    }
  }

  /**
   * Rebuild all batches with proper sorting.
   */
  private _rebuildBatches(): void {
    // Detach all sprites from current batches and recycle batches
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

      // Add sprite to batch - it will sync its state to batch buffers
      currentBatch.addSprite(sprite)
    }

    this._updateStats()
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

    this._materialRefs.clear()
    this._sortDirty = false
    this._transformsDirty = false
    this._updateStats()
  }

  /**
   * Get all effect traits across all registered materials.
   * Used by Renderer2D to determine which effect traits to query for buffer sync.
   */
  getEffectTraits(): Map<Trait, typeof MaterialEffect> {
    const traits = new Map<Trait, typeof MaterialEffect>()
    for (const { material } of this._materialRefs.values()) {
      for (const effectClass of material.getEffects()) {
        traits.set(effectClass._trait, effectClass)
      }
    }
    return traits
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clear()
  }
}
