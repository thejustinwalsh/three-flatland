import {
  Group,
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  Matrix4,
  Vector3,
} from 'three'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { Tileset } from './Tileset'
import type { TileLayerData } from './types'

/** Internal per-chunk data */
interface ChunkData {
  mesh: InstancedMesh
  instanceUV: Float32Array
  instanceColor: Float32Array
  instanceFlip: Float32Array
  instanceCount: number
}

/**
 * A layer of tiles in a tilemap.
 *
 * Splits tiles into regional chunks for frustum culling, each rendered as a
 * single InstancedMesh with Sprite2DMaterial. Maps up to chunkSize×chunkSize
 * tiles naturally collapse into one chunk (one draw call).
 *
 * @example
 * ```typescript
 * const layer = new TileLayer(
 *   layerData,
 *   tileset,
 *   16, // tileWidth
 *   16, // tileHeight
 * )
 *
 * scene.add(layer)
 *
 * // In update loop
 * layer.update(deltaMs)
 *
 * // Access material for effects
 * layer.material.colorNode = myCustomEffect
 * ```
 */
export class TileLayer extends Group {
  /** Layer data */
  readonly data: TileLayerData

  /** Tile dimensions */
  readonly tileWidth: number
  readonly tileHeight: number

  /** Chunk size in tiles (e.g., 256 means 256×256 tiles per chunk) */
  readonly chunkSize: number

  /** The Sprite2DMaterial used for rendering (apply effects here) */
  readonly material: Sprite2DMaterial

  /** Tileset reference */
  private tileset: Tileset

  /** Chunks keyed by "cx,cy" */
  private chunks: Map<string, ChunkData> = new Map()

  /** Total instance count across all chunks */
  private _totalInstanceCount: number = 0

  /**
   * Maps data array index -> { chunkKey, instanceIndex }.
   * Only non-empty tiles have entries.
   */
  private tileIndexMap: Map<number, { chunkKey: string; instanceIndex: number }> = new Map()

  /**
   * Animated tile tracking.
   * Maps tile data array index to animation data.
   */
  private animatedTilePositions: Map<
    number,
    {
      gid: number
      baseGid: number
      chunkKey: string
      instanceIndex: number
    }
  > = new Map()

  /** Animation state (keyed by base GID) */
  private animationTimers: Map<number, { elapsed: number; frameIndex: number }> = new Map()

  /** Reusable matrix for transforms */
  private static tempMatrix = new Matrix4()
  private static tempScale = new Vector3()

  constructor(
    data: TileLayerData,
    tileset: Tileset,
    tileWidth: number,
    tileHeight: number,
    chunkSize: number = 256
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

    // Create material with premultiplied alpha (no Discard needed)
    this.material = new Sprite2DMaterial({
      map: tileset.texture ?? undefined,
      premultipliedAlpha: true,
    })

    // Build chunked instanced meshes from tile data
    this.buildInstances()
  }

