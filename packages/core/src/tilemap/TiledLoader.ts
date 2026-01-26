import { Loader } from 'three'
import type {
  TileMapData,
  TilesetData,
  TileLayerData,
  ObjectLayerData,
  TileDefinition,
  CollisionShape,
} from './types'
import { type TexturePreset, type TextureOptions, resolveTextureOptions } from '../loaders/texturePresets'
import { TextureLoader } from '../loaders/TextureLoader'

/**
 * Tiled JSON format types.
 */
interface TiledMap {
  width: number
  height: number
  tilewidth: number
  tileheight: number
  orientation: 'orthogonal' | 'isometric' | 'staggered' | 'hexagonal'
  renderorder: 'right-down' | 'right-up' | 'left-down' | 'left-up'
  infinite: boolean
  backgroundcolor?: string
  layers: TiledLayer[]
  tilesets: TiledTileset[]
  properties?: TiledProperty[]
}

interface TiledLayer {
  id: number
  name: string
  type: 'tilelayer' | 'objectgroup' | 'imagelayer' | 'group'
  width?: number
  height?: number
  data?: number[]
  chunks?: TiledChunk[]
  objects?: TiledObject[]
  offsetx?: number
  offsety?: number
  opacity?: number
  visible?: boolean
  parallaxx?: number
  parallaxy?: number
  tintcolor?: string
  properties?: TiledProperty[]
}

interface TiledChunk {
  x: number
  y: number
  width: number
  height: number
  data: number[]
}

interface TiledTileset {
  firstgid: number
  name: string
  tilewidth: number
  tileheight: number
  imagewidth: number
  imageheight: number
  image: string
  columns: number
  tilecount: number
  spacing?: number
  margin?: number
  tiles?: TiledTile[]
  source?: string // External tileset reference
}

interface TiledTile {
  id: number
  animation?: TiledAnimation[]
  objectgroup?: { objects: TiledObject[] }
  properties?: TiledProperty[]
}

interface TiledAnimation {
  tileid: number
  duration: number
}

interface TiledObject {
  id: number
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  gid?: number
  polygon?: Array<{ x: number; y: number }>
  polyline?: Array<{ x: number; y: number }>
  ellipse?: boolean
  point?: boolean
  properties?: TiledProperty[]
}

interface TiledProperty {
  name: string
  type: string
  value: unknown
}

/**
 * Options for loading a Tiled map.
 */
export interface TiledLoaderOptions {
  /** Texture preset or custom options. Overrides loader and global defaults. */
  texture?: TexturePreset | TextureOptions
}

/**
 * Loader for Tiled JSON format (.tmj/.json).
 *
 * Extends Three.js's Loader class for compatibility with R3F's useLoader.
 * Supports:
 * - Standard JSON map format
 * - Embedded and external tilesets
 * - Tile layers with data arrays
 * - Infinite maps with chunks
 * - Object layers
 * - Tile animations
 * - Tile collision data
 *
 * @example
 * ```typescript
 * // Vanilla usage - static API
 * const mapData = await TiledLoader.load('/maps/level1.json')
 *
 * // Override for this load
 * const mapData = await TiledLoader.load('/maps/hd-level.json', { texture: 'smooth' })
 *
 * // R3F usage - works with useLoader
 * import { TiledLoader } from '@three-flatland/react';
 * const mapData = useLoader(TiledLoader, '/maps/level1.json');
 *
 * // Override preset via extension
 * const mapData = useLoader(TiledLoader, '/maps/hd-level.json', (loader) => {
 *   loader.preset = 'smooth';
 * });
 *
 * // Set loader-level default
 * TiledLoader.options = 'pixel-art'
 * ```
 */
export class TiledLoader extends Loader<TileMapData> {
  private static cache = new Map<string, Promise<TileMapData>>()

  /**
   * Texture options for this loader class.
   * When undefined, falls through to TextureConfig.options.
   */
  static options: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Instance-level preset override.
   * Set via R3F's useLoader extension callback.
   *
   * @example
   * ```tsx
   * const mapData = useLoader(TiledLoader, '/maps/level.json', (loader) => {
   *   loader.preset = 'smooth';
   * });
   * ```
   */
  preset: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Load a Tiled map asynchronously (for R3F useLoader compatibility).
   * Presets are automatically applied.
   */
  loadAsync(url: string): Promise<TileMapData> {
    const resolved = resolveTextureOptions(this.preset, TiledLoader.options)
    return TiledLoader.loadUncached(url, { texture: resolved })
  }

  // ==========================================
  // Static API for vanilla usage
  // ==========================================

  /**
   * Load a Tiled JSON map (static method for vanilla usage).
   * Results are cached by URL and resolved options.
   */
  static load(url: string, options?: TiledLoaderOptions): Promise<TileMapData> {
    const cacheKey = this.getCacheKey(url, options)

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const promise = this.loadUncached(url, options)
    this.cache.set(cacheKey, promise)
    return promise
  }

