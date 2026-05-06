import { Loader } from 'three'
import type {
  TileMapData,
  TilesetData,
  TileLayerData,
  ObjectLayerData,
  TileDefinition,
  TileMapObject,
} from '../tilemap/types'
import type { BakedAssetLoaderOptions } from '@three-flatland/bake'
import {
  resolveNormalMap,
  type NormalSourceDescriptor,
} from '@three-flatland/normals'
import { type TexturePreset, type TextureOptions, resolveTextureOptions } from './texturePresets'
import { TextureLoader } from './TextureLoader'
import { tilesetToRegions, type TileNormalCustomData, type TilesetCell } from './normalDescriptor'

/**
 * Option shape for the `normals` field on `LDtkLoaderOptions`.
 *
 * - `false` — no normals generated.
 * - `true` — auto-synthesize a descriptor from each tileset's tile
 *   custom data (reads `tileDir`, `tileCap`, etc.).
 * - `NormalSourceDescriptor` — user provides defaults (and optionally
 *   regions). The loader merges in tile-derived regions if the
 *   descriptor doesn't already specify them.
 */
export type LDtkNormalsOption = false | true | NormalSourceDescriptor

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
 * Options for loading an LDtk project.
 */
export interface LDtkLoaderOptions extends BakedAssetLoaderOptions {
  /** Texture preset or custom options. Overrides loader and global defaults. */
  texture?: TexturePreset | TextureOptions
  /**
   * Normal-map generation. When truthy, the loader synthesizes a
   * descriptor from each tileset's tile custom data (`tileDir`,
   * `tileCap*`, etc.), probes for a baked `.normal.png` sibling with
   * a matching descriptor hash, and falls back to an in-memory bake.
   *
   * The resulting texture is attached to `TilesetData.normalMap`,
   * 1:1 co-registered with the tileset image.
   */
  normals?: LDtkNormalsOption
}

/**
 * Loader for LDtk JSON format.
 *
 * Extends Three.js's Loader class for compatibility with R3F's useLoader.
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
 * // Three.js usage - static API
 * const mapData = await LDtkLoader.load('/maps/world.ldtk', 'Level_0')
 *
 * // Override for this load
 * const mapData = await LDtkLoader.load('/maps/world.ldtk', 'Level_0', { texture: 'smooth' })
 *
 * // R3F usage - works with useLoader (loads first level)
 * import { LDtkLoader } from 'three-flatland/react';
 * const mapData = useLoader(LDtkLoader, '/maps/world.ldtk');
 *
 * // Override preset via extension
 * const mapData = useLoader(LDtkLoader, '/maps/world.ldtk', (loader) => {
 *   loader.preset = 'smooth';
 *   loader.levelId = 'Level_1';  // Specify level to load
 * });
 *
 * // Set loader-level default
 * LDtkLoader.options = 'pixel-art'
 * ```
 */
export class LDtkLoader extends Loader<TileMapData> {
  private static cache = new Map<string, Promise<LDtkProject>>()

  /**
   * Texture options for this loader class.
   * When undefined, falls through to TextureConfig.options.
   */
  static options: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Instance-level preset override.
   * Set via R3F's useLoader extension callback.
   */
  preset: TexturePreset | TextureOptions | undefined = undefined

  /**
   * Level ID to load (for R3F useLoader).
   * If undefined, loads the first level.
   *
   * @example
   * ```tsx
   * const mapData = useLoader(LDtkLoader, '/maps/world.ldtk', (loader) => {
   *   loader.levelId = 'Level_1';
   * });
   * ```
   */
  levelId: string | number | undefined = undefined

  /**
   * Normal-map generation. See {@link LDtkLoaderOptions.normals}.
   */
  normals: LDtkNormalsOption = false

  /**
   * Skip probing for baked `.normal.png` siblings. Forces the
   * in-memory bake path for `normals: true | descriptor`.
   */
  skipBakedProbe = false

  /**
   * Load an LDtk level asynchronously (for R3F useLoader compatibility).
   * Presets and levelId are automatically applied from instance properties.
   */
  loadAsync(url: string): Promise<TileMapData> {
    const resolved = resolveTextureOptions(this.preset, LDtkLoader.options)
    return LDtkLoader.load(url, this.levelId, {
      texture: resolved,
      normals: this.normals,
      skipBakedProbe: this.skipBakedProbe,
    })
  }

