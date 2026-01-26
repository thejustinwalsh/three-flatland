import { Group } from 'three'
import { TileChunk } from './TileChunk'
import type { Tileset } from './Tileset'
import type { TileLayerData, TileInstance, ChunkCoord } from './types'

/**
 * A layer of tiles in a tilemap.
 *
 * Manages chunked rendering and animated tiles. Each layer is a Three.js Group
 * containing TileChunk meshes for efficient rendering.
 *
 * @example
 * ```typescript
 * const layer = new TileLayer(
 *   layerData,
 *   tileset,
 *   16, // tileWidth
 *   16, // tileHeight
 *   16  // chunkSize
 * )
 *
 * scene.add(layer)
 *
 * // In update loop
 * layer.update(deltaMs)
 * ```
 */
export class TileLayer extends Group {
  /** Layer data */
  readonly data: TileLayerData

  /** Chunk size in tiles */
  readonly chunkSize: number

  /** Tile dimensions */
  readonly tileWidth: number
  readonly tileHeight: number

  /** Chunks (keyed by "x,y") */
  private chunks: Map<string, TileChunk> = new Map()

  /** Tileset reference */
  private tileset: Tileset

  /**
   * Animated tile tracking.
   * Maps tile array index to animation data.
   */
  private animatedTilePositions: Map<
    number,
    {
      gid: number
      baseGid: number
      chunkKey: string
      index: number
    }
  > = new Map()

  /** Animation state (keyed by base GID) */
  private animationTimers: Map<number, { elapsed: number; frameIndex: number }> = new Map()

  constructor(
    data: TileLayerData,
    tileset: Tileset,
    tileWidth: number,
    tileHeight: number,
    chunkSize: number = 16
  ) {
    super()

    this.data = data
    this.tileset = tileset
    this.tileWidth = tileWidth
    this.tileHeight = tileHeight
    this.chunkSize = chunkSize

    this.name = data.name
    this.visible = data.visible ?? true

    if (data.offset) {
      this.position.set(data.offset.x, data.offset.y, 0)
    }

    if (data.opacity !== undefined) {
      // Opacity would need to be applied to material
      // For now, we don't support per-layer opacity
    }

    // Build chunks from tile data
    this.buildChunks()
  }

