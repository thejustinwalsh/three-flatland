import { type Texture, TextureLoader, NearestFilter, SRGBColorSpace } from 'three'
import type {
  TileMapData,
  TilesetData,
  TileLayerData,
  ObjectLayerData,
  TileDefinition,
  TileMapObject,
} from './types'

/**
 * LDtk JSON format types.
 */
interface LDtkProject {
  jsonVersion: string
  worldLayout: 'Free' | 'GridVania' | 'LinearHorizontal' | 'LinearVertical'
  worldGridWidth: number
  worldGridHeight: number
  defaultGridSize: number
  bgColor: string
  defs: LDtkDefs
  levels: LDtkLevel[]
}

interface LDtkDefs {
  layers: LDtkLayerDef[]
  entities: LDtkEntityDef[]
  tilesets: LDtkTilesetDef[]
  enums: LDtkEnumDef[]
}

interface LDtkLayerDef {
  uid: number
  identifier: string
  type: 'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer'
  gridSize: number
  tilesetDefUid?: number
}

interface LDtkTilesetDef {
  uid: number
  identifier: string
  relPath: string
  pxWid: number
  pxHei: number
  tileGridSize: number
  spacing: number
  padding: number
  customData: Array<{ tileId: number; data: string }>
  enumTags: Array<{ enumValueId: string; tileIds: number[] }>
}

interface LDtkEntityDef {
  uid: number
  identifier: string
  width: number
  height: number
  color: string
  fieldDefs: LDtkFieldDef[]
}

interface LDtkFieldDef {
  uid: number
  identifier: string
  type: string
  defaultValue: unknown
}

interface LDtkEnumDef {
  uid: number
  identifier: string
  values: Array<{ id: string; color: number }>
}

interface LDtkLevel {
  uid: number
  identifier: string
  worldX: number
  worldY: number
  pxWid: number
  pxHei: number
  bgColor: string
  layerInstances: LDtkLayerInstance[]
  fieldInstances: LDtkFieldInstance[]
}

interface LDtkLayerInstance {
  __identifier: string
  __type: 'IntGrid' | 'Entities' | 'Tiles' | 'AutoLayer'
  __cWid: number
  __cHei: number
  __gridSize: number
  __tilesetDefUid?: number
  __tilesetRelPath?: string
  levelId: number
  layerDefUid: number
  pxOffsetX: number
  pxOffsetY: number
  visible: boolean
  intGridCsv?: number[]
  autoLayerTiles?: LDtkTile[]
  gridTiles?: LDtkTile[]
  entityInstances?: LDtkEntityInstance[]
}

interface LDtkTile {
  px: [number, number]
  src: [number, number]
  f: number // Flip flags: 0=none, 1=flipX, 2=flipY, 3=both
  t: number // Tile ID
}

interface LDtkEntityInstance {
  __identifier: string
  __grid: [number, number]
  __tags: string[]
  __tile?: { tilesetUid: number; x: number; y: number; w: number; h: number }
  defUid: number
  px: [number, number]
  width: number
  height: number
  fieldInstances: LDtkFieldInstance[]
  iid: string
}

interface LDtkFieldInstance {
  __identifier: string
  __type: string
  __value: unknown
}

/**
 * Loader for LDtk JSON format.
 *
 * Supports:
 * - Single level or multi-level projects
 * - Tile layers (Tiles, AutoLayer, IntGrid)
 * - Entity layers
 * - IntGrid collision data
 * - Tile flip flags
 * - Custom field data
 *
 * @example
 * ```typescript
 * // Load a specific level
 * const mapData = await LDtkLoader.load('/maps/world.ldtk', 'Level_0')
 * const tilemap = new TileMap2D({ data: mapData })
 *
 * // Load entire project (all levels)
 * const allLevels = await LDtkLoader.loadProject('/maps/world.ldtk')
 * ```
 */
export class LDtkLoader {
  private static textureLoader = new TextureLoader()
  private static cache = new Map<string, Promise<LDtkProject>>()

  /**
   * Load a single level from an LDtk project.
   */
  static async load(url: string, levelId?: string | number): Promise<TileMapData> {
    const project = await this.loadProject(url)
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)

    // Find level
    let level: LDtkLevel | undefined
    if (levelId === undefined) {
      level = project.levels[0]
    } else if (typeof levelId === 'number') {
      level = project.levels.find((l) => l.uid === levelId)
    } else {
      level = project.levels.find((l) => l.identifier === levelId)
    }

    if (!level) {
      throw new Error(`Level not found: ${levelId}`)
    }