  // ==========================================
  // Static API for Three.js usage
  // ==========================================

  /**
   * Load a single level from an LDtk project (static method for Three.js usage).
   */
  static async load(
    url: string,
    levelId?: string | number,
    options?: LDtkLoaderOptions
  ): Promise<TileMapData> {
    const project = await this.loadProject(url)
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1)
    const resolved = resolveTextureOptions(options?.texture, this.options)

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

    return this.parseLevel(level, project, baseUrl, resolved, {
      normals: options?.normals ?? false,
      skipBakedProbe: options?.skipBakedProbe ?? false,
    })
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
    return response.json() as Promise<LDtkProject>
  }

  /**
   * Parse a single level.
   */
  private static async parseLevel(
    level: LDtkLevel,
    project: LDtkProject,
    baseUrl: string,
    textureOptions: TexturePreset | TextureOptions,
    normalsContext: {
      normals: LDtkNormalsOption
      skipBakedProbe: boolean
    }
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

      const tileset = await this.parseTileset(
        tsDef,
        baseUrl,
        firstGid,
        textureOptions,
        normalsContext
      )
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
          tileLayers.push(...this.parseTileLayer(layer, tilesets, project))
        } else if (layer.__type === 'Entities') {
          objectLayers.push(this.parseEntityLayer(layer))
        } else if (layer.__type === 'IntGrid') {
          if (layer.autoLayerTiles && layer.autoLayerTiles.length > 0) {
            tileLayers.push(...this.parseTileLayer(layer, tilesets, project))
          }
          objectLayers.push(this.parseIntGridLayer(layer, project))
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
    firstGid: number,
    textureOptions: TexturePreset | TextureOptions,
    normalsContext: {
      normals: LDtkNormalsOption
      skipBakedProbe: boolean
    }
  ): Promise<TilesetData> {
    const columns = Math.floor(def.pxWid / def.tileGridSize)
    const rows = Math.floor(def.pxHei / def.tileGridSize)
    const tileCount = columns * rows

    // Load texture
    const textureUrl = baseUrl + def.relPath
    const texture = await this.loadTexture(textureUrl, textureOptions)

    // Per-tile custom data — LDtk's free-form string field. If the
    // string parses as a JSON object, its keys are merged into
    // `properties` so they're directly consumable by effect schemas
    // (e.g. `{"normalKind": 1}` on a wall tile flows into the
    // TileNormalProvider's `normalKind` attribute). The raw string is
    // always preserved under `properties.customData` as a fallback.
    const tiles = new Map<number, TileDefinition>()
    for (const custom of def.customData) {
      const existing = tiles.get(custom.tileId) ?? {
        id: custom.tileId,
        uv: this.calculateUV(custom.tileId, def),
      }
      const merged: Record<string, unknown> = {
        ...(existing.properties ?? {}),
        customData: custom.data,
      }
      try {
        const parsed = JSON.parse(custom.data)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.assign(merged, parsed)
        }
      } catch {
        // Not JSON — leave the raw string under `customData` only.
      }
      existing.properties = merged
      tiles.set(custom.tileId, existing)
    }

    const tilesetData: TilesetData = {
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

    if (normalsContext.normals !== false) {
      tilesetData.normalMap = await this.resolveTilesetNormals(
        textureUrl,
        def,
        tiles,
        columns,
        rows,
        normalsContext.normals,
        normalsContext.skipBakedProbe,
        // The tilemap's instance UV layout is written assuming the
        // diffuse texture's flipY. Force the normal map to match so
        // both textures sample consistently at the same atlasUV.
        texture?.flipY ?? true
      )
    }

    return tilesetData
  }

  /**
   * Build a normal-source descriptor for a tileset from its tile
   * custom data and hand it to `resolveNormalMap`. Each tagged tile
   * emits a cap/face region pair via `tilesetToRegions`; untagged
   * tiles emit a single flat region per cell.
   */
  private static async resolveTilesetNormals(
    textureUrl: string,
    def: LDtkTilesetDef,
    tiles: Map<number, TileDefinition>,
    columns: number,
    rows: number,
    optionDescriptor: true | NormalSourceDescriptor,
    skipBakedProbe: boolean,
    diffuseFlipY: boolean
  ): Promise<import('three').Texture> {
    // Walk the tile grid, pairing each cell with its custom data
    // (if any). `tilesetToRegions` carves cap/face regions for
    // tiles that declare `tileDir`; untagged cells become flat.
    const cells: TilesetCell[] = []
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < columns; gx++) {
        const tileId = gy * columns + gx
        const x = def.padding + gx * (def.tileGridSize + def.spacing)
        const y = def.padding + gy * (def.tileGridSize + def.spacing)
        const tile = tiles.get(tileId)
        const meta = tile?.properties as TileNormalCustomData | undefined
        cells.push({ x, y, w: def.tileGridSize, h: def.tileGridSize, meta })
      }
    }
    const synthesized = tilesetToRegions(cells)

    const base: NormalSourceDescriptor =
      optionDescriptor === true ? {} : optionDescriptor
    const descriptor: NormalSourceDescriptor = {
      ...base,
      // User-provided regions win; otherwise use the synthesized list.
      regions: base.regions && base.regions.length > 0 ? base.regions : synthesized,
    }

    return resolveNormalMap(textureUrl, descriptor, {
      skipBakedProbe,
      flipY: diffuseFlipY,
    })
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
    _project: LDtkProject
  ): TileLayerData[] {
    const tiles = layer.gridTiles ?? layer.autoLayerTiles ?? []
    if (tiles.length === 0) return []

    const tileset = tilesets.find((ts) => {
      const tsDef = _project.defs.tilesets.find((d) => d.uid === layer.__tilesetDefUid)
      return tsDef && ts.name === tsDef.identifier
    })
    if (!tileset) return []

    // LDtk can stack multiple tiles at the same grid cell. Split into
    // sub-layers so each cell holds at most one tile — TileLayerData's
    // Uint32Array can only store one GID per index.
    const cellCount = layer.__cWid * layer.__cHei
    const subLayers: Uint32Array[] = [new Uint32Array(cellCount)]

    for (const tile of tiles) {
      const tileX = Math.floor(tile.px[0] / layer.__gridSize)
      const tileY = Math.floor(tile.px[1] / layer.__gridSize)
      const index = tileY * layer.__cWid + tileX

      let gid = tile.t + tileset.firstGid
      if (tile.f & 1) gid |= 0x80000000
      if (tile.f & 2) gid |= 0x40000000

      // Find the first sub-layer where this cell is empty
      let placed = false
      for (const data of subLayers) {
        if (data[index] === 0) {
          data[index] = gid
          placed = true
          break
        }
      }
      if (!placed) {
        const data = new Uint32Array(cellCount)
        data[index] = gid
        subLayers.push(data)
      }
    }

    const offset =
      layer.pxOffsetX !== 0 || layer.pxOffsetY !== 0
        ? { x: layer.pxOffsetX, y: layer.pxOffsetY }
        : undefined

    return subLayers.map((data, i) => ({
      name: subLayers.length > 1 ? `${layer.__identifier}_${i}` : layer.__identifier,
      id: layer.layerDefUid + i * 1000,
      width: layer.__cWid,
      height: layer.__cHei,
      data,
      offset,
      visible: layer.visible,
    }))
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
  private static parseIntGridLayer(layer: LDtkLayerInstance, project: LDtkProject): ObjectLayerData {
    const objects: TileMapObject[] = []
    const gridCsv = layer.intGridCsv ?? []

    // Build value→identifier lookup from layer definition
    const layerDef = project.defs.layers.find(l => l.uid === layer.layerDefUid)
    const valueNames = new Map<number, string>()
    if (layerDef && 'intGridValues' in layerDef) {
      for (const v of (layerDef as { intGridValues: Array<{ value: number; identifier: string }> }).intGridValues) {
        if (v.identifier) valueNames.set(v.value, v.identifier)
      }
    }

    let id = 0
    for (let y = 0; y < layer.__cHei; y++) {
      for (let x = 0; x < layer.__cWid; x++) {
        const index = y * layer.__cWid + x
        const value = gridCsv[index]

        if (value && value > 0) {
          const identifier = valueNames.get(value)
          objects.push({
            id: id++,
            name: identifier ?? `intgrid_${value}`,
            type: identifier ?? 'collision',
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
      name: layer.__identifier,
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
  private static parseColor(color: string | null | undefined): number {
    if (!color) return 0x000000
    if (color.startsWith('#')) {
      color = color.substring(1)
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
