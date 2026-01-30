import { Group, Box3, Vector3 } from 'three'
import { Tileset } from './Tileset'
import { TileLayer } from './TileLayer'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type {
  TileMapData,
  TileMap2DOptions,
  TileLayerData,
  ObjectLayerData,
  TileMapObject,
  CollisionShape,
} from './types'

/**
 * Main tilemap class for rendering 2D tile-based maps.
 *
 * Supports:
 * - Multiple tile layers
 * - Animated tiles
 * - Chunked rendering for large maps
 * - Collision data extraction
 * - Object layer access (spawn points, triggers, etc.)
 *
 * Follows R3F-compatible constructor pattern with optional parameters.
 *
 * @example
 * ```typescript
 * // Vanilla Three.js
 * const mapData = await TiledLoader.load('/maps/level1.json')
 * const tilemap = new TileMap2D({ data: mapData })
 * scene.add(tilemap)
 *
 * // In update loop
 * tilemap.update(deltaMs)
 * ```
 *
 * @example
 * ```tsx
 * // React Three Fiber (after extending)
 * extend({ TileMap2D })
 *
 * function Level() {
 *   const mapData = use(TiledLoader.load('/maps/level1.json'))
 *   return <tileMap2D data={mapData} />
 * }
 * ```
 */
export class TileMap2D extends Group {
  /** Map data */
  private _data: TileMapData | null = null

  /** Map dimensions in tiles */
  private _widthInTiles: number = 0
  private _heightInTiles: number = 0

  /** Tile dimensions */
  private _tileWidth: number = 0
  private _tileHeight: number = 0

  /** Map dimensions in world units */
  private _widthInPixels: number = 0
  private _heightInPixels: number = 0

  /** Chunk size in tiles (default: 512) */
  private _chunkSize: number = 512

  /** Enable collision extraction */
  private _enableCollision: boolean = true

  /** Tilesets */
  private tilesets: Tileset[] = []

  /** Tile layers */
  private tileLayers: TileLayer[] = []

  /** Object layers (for reference) */
  private objectLayers: ObjectLayerData[] = []

  /** Collision shapes (extracted) */
  private collisionShapes: CollisionShape[] = []

  /** Bounds */
  private _bounds: Box3 = new Box3()

  /**
   * Create a new TileMap2D.
   *
   * @param options - Optional configuration. If not provided (R3F path),
   *                  the tilemap will be initialized when `data` is set.
   */
  constructor(options?: TileMap2DOptions) {
    super()
    this.name = 'TileMap2D'

    // Early return for R3F path (no options)
    if (!options) return

    // Apply options
    if (options.chunkSize !== undefined) this._chunkSize = options.chunkSize
    if (options.enableCollision !== undefined) this._enableCollision = options.enableCollision
    if (options.data) this.data = options.data
  }

  /**
   * Get the tilemap data.
   */
  get data(): TileMapData | null {
    return this._data
  }

  /**
   * Set the tilemap data and rebuild the map.
   */
  set data(value: TileMapData | null) {
    if (this._data === value) return

    // Dispose existing data
    this.disposeInternal()

    this._data = value

    if (value) {
      this.buildMap(value)
    }
  }

  /**
   * Get/set chunk size in tiles (default: 512).
   * Each layer is split into chunks of chunkSize×chunkSize tiles for frustum culling.
   * Maps smaller than chunkSize naturally use a single chunk per layer.
   */
  get chunkSize(): number {
    return this._chunkSize
  }

  set chunkSize(value: number) {
    if (this._chunkSize === value) return
    this._chunkSize = value
    // Rebuild if data exists
    if (this._data) {
      this.disposeInternal()
      this.buildMap(this._data)
    }
  }

  /**
   * Get/set collision extraction flag.
   */
  get enableCollision(): boolean {
    return this._enableCollision
  }

  set enableCollision(value: boolean) {
    if (this._enableCollision === value) return
    this._enableCollision = value
    if (this._data && value) {
      this.extractCollisionData()
    } else {
      this.collisionShapes = []
    }
  }

  // Read-only accessors
  get widthInTiles(): number {
    return this._widthInTiles
  }
  get heightInTiles(): number {
    return this._heightInTiles
  }
  get tileWidth(): number {
    return this._tileWidth
  }
  get tileHeight(): number {
    return this._tileHeight
  }
  get widthInPixels(): number {
    return this._widthInPixels
  }
  get heightInPixels(): number {
    return this._heightInPixels
  }

