import type { Texture } from 'three'
import type { Tileset } from './Tileset'

/**
 * A single tile definition in a tileset.
 */
export interface TileDefinition {
  /** Global tile ID (GID) */
  id: number
  /** UV coordinates in atlas (normalized 0-1) */
  uv: { x: number; y: number; width: number; height: number }
  /** Collision shapes (if any) */
  collision?: CollisionShape[]
  /** Custom properties */
  properties?: Record<string, unknown>
  /** Animation frames (if animated) */
  animation?: TileAnimationFrame[]
}

/**
 * Animation frame for animated tiles.
 */
export interface TileAnimationFrame {
  /** Tile ID to display */
  tileId: number
  /** Duration in milliseconds */
  duration: number
}

/**
 * Collision shape types.
 */
export type CollisionShape =
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; x: number; y: number; width: number; height: number }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> }
  | { type: 'polyline'; points: Array<{ x: number; y: number }> }

/**
 * Tileset data structure.
 */
export interface TilesetData {
  /** Tileset name */
  name: string
  /** First GID for this tileset */
  firstGid: number
  /** Tile width in pixels */
  tileWidth: number
  /** Tile height in pixels */
  tileHeight: number
  /** Tileset image width */
  imageWidth: number
  /** Tileset image height */
  imageHeight: number
  /** Number of columns */
  columns: number
  /** Number of tiles */
  tileCount: number
  /** Spacing between tiles */
  spacing?: number
  /** Margin around tiles */
  margin?: number
  /** Tile definitions */
  tiles: Map<number, TileDefinition>
  /** Texture atlas */
  texture?: Texture
}

/**
 * Tile layer data.
 */
export interface TileLayerData {
  /** Layer name */
  name: string
  /** Layer ID */
  id: number
  /** Layer width in tiles */
  width: number
  /** Layer height in tiles */
  height: number
  /** Tile data (GIDs, 0 = empty) */
  data: Uint32Array
  /** Layer offset in pixels */
  offset?: { x: number; y: number }
  /** Layer opacity (0-1) */
  opacity?: number
  /** Layer visibility */
  visible?: boolean
  /** Parallax factor */
  parallax?: { x: number; y: number }
  /** Tint color */
  tint?: number
  /** Custom properties */
  properties?: Record<string, unknown>
}

/**
 * Object layer data (for entities, spawn points, etc.).
 */
export interface ObjectLayerData {
  /** Layer name */
  name: string
  /** Layer ID */
  id: number
  /** Objects in this layer */
  objects: TileMapObject[]
  /** Layer offset in pixels */
  offset?: { x: number; y: number }
  /** Layer visibility */
  visible?: boolean
  /** Custom properties */
  properties?: Record<string, unknown>
}

/**
 * A map object (entity, trigger, etc.).
 */
export interface TileMapObject {
  /** Object ID */
  id: number
  /** Object name */
  name: string
  /** Object type/class */
  type: string
  /** Position in pixels */
  x: number
  y: number
  /** Size in pixels */
  width: number
  height: number
  /** Rotation in degrees */
  rotation?: number
  /** Tile GID (if tile object) */
  gid?: number
  /** Polygon points (if polygon) */
  polygon?: Array<{ x: number; y: number }>
  /** Polyline points (if polyline) */
  polyline?: Array<{ x: number; y: number }>
  /** Ellipse flag */
  ellipse?: boolean
  /** Point flag */
  point?: boolean
  /** Custom properties */
  properties?: Record<string, unknown>
}

/**
 * Complete tilemap data (format-agnostic).
 */
export interface TileMapData {
  /** Map width in tiles */
  width: number
  /** Map height in tiles */
  height: number
  /** Tile width in pixels */
  tileWidth: number
  /** Tile height in pixels */
  tileHeight: number
  /** Map orientation */
  orientation: 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal'
  /** Render order */
  renderOrder: 'right-down' | 'right-up' | 'left-down' | 'left-up'
  /** Infinite map flag */
  infinite: boolean
  /** Background color */
  backgroundColor?: number
  /** Tilesets used */
  tilesets: TilesetData[]
  /** Tile layers */
  tileLayers: TileLayerData[]
  /** Object layers */
  objectLayers: ObjectLayerData[]
  /** Custom properties */
  properties?: Record<string, unknown>
}

/**
 * TileMap2D options.
 */
export interface TileMap2DOptions {
  /** Tilemap data */
  data?: TileMapData
  /** Chunk size in tiles (default: 16) */
  chunkSize?: number
  /** Enable collision data extraction (default: true) */
  enableCollision?: boolean
  /** Pixel perfect rendering (default: false) */
  pixelPerfect?: boolean
  /** Render layer for all tile layers (default: 0) */
  baseLayer?: number
}

/**
 * Chunk coordinates.
 */
export interface ChunkCoord {
  x: number
  y: number
}

/**
 * Tile instance data for rendering.
 */
export interface TileInstance {
  /** World X position */
  x: number
  /** World Y position */
  y: number
  /** Tile GID */
  gid: number
  /** Flip flags (horizontal, vertical, diagonal) */
  flipH: boolean
  flipV: boolean
  flipD: boolean
}

/**
 * TileChunk options.
 */
export interface TileChunkOptions {
  /** Chunk coordinates */
  coord: ChunkCoord
  /** Chunk size in tiles */
  size: number
  /** Tile width in pixels */
  tileWidth: number
  /** Tile height in pixels */
  tileHeight: number
  /** Tileset for this chunk */
  tileset: Tileset
}

/**
 * TileLayer options.
 */
export interface TileLayerOptions {
  /** Layer data */
  data: TileLayerData
  /** Tileset for this layer */
  tileset: Tileset
  /** Tile width in pixels */
  tileWidth: number
  /** Tile height in pixels */
  tileHeight: number
  /** Chunk size in tiles (default: 16) */
  chunkSize?: number
}