  /**
   * Build chunked instanced meshes from tile data.
   */
  private buildInstances(): void {
    // Dispose existing chunks
    for (const chunk of this.chunks.values()) {
      this.remove(chunk.mesh)
      chunk.mesh.geometry.dispose()
    }
    this.chunks.clear()
    this.tileIndexMap.clear()
    this.animatedTilePositions.clear()
    this.animationTimers.clear()
    this._totalInstanceCount = 0

    const { width, height, data } = this.data

    // Group tiles by chunk
    const chunkTiles = new Map<
      string,
      Array<{
        dataIndex: number
        x: number
        y: number
        gid: number
        flipH: boolean
        flipV: boolean
        flipD: boolean
      }>
    >()

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x
        const rawGid = data[index]!
        if (rawGid === 0) continue

        const flipH = (rawGid & 0x80000000) !== 0
        const flipV = (rawGid & 0x40000000) !== 0
        const flipD = (rawGid & 0x20000000) !== 0
        const gid = rawGid & 0x1fffffff

        // World position (Y-up, Tiled is Y-down)
        const worldX = x * this.tileWidth
        const worldY = (height - 1 - y) * this.tileHeight

        const cx = Math.floor(x / this.chunkSize)
        const cy = Math.floor(y / this.chunkSize)
        const chunkKey = `${cx},${cy}`

        if (!chunkTiles.has(chunkKey)) {
          chunkTiles.set(chunkKey, [])
        }
        chunkTiles.get(chunkKey)!.push({
          dataIndex: index,
          x: worldX,
          y: worldY,
          gid,
          flipH,
          flipV,
          flipD,
        })
      }
    }

    // Create an InstancedMesh per chunk
    for (const [chunkKey, tiles] of chunkTiles) {
      const count = tiles.length

      // Allocate buffers
      const instanceUV = new Float32Array(count * 4)
      const instanceColor = new Float32Array(count * 4)
      const instanceFlip = new Float32Array(count * 2)

      // Create geometry with instance attributes
      const geometry = new PlaneGeometry(1, 1)

      const uvAttr = new InstancedBufferAttribute(instanceUV, 4)
      uvAttr.setUsage(DynamicDrawUsage)
      geometry.setAttribute('instanceUV', uvAttr)

      const colorAttr = new InstancedBufferAttribute(instanceColor, 4)
      colorAttr.setUsage(DynamicDrawUsage)
      geometry.setAttribute('instanceColor', colorAttr)

      const flipAttr = new InstancedBufferAttribute(instanceFlip, 2)
      flipAttr.setUsage(DynamicDrawUsage)
      geometry.setAttribute('instanceFlip', flipAttr)

      // Track bounds for frustum culling
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      // Populate buffers
      for (let i = 0; i < count; i++) {
        const tile = tiles[i]!

        // Map data index -> chunk location
        this.tileIndexMap.set(tile.dataIndex, { chunkKey, instanceIndex: i })

        // UV with Y-correction: Tiled Y-down -> Three.js Y-up
        const uv = this.tileset.getUV(tile.gid)
        instanceUV[i * 4 + 0] = uv.x
        instanceUV[i * 4 + 1] = uv.y + uv.height // bottom of tile in atlas
        instanceUV[i * 4 + 2] = uv.width
        instanceUV[i * 4 + 3] = -uv.height // negative = Y-flip correction

        // Color: white, fully opaque
        instanceColor[i * 4 + 0] = 1
        instanceColor[i * 4 + 1] = 1
        instanceColor[i * 4 + 2] = 1
        instanceColor[i * 4 + 3] = 1

        // Flip via instanceFlip attribute
        instanceFlip[i * 2 + 0] = tile.flipH ? -1 : 1
        instanceFlip[i * 2 + 1] = tile.flipV ? -1 : 1

        // Expand bounds
        minX = Math.min(minX, tile.x)
        minY = Math.min(minY, tile.y)
        maxX = Math.max(maxX, tile.x + this.tileWidth)
        maxY = Math.max(maxY, tile.y + this.tileHeight)

        // Track animated tiles
        if (this.tileset.isAnimated(tile.gid)) {
          const animation = this.tileset.getAnimation(tile.gid)!
          this.animatedTilePositions.set(tile.dataIndex, {
            gid: animation[0]!.tileId + this.tileset.firstGid,
            baseGid: tile.gid,
            chunkKey,
            instanceIndex: i,
          })

          if (!this.animationTimers.has(tile.gid)) {
            this.animationTimers.set(tile.gid, { elapsed: 0, frameIndex: 0 })
          }
        }
      }

      // Create instanced mesh
      const mesh = new InstancedMesh(geometry, this.material, count)
      mesh.frustumCulled = true
      mesh.count = count

      // Set instance matrices
      for (let i = 0; i < count; i++) {
        const tile = tiles[i]!
        TileLayer.tempMatrix.identity()
        TileLayer.tempMatrix.makeTranslation(
          tile.x + this.tileWidth / 2,
          tile.y + this.tileHeight / 2,
          0
        )
        TileLayer.tempScale.set(this.tileWidth, this.tileHeight, 1)
        TileLayer.tempMatrix.scale(TileLayer.tempScale)
        mesh.setMatrixAt(i, TileLayer.tempMatrix)
      }
      mesh.instanceMatrix.needsUpdate = true

      // Compute bounding sphere from instance matrices for frustum culling.
      // Must be set on the mesh (not geometry) — InstancedMesh.boundingSphere
      // takes priority over geometry.boundingSphere in Frustum.intersectsObject().
      mesh.computeBoundingSphere()

      this.chunks.set(chunkKey, {
        mesh,
        instanceUV,
        instanceColor,
        instanceFlip,
        instanceCount: count,
      })
      this.add(mesh)
      this._totalInstanceCount += count
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

    // Track which chunks need UV update
    const dirtyChunks = new Set<string>()

    for (const [, data] of this.animatedTilePositions) {
      if (!changedGids.has(data.baseGid)) continue

      const timer = this.animationTimers.get(data.baseGid)!
      const animation = this.tileset.getAnimation(data.baseGid)!
      const newGid = animation[timer.frameIndex]!.tileId + this.tileset.firstGid

      const chunk = this.chunks.get(data.chunkKey)
      if (!chunk) continue

      const i = data.instanceIndex
      const uv = this.tileset.getUV(newGid)
      chunk.instanceUV[i * 4 + 0] = uv.x
      chunk.instanceUV[i * 4 + 1] = uv.y + uv.height
      chunk.instanceUV[i * 4 + 2] = uv.width
      chunk.instanceUV[i * 4 + 3] = -uv.height

      data.gid = newGid
      dirtyChunks.add(data.chunkKey)
    }

    for (const chunkKey of dirtyChunks) {
      const chunk = this.chunks.get(chunkKey)
      if (chunk) {
        const uvAttr = chunk.mesh.geometry.getAttribute('instanceUV') as InstancedBufferAttribute
        uvAttr.needsUpdate = true
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
   * For changes between non-zero values, updates in-place.
   * For add/remove (0 <-> non-zero), rebuilds the entire layer.
   */
  setTileAt(tileX: number, tileY: number, gid: number): void {
    const { width, height, data } = this.data
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return
    }

    const index = tileY * width + tileX
    const oldRawGid = data[index] ?? 0
    const oldGid = oldRawGid & 0x1fffffff

    // Update the data array
    data[index] = gid

    const mapping = this.tileIndexMap.get(index)

    if (oldGid !== 0 && gid !== 0 && mapping) {
      // Non-zero -> non-zero: update UV in-place within the chunk
      const chunk = this.chunks.get(mapping.chunkKey)
      if (!chunk) return

      const i = mapping.instanceIndex
      const uv = this.tileset.getUV(gid)
      chunk.instanceUV[i * 4 + 0] = uv.x
      chunk.instanceUV[i * 4 + 1] = uv.y + uv.height
      chunk.instanceUV[i * 4 + 2] = uv.width
      chunk.instanceUV[i * 4 + 3] = -uv.height

      // Reset flip for newly set tiles
      chunk.instanceFlip[i * 2 + 0] = 1
      chunk.instanceFlip[i * 2 + 1] = 1

      const uvAttr = chunk.mesh.geometry.getAttribute('instanceUV') as InstancedBufferAttribute
      uvAttr.needsUpdate = true
      const flipAttr = chunk.mesh.geometry.getAttribute('instanceFlip') as InstancedBufferAttribute
      flipAttr.needsUpdate = true
    } else {
      // Tile added or removed — rebuild the entire layer
      this.buildInstances()
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
    return this._totalInstanceCount
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    for (const chunk of this.chunks.values()) {
      chunk.mesh.geometry.dispose()
    }
    this.chunks.clear()
    this.material.dispose()
    this.tileIndexMap.clear()
    this.animatedTilePositions.clear()
    this.animationTimers.clear()
  }
}