  /**
   * Build the tilemap from data.
   */
  private buildMap(data: TileMapData): void {
    this._widthInTiles = data.width
    this._heightInTiles = data.height
    this._tileWidth = data.tileWidth
    this._tileHeight = data.tileHeight
    this._widthInPixels = data.width * data.tileWidth
    this._heightInPixels = data.height * data.tileHeight

    // Create bounds
    this._bounds = new Box3(
      new Vector3(0, 0, 0),
      new Vector3(this._widthInPixels, this._heightInPixels, 0)
    )

    // Create tilesets
    for (const tilesetData of data.tilesets) {
      const tileset = new Tileset(tilesetData)
      this.tilesets.push(tileset)
    }

    // Create tile layers
    for (let i = 0; i < data.tileLayers.length; i++) {
      const layerData = data.tileLayers[i]!
      const tileset = this.getTilesetForLayer(layerData)

      if (tileset) {
        const layer = new TileLayer(
          layerData,
          tileset,
          this._tileWidth,
          this._tileHeight,
          this._chunkSize
        )

        // Position layer in Z for proper ordering
        layer.position.z = i * 0.001

        this.tileLayers.push(layer)
        this.add(layer)
      }
    }

    // Store object layers
    this.objectLayers = data.objectLayers

    // Extract collision data
    if (this._enableCollision) {
      this.extractCollisionData()
    }
  }

  /**
   * Get tileset for a layer (based on first non-empty tile).
   */
  private getTilesetForLayer(layerData: TileLayerData): Tileset | null {
    for (const rawGid of layerData.data) {
      if (rawGid === 0) continue
      const gid = rawGid & 0x1fffffff
      const tileset = this.getTilesetForGid(gid)
      if (tileset) return tileset
    }
    return this.tilesets[0] ?? null
  }

  /**
   * Get tileset containing a GID.
   */
  private getTilesetForGid(gid: number): Tileset | null {
    // Tilesets are sorted by firstGid, search in reverse
    for (let i = this.tilesets.length - 1; i >= 0; i--) {
      if (this.tilesets[i]!.containsGid(gid)) {
        return this.tilesets[i]!
      }
    }
    return null
  }

