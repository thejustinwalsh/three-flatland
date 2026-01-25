import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  Matrix4,
  Vector3,
  Box3,
} from 'three'
import { TileChunkMaterial } from './TileChunkMaterial'
import type { Tileset } from './Tileset'
import type { TileInstance, ChunkCoord } from './types'

/**
 * A chunk of tiles rendered as an InstancedMesh.
 *
 * Each chunk manages a fixed region of tiles for efficient
 * culling and GPU upload. Chunks use instanced rendering where
 * each tile is an instance with its own UV coordinates.
 *
 * @example
 * ```typescript
 * const chunk = new TileChunk({
 *   coord: { x: 0, y: 0 },
 *   size: 16,
 *   tileWidth: 16,
 *   tileHeight: 16,
 *   tileset: myTileset,
 * })
 *
 * chunk.setTiles(tiles, tileset)
 * chunk.upload()
 * scene.add(chunk.mesh)
 * ```
 */
export class TileChunk {
  /** Chunk coordinates (in chunk units) */
  readonly coord: ChunkCoord

  /** Chunk size in tiles (e.g., 16 means 16x16 tiles) */
  readonly size: number

  /** Tile dimensions in pixels/world units */
  readonly tileWidth: number
  readonly tileHeight: number

  /** The instanced mesh for rendering */
  readonly mesh: InstancedMesh

  /** The material used by this chunk */
  readonly material: TileChunkMaterial

  /** Bounding box for frustum culling (in world space) */
  readonly bounds: Box3

  /** Maximum tiles in this chunk */
  private maxTiles: number

  /** Current tile count */
  private _count: number = 0

  /** Instance UV buffer (4 floats per tile: x, y, width, height) */
  private uvOffsets: Float32Array

  /** Whether the chunk needs GPU upload */
  private _dirty: boolean = false

  /** Reusable matrix for transforms */
  private static tempMatrix = new Matrix4()
  private static tempScale = new Vector3()

  constructor(
    coord: ChunkCoord,
    size: number,
    tileWidth: number,
    tileHeight: number,
    tileset: Tileset
  ) {
    this.coord = coord
    this.size = size
    this.tileWidth = tileWidth
    this.tileHeight = tileHeight
    this.maxTiles = size * size

    // Create geometry (1x1 plane, scaled per-instance)
    const geometry = new PlaneGeometry(1, 1)

    // Allocate instance UV buffer
    this.uvOffsets = new Float32Array(this.maxTiles * 4)

    // Add instance UV attribute
    const uvAttr = new InstancedBufferAttribute(this.uvOffsets, 4)
    uvAttr.setUsage(DynamicDrawUsage)
    geometry.setAttribute('instanceUV', uvAttr)

    // Create material
    this.material = new TileChunkMaterial({
      map: tileset.texture!,
    })

    // Create instanced mesh
    this.mesh = new InstancedMesh(geometry, this.material, this.maxTiles)
    this.mesh.frustumCulled = true
    this.mesh.count = 0

    // Position the mesh group at chunk origin
    const worldX = coord.x * size * tileWidth
    const worldY = coord.y * size * tileHeight
    this.mesh.position.set(worldX, worldY, 0)

    // Calculate bounding box for culling
    this.bounds = new Box3(
      new Vector3(worldX, worldY, 0),
      new Vector3(worldX + size * tileWidth, worldY + size * tileHeight, 0)
    )
  }

  /**
   * Check if chunk contains a world position.
   */
  containsWorldPosition(x: number, y: number): boolean {
    return (
      x >= this.bounds.min.x &&
      x < this.bounds.max.x &&
      y >= this.bounds.min.y &&
      y < this.bounds.max.y
    )
  }

  /**
   * Clear all tiles from the chunk.
   */
  clear(): void {
    this._count = 0
    this._dirty = true
  }

  /**
   * Set tiles from an array of tile instances.
   */
  setTiles(tiles: TileInstance[], tileset: Tileset): void {
    this._count = Math.min(tiles.length, this.maxTiles)

    for (let i = 0; i < this._count; i++) {
      const tile = tiles[i]!

      // Calculate local position within chunk (relative to chunk origin)
      const localX = tile.x - this.coord.x * this.size * this.tileWidth
      const localY = tile.y - this.coord.y * this.size * this.tileHeight

      // Build transform matrix
      // Position at tile center, scaled to tile size
      TileChunk.tempMatrix.identity()
      TileChunk.tempMatrix.makeTranslation(
        localX + this.tileWidth / 2,
        localY + this.tileHeight / 2,
        0
      )

      // Apply scale (with flip)
      const scaleX = (tile.flipH ? -1 : 1) * this.tileWidth
      const scaleY = (tile.flipV ? -1 : 1) * this.tileHeight
      TileChunk.tempScale.set(scaleX, scaleY, 1)
      TileChunk.tempMatrix.scale(TileChunk.tempScale)

      this.mesh.setMatrixAt(i, TileChunk.tempMatrix)

      // Get UV for this tile
      const uv = tileset.getUV(tile.gid)

      // Store UV data
      // For flipped tiles, we adjust the UV offset and use negative size
      let uvX = uv.x
      let uvY = uv.y
      let uvW = uv.width
      let uvH = uv.height

      if (tile.flipH) {
        uvX = uv.x + uv.width
        uvW = -uv.width
      }
      if (tile.flipV) {
        uvY = uv.y + uv.height
        uvH = -uv.height
      }

      this.uvOffsets[i * 4] = uvX
      this.uvOffsets[i * 4 + 1] = uvY
      this.uvOffsets[i * 4 + 2] = uvW
      this.uvOffsets[i * 4 + 3] = uvH
    }

    this._dirty = true
  }

  /**
   * Update specific tiles for animation.
   */
  updateAnimatedTiles(
    animatedPositions: Map<number, { gid: number; index: number }>,
    tileset: Tileset
  ): void {
    for (const [, data] of animatedPositions) {
      const uv = tileset.getUV(data.gid)
      const i = data.index

      this.uvOffsets[i * 4] = uv.x
      this.uvOffsets[i * 4 + 1] = uv.y
      this.uvOffsets[i * 4 + 2] = uv.width
      this.uvOffsets[i * 4 + 3] = uv.height
    }

    if (animatedPositions.size > 0) {
      this._dirty = true
    }
  }

  /**
   * Upload buffer data to GPU.
   * Call after adding/modifying tiles and before rendering.
   */
  upload(): void {
    if (!this._dirty) return

    this.mesh.count = this._count

    if (this._count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true

      const uvAttr = this.mesh.geometry.getAttribute(
        'instanceUV'
      ) as InstancedBufferAttribute
      uvAttr.needsUpdate = true
    }

    this._dirty = false
  }

  /**
   * Get current tile count.
   */
  get tileCount(): number {
    return this._count
  }

  /**
   * Check if chunk needs GPU upload.
   */
  get dirty(): boolean {
    return this._dirty
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