  /**
   * Get cache key including resolved options.
   */
  private static getCacheKey(url: string, options?: TiledLoaderOptions): string {
    const resolved = resolveTextureOptions(options?.texture, this.options)
    const optionsKey = typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
    return `${url}:${optionsKey}`
  }

  /**
   * Load without caching.
   */
  private static async loadUncached(
    url: string,
    options?: TiledLoaderOptions
  ): Promise<TileMapData> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load Tiled map: ${url}`)
    }

    const json = (await response.json()) as TiledMap
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
    const resolved = resolveTextureOptions(options?.texture, this.options)

    return this.parseMap(json, baseUrl, resolved)
  }

  /**
   * Parse Tiled JSON map.
   */
  private static async parseMap(
    json: TiledMap,
    baseUrl: string,
    textureOptions: TexturePreset | TextureOptions
  ): Promise<TileMapData> {
    // Load tilesets (including external ones)
    const tilesets: TilesetData[] = []
    for (const ts of json.tilesets) {
      const tileset = await this.parseTileset(ts, baseUrl, textureOptions)
      tilesets.push(tileset)
    }

    // Sort tilesets by firstGid for correct lookup
    tilesets.sort((a, b) => a.firstGid - b.firstGid)

    // Parse layers
    const tileLayers: TileLayerData[] = []
    const objectLayers: ObjectLayerData[] = []

    for (const layer of json.layers) {
      if (layer.type === 'tilelayer') {
        tileLayers.push(this.parseTileLayer(layer, json))
      } else if (layer.type === 'objectgroup') {
        objectLayers.push(this.parseObjectLayer(layer))
      }
    }

    return {
      width: json.width,
      height: json.height,
      tileWidth: json.tilewidth,
      tileHeight: json.tileheight,
      orientation: json.orientation,
      renderOrder: json.renderorder,
      infinite: json.infinite,
      backgroundColor: json.backgroundcolor ? this.parseColor(json.backgroundcolor) : undefined,
      tilesets,
      tileLayers,
      objectLayers,
      properties: this.parseProperties(json.properties),
    }
  }

  /**
   * Parse tileset (embedded or external).
   */
  private static async parseTileset(
    ts: TiledTileset,
    baseUrl: string,
    textureOptions: TexturePreset | TextureOptions
  ): Promise<TilesetData> {
    // Handle external tileset reference
    if (ts.source) {
      const externalUrl = baseUrl + ts.source
      const response = await fetch(externalUrl)
      if (!response.ok) {
        throw new Error(`Failed to load external tileset: ${externalUrl}`)
      }
      const externalTs = (await response.json()) as TiledTileset
      // Merge firstgid from reference
      externalTs.firstgid = ts.firstgid
      return this.parseTileset(externalTs, baseUrl, textureOptions)
    }

    // Parse tile definitions
    const tiles = new Map<number, TileDefinition>()

    if (ts.tiles) {
      for (const tile of ts.tiles) {
        const def: TileDefinition = {
          id: tile.id,
          uv: this.calculateUV(tile.id, ts),
          properties: this.parseProperties(tile.properties),
        }

        // Parse animation
        if (tile.animation) {
          def.animation = tile.animation.map((a) => ({
            tileId: a.tileid,
            duration: a.duration,
          }))
        }

        // Parse collision (from objectgroup)
        if (tile.objectgroup?.objects) {
          def.collision = tile.objectgroup.objects.map((obj) => this.parseCollisionObject(obj))
        }

        tiles.set(tile.id, def)
      }
    }

    // Load texture
    const textureUrl = baseUrl + ts.image
    const texture = await this.loadTexture(textureUrl, textureOptions)

    return {
      name: ts.name,
      firstGid: ts.firstgid,
      tileWidth: ts.tilewidth,
      tileHeight: ts.tileheight,
      imageWidth: ts.imagewidth,
      imageHeight: ts.imageheight,
      columns: ts.columns,
      tileCount: ts.tilecount,
      spacing: ts.spacing,
      margin: ts.margin,
      tiles,
      texture,
    }
  }

  /**
   * Calculate UV coordinates for a tile.
   */
  private static calculateUV(
    localId: number,
    ts: TiledTileset
  ): { x: number; y: number; width: number; height: number } {
    const margin = ts.margin ?? 0
    const spacing = ts.spacing ?? 0

    const col = localId % ts.columns
    const row = Math.floor(localId / ts.columns)

    const x = margin + col * (ts.tilewidth + spacing)
    const y = margin + row * (ts.tileheight + spacing)

    return {
      x: x / ts.imagewidth,
      y: y / ts.imageheight,
      width: ts.tilewidth / ts.imagewidth,
      height: ts.tileheight / ts.imageheight,
    }
  }

  /**
   * Parse a collision object from tile.
   */
  private static parseCollisionObject(obj: TiledObject): CollisionShape {
    if (obj.polygon) {
      return {
        type: 'polygon',
        points: obj.polygon.map((p) => ({
          x: p.x + obj.x,
          y: p.y + obj.y,
        })),
      }
    }
    if (obj.polyline) {
      return {
        type: 'polyline',
        points: obj.polyline.map((p) => ({
          x: p.x + obj.x,
          y: p.y + obj.y,
        })),
      }
    }
    if (obj.ellipse) {
      return {
        type: 'ellipse',
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
      }
    }
    return {
      type: 'rect',
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
    }
  }

  /**
   * Parse a tile layer.
   */
  private static parseTileLayer(layer: TiledLayer, map: TiledMap): TileLayerData {
    let data: Uint32Array

    if (layer.data) {
      // Standard finite map
      data = new Uint32Array(layer.data)
    } else if (layer.chunks) {
      // Infinite map with chunks
      data = this.parseInfiniteLayer(layer.chunks, map.width, map.height)
    } else {
      data = new Uint32Array(0)
    }

    return {
      name: layer.name,
      id: layer.id,
      width: layer.width ?? map.width,
      height: layer.height ?? map.height,
      data,
      offset:
        layer.offsetx !== undefined || layer.offsety !== undefined
          ? { x: layer.offsetx ?? 0, y: layer.offsety ?? 0 }
          : undefined,
      opacity: layer.opacity,
      visible: layer.visible,
      parallax:
        layer.parallaxx !== undefined || layer.parallaxy !== undefined
          ? { x: layer.parallaxx ?? 1, y: layer.parallaxy ?? 1 }
          : undefined,
      tint: layer.tintcolor ? this.parseColor(layer.tintcolor) : undefined,
      properties: this.parseProperties(layer.properties),
    }
  }

  /**
   * Parse infinite layer chunks into a contiguous array.
   */
  private static parseInfiniteLayer(
    chunks: TiledChunk[],
    mapWidth: number,
    mapHeight: number
  ): Uint32Array {
    const data = new Uint32Array(mapWidth * mapHeight)

    for (const chunk of chunks) {
      for (let y = 0; y < chunk.height; y++) {
        for (let x = 0; x < chunk.width; x++) {
          const srcIndex = y * chunk.width + x
          const dstX = chunk.x + x
          const dstY = chunk.y + y

          if (dstX >= 0 && dstX < mapWidth && dstY >= 0 && dstY < mapHeight) {
            const dstIndex = dstY * mapWidth + dstX
            data[dstIndex] = chunk.data[srcIndex]!
          }
        }
      }
    }

    return data
  }

  /**
   * Parse an object layer.
   */
  private static parseObjectLayer(layer: TiledLayer): ObjectLayerData {
    return {
      name: layer.name,
      id: layer.id,
      objects:
        layer.objects?.map((obj) => ({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          rotation: obj.rotation,
          gid: obj.gid,
          polygon: obj.polygon,
          polyline: obj.polyline,
          ellipse: obj.ellipse,
          point: obj.point,
          properties: this.parseProperties(obj.properties),
        })) ?? [],
      offset:
        layer.offsetx !== undefined || layer.offsety !== undefined
          ? { x: layer.offsetx ?? 0, y: layer.offsety ?? 0 }
          : undefined,
      visible: layer.visible,
      properties: this.parseProperties(layer.properties),
    }
  }

  /**
   * Parse Tiled properties array to object.
   */
  private static parseProperties(props?: TiledProperty[]): Record<string, unknown> | undefined {
    if (!props || props.length === 0) return undefined

    const result: Record<string, unknown> = {}
    for (const prop of props) {
      result[prop.name] = prop.value
    }
    return result
  }

  /**
   * Parse Tiled color string to number.
   */
  private static parseColor(color: string): number {
    // Tiled uses #AARRGGBB or #RRGGBB format
    if (color.startsWith('#')) {
      color = color.substring(1)
    }
    if (color.length === 8) {
      // AARRGGBB -> RRGGBB (strip alpha)
      color = color.substring(2)
    }
    return parseInt(color, 16)
  }

  /**
   * Load a texture with the specified options.
   */
  private static loadTexture(url: string, preset: TexturePreset | TextureOptions) {
    return TextureLoader.load(url, { texture: preset })
  }

  /**
   * Clear the cache.
   */
  static clearCache(): void {
    this.cache.clear()
  }

  /**
   * Preload multiple maps.
   */
  static preload(urls: string[], options?: TiledLoaderOptions): Promise<TileMapData[]> {
    return Promise.all(urls.map((url) => this.load(url, options)))
  }
}