  /**
   * Extract collision data from tiles and object layers.
   */
  private extractCollisionData(): void {
    this.collisionShapes = []

    // Extract from tile collision shapes
    for (const layer of this.tileLayers) {
      const layerData = layer.data
      const { width, height, data } = layerData

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x
          const rawGid = data[index]!
          if (rawGid === 0) continue

          const gid = rawGid & 0x1fffffff
          const tileset = this.getTilesetForGid(gid)
          if (!tileset) continue

          const tile = tileset.getTile(gid)
          if (tile?.collision) {
            // Transform collision shapes to world space (Y-up)
            const worldX = x * this._tileWidth
            const worldY = (height - 1 - y) * this._tileHeight

            for (const shape of tile.collision) {
              this.collisionShapes.push(this.transformShape(shape, worldX, worldY))
            }
          }
        }
      }
    }

    // Extract from object layers named "collision" or similar
    for (const objLayer of this.objectLayers) {
      if (
        objLayer.name.toLowerCase().includes('collision') ||
        objLayer.name.toLowerCase().includes('solid')
      ) {
        for (const obj of objLayer.objects) {
          const shape = this.objectToCollisionShape(obj)
          if (shape) {
            this.collisionShapes.push(shape)
          }
        }
      }
    }
  }

  /**
   * Transform a collision shape to world space.
   */
  private transformShape(
    shape: CollisionShape,
    offsetX: number,
    offsetY: number
  ): CollisionShape {
    switch (shape.type) {
      case 'rect':
        return {
          type: 'rect',
          x: shape.x + offsetX,
          y: shape.y + offsetY,
          width: shape.width,
          height: shape.height,
        }
      case 'ellipse':
        return {
          type: 'ellipse',
          x: shape.x + offsetX,
          y: shape.y + offsetY,
          width: shape.width,
          height: shape.height,
        }
      case 'polygon':
        return {
          type: 'polygon',
          points: shape.points.map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        }
      case 'polyline':
        return {
          type: 'polyline',
          points: shape.points.map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        }
    }
  }

  /**
   * Convert a map object to a collision shape.
   */
  private objectToCollisionShape(obj: TileMapObject): CollisionShape | null {
    // Convert Y from Tiled (Y-down) to Three.js (Y-up)
    const worldY = this._heightInPixels - obj.y - obj.height

    if (obj.polygon) {
      return {
        type: 'polygon',
        points: obj.polygon.map((p) => ({
          x: p.x + obj.x,
          y: this._heightInPixels - (p.y + obj.y),
        })),
      }
    }
    if (obj.polyline) {
      return {
        type: 'polyline',
        points: obj.polyline.map((p) => ({
          x: p.x + obj.x,
          y: this._heightInPixels - (p.y + obj.y),
        })),
      }
    }
    if (obj.ellipse) {
      return {
        type: 'ellipse',
        x: obj.x,
        y: worldY,
        width: obj.width,
        height: obj.height,
      }
    }
    if (obj.point) {
      return null // Points aren't collision shapes
    }
    // Default to rectangle
    return {
      type: 'rect',
      x: obj.x,
      y: worldY,
      width: obj.width,
      height: obj.height,
    }
  }

  /**
   * Update animated tiles.
   * Call this in your animation loop with delta time in milliseconds.
   */
  update(deltaMs: number): void {
    for (const layer of this.tileLayers) {
      layer.update(deltaMs)
    }
  }

  /**
   * Get tile layer by name.
   */
  getLayer(name: string): TileLayer | undefined {
    return this.tileLayers.find((l) => l.name === name)
  }

  /**
   * Get tile layer by index.
   */
  getLayerAt(index: number): TileLayer | undefined {
    return this.tileLayers[index]
  }

  /**
   * Get all tile layers.
   */
  getLayers(): readonly TileLayer[] {
    return this.tileLayers
  }

  /**
   * Get layer count.
   */
  get layerCount(): number {
    return this.tileLayers.length
  }

  /**
   * Get object layer by name.
   */
  getObjectLayer(name: string): ObjectLayerData | undefined {
    return this.objectLayers.find((l) => l.name === name)
  }

  /**
   * Get all objects of a specific type.
   */
  getObjectsByType(type: string): TileMapObject[] {
    const objects: TileMapObject[] = []
    for (const layer of this.objectLayers) {
      for (const obj of layer.objects) {
        if (obj.type === type) {
          objects.push(obj)
        }
      }
    }
    return objects
  }

  /**
   * Get tile GID at world position.
   */
  getTileAtWorld(worldX: number, worldY: number, layerIndex: number = 0): number {
    const tileX = Math.floor(worldX / this._tileWidth)
    // Convert from world Y-up to tile Y-down
    const tileY = this._heightInTiles - 1 - Math.floor(worldY / this._tileHeight)
    return this.tileLayers[layerIndex]?.getTileAt(tileX, tileY) ?? 0
  }

  /**
   * Convert world position to tile coordinates (in Tiled's Y-down system).
   */
  worldToTile(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: Math.floor(worldX / this._tileWidth),
      y: this._heightInTiles - 1 - Math.floor(worldY / this._tileHeight),
    }
  }

  /**
   * Convert tile coordinates to world position (center of tile).
   */
  tileToWorld(tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: tileX * this._tileWidth + this._tileWidth / 2,
      y: (this._heightInTiles - 1 - tileY) * this._tileHeight + this._tileHeight / 2,
    }
  }

  /**
   * Get collision shapes.
   */
  getCollisionShapes(): readonly CollisionShape[] {
    return this.collisionShapes
  }

  /**
   * Get map bounds.
   */
  get bounds(): Box3 {
    return this._bounds.clone()
  }

  /**
   * Get tileset by name.
   */
  getTileset(name: string): Tileset | undefined {
    return this.tilesets.find((t) => t.name === name)
  }

  /**
   * Get custom property from map data.
   */
  getProperty<T>(name: string): T | undefined {
    return this._data?.properties?.[name] as T | undefined
  }

  /**
   * Get total chunk count across all layers (equals total draw calls for tiles).
   */
  get totalChunkCount(): number {
    return this.tileLayers.reduce((sum, layer) => sum + layer.chunkCount, 0)
  }

  /**
   * Get total tile count across all layers.
   */
  get totalTileCount(): number {
    return this.tileLayers.reduce((sum, layer) => sum + layer.tileCount, 0)
  }

  /**
   * Get the Sprite2DMaterial for a tile layer by name.
   * Use this to apply TSL effects or lighting to specific layers.
   */
  getLayerMaterial(name: string): Sprite2DMaterial | undefined {
    return this.tileLayers.find((l) => l.name === name)?.material
  }

  /**
   * Get the Sprite2DMaterial for a tile layer by index.
   * Use this to apply TSL effects or lighting to specific layers.
   */
  getLayerMaterialAt(index: number): Sprite2DMaterial | undefined {
    return this.tileLayers[index]?.material
  }

  /**
   * Dispose internal resources (without clearing external references).
   */
  private disposeInternal(): void {
    for (const layer of this.tileLayers) {
      this.remove(layer)
      layer.dispose()
    }
    for (const tileset of this.tilesets) {
      tileset.dispose()
    }
    this.tileLayers = []
    this.tilesets = []
    this.objectLayers = []
    this.collisionShapes = []
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.disposeInternal()
    this._data = null
  }
}