  /**
   * Build chunks from tile data.
   */
  private buildChunks(): void {
    const { width, height, data } = this.data

    // Group tiles by chunk
    const chunkTiles = new Map<string, TileInstance[]>()

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        const rawGid = data[index]!

        // Skip empty tiles
        if (rawGid === 0) continue

        // Extract flip flags (stored in high bits per Tiled format)
        const flipH = (rawGid & 0x80000000) !== 0
        const flipV = (rawGid & 0x40000000) !== 0
        const flipD = (rawGid & 0x20000000) !== 0
        const gid = rawGid & 0x1fffffff

        // Calculate chunk coordinates
        const chunkX = Math.floor(x / this.chunkSize)
        const chunkY = Math.floor(y / this.chunkSize)
        const chunkKey = `${chunkX},${chunkY}`

        // Calculate world position (Y-up, so we flip Y from Tiled's Y-down)
        const worldX = x * this.tileWidth
        const worldY = (height - 1 - y) * this.tileHeight

        const tile: TileInstance = {
          x: worldX,
          y: worldY,
          gid,
          flipH,
          flipV,
          flipD,
        }

        if (!chunkTiles.has(chunkKey)) {
          chunkTiles.set(chunkKey, [])
        }
        chunkTiles.get(chunkKey)!.push(tile)

        // Track animated tiles
        if (this.tileset.isAnimated(gid)) {
          const animation = this.tileset.getAnimation(gid)!
          const tileIndex = chunkTiles.get(chunkKey)!.length - 1

          this.animatedTilePositions.set(index, {
            gid: animation[0]!.tileId + this.tileset.firstGid,
            baseGid: gid,
            chunkKey,
            index: tileIndex,
          })

          // Initialize animation timer
          if (!this.animationTimers.has(gid)) {
            this.animationTimers.set(gid, { elapsed: 0, frameIndex: 0 })
          }
        }
      }
    }

    // Create chunks (adjust Y for Y-up coordinate system)
    for (const [key, tiles] of chunkTiles) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]

      // Convert chunk Y to world space (flip)
      const maxChunkY = Math.ceil(this.data.height / this.chunkSize) - 1
      const worldChunkY = maxChunkY - cy

      const coord: ChunkCoord = { x: cx, y: worldChunkY }

      const chunk = new TileChunk(
        coord,
        this.chunkSize,
        this.tileWidth,
        this.tileHeight,
        this.tileset
      )

      chunk.setTiles(tiles, this.tileset)
      chunk.upload()

      this.chunks.set(key, chunk)
      this.add(chunk.mesh)
    }
  }

  /**
   * Update animated tiles.
   */
  update(deltaMs: number): void {
    if (this.animatedTilePositions.size === 0) return

    // Update animation timers
    const changedGids = new Set<number>()

    for (const [gid, timer] of this.animationTimers) {
      const animation = this.tileset.getAnimation(gid)
      if (!animation) continue

      timer.elapsed += deltaMs
      const currentFrame = animation[timer.frameIndex]!

      if (timer.elapsed >= currentFrame.duration) {
        timer.elapsed -= currentFrame.duration
        timer.frameIndex = (timer.frameIndex + 1) % animation.length
        changedGids.add(gid)
      }
    }

    if (changedGids.size === 0) return

    // Group updates by chunk
    const chunkUpdates = new Map<string, Map<number, { gid: number; index: number }>>()

    for (const [, data] of this.animatedTilePositions) {
      if (!changedGids.has(data.baseGid)) continue

      const timer = this.animationTimers.get(data.baseGid)!
      const animation = this.tileset.getAnimation(data.baseGid)!
      const newGid = animation[timer.frameIndex]!.tileId + this.tileset.firstGid

      if (!chunkUpdates.has(data.chunkKey)) {
        chunkUpdates.set(data.chunkKey, new Map())
      }
      chunkUpdates.get(data.chunkKey)!.set(data.index, {
        gid: newGid,
        index: data.index,
      })

      data.gid = newGid
    }

    // Apply updates to chunks
    for (const [chunkKey, updates] of chunkUpdates) {
      const chunk = this.chunks.get(chunkKey)
      if (chunk) {
        chunk.updateAnimatedTiles(updates, this.tileset)
        chunk.upload()
      }
    }
  }

  /**
   * Get tile GID at position (in tiles, using original Tiled coordinates).
   */
  getTileAt(tileX: number, tileY: number): number {
    const { width, height, data } = this.data
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return 0
    }
    const index = tileY * width + tileX
    return (data[index] ?? 0) & 0x1fffffff
  }

  /**
   * Set tile GID at position (in tiles).
   */
  setTileAt(tileX: number, tileY: number, gid: number): void {
    const { width, height, data } = this.data
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return
    }

    const index = tileY * width + tileX
    data[index] = gid

    // Rebuild affected chunk
    const chunkX = Math.floor(tileX / this.chunkSize)
    const chunkY = Math.floor(tileY / this.chunkSize)
    this.rebuildChunk(chunkX, chunkY)
  }

  /**
   * Rebuild a specific chunk.
   */
  private rebuildChunk(chunkX: number, chunkY: number): void {
    const chunkKey = `${chunkX},${chunkY}`
    const { width, height, data } = this.data

    // Gather tiles for this chunk
    const tiles: TileInstance[] = []
    const startX = chunkX * this.chunkSize
    const startY = chunkY * this.chunkSize
    const endX = Math.min(startX + this.chunkSize, width)
    const endY = Math.min(startY + this.chunkSize, height)

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = y * width + x
        const rawGid = data[index]!

        if (rawGid === 0) continue

        const flipH = (rawGid & 0x80000000) !== 0
        const flipV = (rawGid & 0x40000000) !== 0
        const flipD = (rawGid & 0x20000000) !== 0
        const gid = rawGid & 0x1fffffff

        // Convert to world space (Y-up)
        const worldX = x * this.tileWidth
        const worldY = (height - 1 - y) * this.tileHeight

        tiles.push({
          x: worldX,
          y: worldY,
          gid,
          flipH,
          flipV,
          flipD,
        })
      }
    }

    // Update or create chunk
    let chunk = this.chunks.get(chunkKey)

    if (!chunk && tiles.length > 0) {
      const maxChunkY = Math.ceil(height / this.chunkSize) - 1
      const worldChunkY = maxChunkY - chunkY

      chunk = new TileChunk(
        { x: chunkX, y: worldChunkY },
        this.chunkSize,
        this.tileWidth,
        this.tileHeight,
        this.tileset
      )
      this.chunks.set(chunkKey, chunk)
      this.add(chunk.mesh)
    }

    if (chunk) {
      if (tiles.length > 0) {
        chunk.setTiles(tiles, this.tileset)
        chunk.upload()
      } else {
        // Remove empty chunk
        this.remove(chunk.mesh)
        chunk.dispose()
        this.chunks.delete(chunkKey)
      }
    }
  }

  /**
   * Get the number of chunks in this layer.
   */
  get chunkCount(): number {
    return this.chunks.size
  }

  /**
   * Get total tile count across all chunks.
   */
  get tileCount(): number {
    let count = 0
    for (const chunk of this.chunks.values()) {
      count += chunk.tileCount
    }
    return count
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose()
    }
    this.chunks.clear()
    this.animatedTilePositions.clear()
    this.animationTimers.clear()
  }
}