    return this.parseLevel(level, project, baseUrl)
  }

  /**
   * Load the LDtk project file.
   */
  static async loadProject(url: string): Promise<LDtkProject> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!
    }

    const promise = this.loadProjectUncached(url)
    this.cache.set(url, promise)
    return promise
  }

  /**
   * Load project without caching.
   */
  private static async loadProjectUncached(url: string): Promise<LDtkProject> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load LDtk project: ${url}`)
    }
    return response.json()
  }

  /**
   * Parse a single level.
   */
  private static async parseLevel(
    level: LDtkLevel,
    project: LDtkProject,
    baseUrl: string
  ): Promise<TileMapData> {
    // Calculate map size in tiles (use first tile layer's grid)
    const firstTileLayer = level.layerInstances?.find(
      (l) => l.__type === 'Tiles' || l.__type === 'AutoLayer'
    )
    const gridSize = firstTileLayer?.__gridSize ?? project.defaultGridSize
    const widthInTiles = Math.ceil(level.pxWid / gridSize)
    const heightInTiles = Math.ceil(level.pxHei / gridSize)

    // Load tilesets used in this level
    const usedTilesetUids = new Set<number>()
    for (const layer of level.layerInstances ?? []) {
      if (layer.__tilesetDefUid !== undefined) {
        usedTilesetUids.add(layer.__tilesetDefUid)
      }
    }

    const tilesets: TilesetData[] = []
    let firstGid = 1

    for (const tsDef of project.defs.tilesets) {
      if (!usedTilesetUids.has(tsDef.uid)) continue

      const tileset = await this.parseTileset(tsDef, baseUrl, firstGid)
      tilesets.push(tileset)
      firstGid += tileset.tileCount
    }

    // Parse layers
    const tileLayers: TileLayerData[] = []
    const objectLayers: ObjectLayerData[] = []

    if (level.layerInstances) {
      // LDtk layers are ordered back-to-front, so reverse for proper render order
      const layers = [...level.layerInstances].reverse()

      for (const layer of layers) {
        if (layer.__type === 'Tiles' || layer.__type === 'AutoLayer') {
          const tileLayer = this.parseTileLayer(layer, tilesets, project)
          if (tileLayer) {
            tileLayers.push(tileLayer)
          }
        } else if (layer.__type === 'Entities') {
          objectLayers.push(this.parseEntityLayer(layer))
        } else if (layer.__type === 'IntGrid') {
          // IntGrid can also have auto-tiles
          if (layer.autoLayerTiles && layer.autoLayerTiles.length > 0) {
            const tileLayer = this.parseTileLayer(layer, tilesets, project)
            if (tileLayer) {
              tileLayers.push(tileLayer)
            }
          }
          // Also create collision layer from IntGrid
          objectLayers.push(this.parseIntGridLayer(layer))
        }
      }
    }

    return {
      width: widthInTiles,
      height: heightInTiles,
      tileWidth: gridSize,
      tileHeight: gridSize,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      infinite: false,
      backgroundColor: this.parseColor(level.bgColor),
      tilesets,
      tileLayers,
      objectLayers,
      properties: this.parseFieldInstances(level.fieldInstances),
    }
  }

  /**
   * Parse a tileset definition.
   */
  private static async parseTileset(
    def: LDtkTilesetDef,
    baseUrl: string,
    firstGid: number
  ): Promise<TilesetData> {
    const columns = Math.floor(def.pxWid / def.tileGridSize)
    const rows = Math.floor(def.pxHei / def.tileGridSize)
    const tileCount = columns * rows

    // Load texture
    const textureUrl = baseUrl + def.relPath
    const texture = await this.loadTexture(textureUrl)

    // Parse tile definitions (custom data, enum tags)
    const tiles = new Map<number, TileDefinition>()

    for (const custom of def.customData) {
      const existing = tiles.get(custom.tileId) ?? {
        id: custom.tileId,
        uv: this.calculateUV(custom.tileId, def),
      }
      existing.properties = { ...(existing.properties ?? {}), customData: custom.data }
      tiles.set(custom.tileId, existing)
    }

    return {
      name: def.identifier,
      firstGid,
      tileWidth: def.tileGridSize,
      tileHeight: def.tileGridSize,
      imageWidth: def.pxWid,
      imageHeight: def.pxHei,
      columns,
      tileCount,
      spacing: def.spacing,
      margin: def.padding,
      tiles,
      texture,
    }
  }

  /**
   * Calculate UV for a tile.
   */
  private static calculateUV(
    tileId: number,
    def: LDtkTilesetDef
  ): { x: number; y: number; width: number; height: number } {
    const columns = Math.floor(def.pxWid / def.tileGridSize)
    const col = tileId % columns
    const row = Math.floor(tileId / columns)

    const x = def.padding + col * (def.tileGridSize + def.spacing)
    const y = def.padding + row * (def.tileGridSize + def.spacing)

    return {
      x: x / def.pxWid,
      y: y / def.pxHei,
      width: def.tileGridSize / def.pxWid,
      height: def.tileGridSize / def.pxHei,
    }
  }

  /**
   * Parse a tile layer.
   */
  private static parseTileLayer(
    layer: LDtkLayerInstance,
    tilesets: TilesetData[],
    project: LDtkProject
  ): TileLayerData | null {
    // Get tiles (from gridTiles or autoLayerTiles)
    const tiles = layer.gridTiles ?? layer.autoLayerTiles ?? []
    if (tiles.length === 0) return null

    // Find tileset
    const tileset = tilesets.find((ts) => {
      const tsDef = project.defs.tilesets.find((d) => d.uid === layer.__tilesetDefUid)
      return tsDef && ts.name === tsDef.identifier
    })
    if (!tileset) return null

    // Create data array
    const data = new Uint32Array(layer.__cWid * layer.__cHei)

    for (const tile of tiles) {
      const tileX = Math.floor(tile.px[0] / layer.__gridSize)
      const tileY = Math.floor(tile.px[1] / layer.__gridSize)
      const index = tileY * layer.__cWid + tileX

      // Convert local tile ID to GID
      let gid = tile.t + tileset.firstGid

      // Apply flip flags (LDtk uses: 1=flipX, 2=flipY)
      if (tile.f & 1) gid |= 0x80000000 // Flip H
      if (tile.f & 2) gid |= 0x40000000 // Flip V

      data[index] = gid
    }

    return {
      name: layer.__identifier,
      id: layer.layerDefUid,
      width: layer.__cWid,
      height: layer.__cHei,
      data,
      offset:
        layer.pxOffsetX !== 0 || layer.pxOffsetY !== 0
          ? { x: layer.pxOffsetX, y: layer.pxOffsetY }
          : undefined,
      visible: layer.visible,
    }
  }

  /**
   * Parse an entity layer.
   */
  private static parseEntityLayer(layer: LDtkLayerInstance): ObjectLayerData {
    const objects: TileMapObject[] = []

    for (const entity of layer.entityInstances ?? []) {
      objects.push({
        id: parseInt(entity.iid.replace(/-/g, '').substring(0, 8), 16),
        name: entity.__identifier,
        type: entity.__identifier,
        x: entity.px[0],
        y: entity.px[1],
        width: entity.width,
        height: entity.height,
        properties: this.parseFieldInstances(entity.fieldInstances),
      })
    }

    return {
      name: layer.__identifier,
      id: layer.layerDefUid,
      objects,
      offset:
        layer.pxOffsetX !== 0 || layer.pxOffsetY !== 0
          ? { x: layer.pxOffsetX, y: layer.pxOffsetY }
          : undefined,
      visible: layer.visible,
    }
  }

  /**
   * Parse IntGrid layer as collision data.
   */
  private static parseIntGridLayer(layer: LDtkLayerInstance): ObjectLayerData {
    const objects: TileMapObject[] = []
    const gridCsv = layer.intGridCsv ?? []

    // Create rectangle objects for IntGrid values > 0
    let id = 0
    for (let y = 0; y < layer.__cHei; y++) {
      for (let x = 0; x < layer.__cWid; x++) {
        const index = y * layer.__cWid + x
        const value = gridCsv[index]

        if (value && value > 0) {
          objects.push({
            id: id++,
            name: `intgrid_${value}`,
            type: 'collision',
            x: x * layer.__gridSize,
            y: y * layer.__gridSize,
            width: layer.__gridSize,
            height: layer.__gridSize,
            properties: { intGridValue: value },
          })
        }
      }
    }

    return {
      name: layer.__identifier + '_collision',
      id: layer.layerDefUid,
      objects,
      visible: false,
    }
  }

  /**
   * Parse field instances to properties.
   */
  private static parseFieldInstances(
    fields?: LDtkFieldInstance[]
  ): Record<string, unknown> | undefined {
    if (!fields || fields.length === 0) return undefined

    const result: Record<string, unknown> = {}
    for (const field of fields) {
      result[field.__identifier] = field.__value
    }
    return result
  }

  /**
   * Parse LDtk color string.
   */
  private static parseColor(color: string): number {
    if (color.startsWith('#')) {
      color = color.substring(1)
    }
    return parseInt(color, 16)
  }

  /**
   * Load a texture.
   */
  private static loadTexture(url: string): Promise<Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.minFilter = NearestFilter
          texture.magFilter = NearestFilter
          texture.generateMipmaps = false
          texture.colorSpace = SRGBColorSpace
          resolve(texture)
        },
        undefined,
        reject
      )
    })
  }

  /**
   * Get all level identifiers from a project.
   */
  static async getLevelIds(url: string): Promise<string[]> {
    const project = await this.loadProject(url)
    return project.levels.map((l) => l.identifier)
  }

  /**
   * Clear the cache.
   */
  static clearCache(): void {
    this.cache.clear()
  }
}
