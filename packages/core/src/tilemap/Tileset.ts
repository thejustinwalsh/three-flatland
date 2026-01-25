import { type Texture, NearestFilter, ClampToEdgeWrapping } from 'three'
import type { TilesetData, TileDefinition, TileAnimationFrame } from './types'

/**
 * Represents a tileset with tile definitions and texture atlas.
 *
 * Handles UV coordinate calculation and animated tile management.
 *
 * @example
 * ```typescript
 * const tileset = new Tileset({
 *   name: 'dungeon',
 *   firstGid: 1,
 *   tileWidth: 16,
 *   tileHeight: 16,
 *   imageWidth: 256,
 *   imageHeight: 256,
 *   columns: 16,
 *   tileCount: 256,
 *   tiles: new Map(),
 *   texture: myTexture,
 * })
 *
 * const uv = tileset.getUV(5) // Get UV for tile GID 5
 * ```
 */
export class Tileset {
  /** Tileset name */
  readonly name: string

  /** First GID */
  readonly firstGid: number

  /** Tile dimensions */
  readonly tileWidth: number
  readonly tileHeight: number

  /** Atlas dimensions */
  readonly imageWidth: number
  readonly imageHeight: number

  /** Grid info */
  readonly columns: number
  readonly tileCount: number
  readonly spacing: number
  readonly margin: number

  /** Texture atlas */
  private _texture: Texture | null = null

  /** Tile definitions (keyed by local ID, not GID) */
  private tiles: Map<number, TileDefinition> = new Map()

  /** Animated tiles (keyed by local ID) */
  private animatedTiles: Map<number, TileAnimationFrame[]> = new Map()

  constructor(data: TilesetData) {
    this.name = data.name
    this.firstGid = data.firstGid
    this.tileWidth = data.tileWidth
    this.tileHeight = data.tileHeight
    this.imageWidth = data.imageWidth
    this.imageHeight = data.imageHeight
    this.columns = data.columns
    this.tileCount = data.tileCount
    this.spacing = data.spacing ?? 0
    this.margin = data.margin ?? 0

    if (data.texture) {
      this.texture = data.texture
    }

    // Process tile definitions
    for (const [id, tile] of data.tiles) {
      this.tiles.set(id, tile)
      if (tile.animation) {
        this.animatedTiles.set(id, tile.animation)
      }
    }
  }

  /**
   * Get the texture atlas.
   */
  get texture(): Texture | null {
    return this._texture
  }

  /**
   * Set the texture atlas.
   */
  set texture(value: Texture | null) {
    this._texture = value
    if (value) {
      // Configure for pixel-perfect rendering
      value.minFilter = NearestFilter
      value.magFilter = NearestFilter
      value.wrapS = ClampToEdgeWrapping
      value.wrapT = ClampToEdgeWrapping
      value.generateMipmaps = false
    }
  }

  /**
   * Check if a GID belongs to this tileset.
   */
  containsGid(gid: number): boolean {
    const localId = gid - this.firstGid
    return localId >= 0 && localId < this.tileCount
  }

  /**
   * Get local ID from GID.
   */
  getLocalId(gid: number): number {
    return gid - this.firstGid
  }

  /**
   * Get UV coordinates for a tile.
   * Returns normalized UV coordinates (0-1) for the tile in the atlas.
   * Note: Y is NOT flipped here - the material handles coordinate space conversion.
   */
  getUV(gid: number): { x: number; y: number; width: number; height: number } {
    const localId = gid - this.firstGid

    // Check for custom tile definition first
    const tileDef = this.tiles.get(localId)
    if (tileDef?.uv) {
      return tileDef.uv
    }

    // Calculate from grid position
    const col = localId % this.columns
    const row = Math.floor(localId / this.columns)

    const x = this.margin + col * (this.tileWidth + this.spacing)
    const y = this.margin + row * (this.tileHeight + this.spacing)

    return {
      x: x / this.imageWidth,
      y: y / this.imageHeight,
      width: this.tileWidth / this.imageWidth,
      height: this.tileHeight / this.imageHeight,
    }
  }

  /**
   * Get tile definition.
   */
  getTile(gid: number): TileDefinition | undefined {
    const localId = gid - this.firstGid
    return this.tiles.get(localId)
  }

  /**
   * Check if a tile is animated.
   */
  isAnimated(gid: number): boolean {
    const localId = gid - this.firstGid
    return this.animatedTiles.has(localId)
  }

  /**
   * Get animation frames for a tile.
   */
  getAnimation(gid: number): TileAnimationFrame[] | undefined {
    const localId = gid - this.firstGid
    return this.animatedTiles.get(localId)
  }

  /**
   * Get all animated tile IDs (as GIDs).
   */
  getAnimatedTileIds(): number[] {
    return Array.from(this.animatedTiles.keys()).map((id) => id + this.firstGid)
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this._texture?.dispose()
    this._texture = null
  }
}
