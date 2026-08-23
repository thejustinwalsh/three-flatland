import { Group, Box3, Matrix4, Vector3 } from 'three'
import type { Intersection, Raycaster } from 'three'
import { Tileset } from './Tileset'
import { TileLayer } from './TileLayer'
import type { MaterialEffect } from '../materials/MaterialEffect'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type {
  TileMapData,
  TileMap2DOptions,
  TileLayerData,
  ObjectLayerData,
  TileMapObject,
  CollisionShape,
} from './types'
import { rayPlaneZ0, createIntersection } from '../events/raycastHelpers'
import { resolvePixelPerfect, type RenderingSetting } from '../config/RenderingConfig'

const _tileInvMatrix = new Matrix4()
const _tileLocalPoint = new Vector3()

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
 * // Three.js
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
  /** Class-level rendering defaults, resolved before {@link RenderingConfig}. */
  static options: RenderingSetting | undefined = undefined

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

  /** Snap tile pivots to physical pixels. */
  private _pixelPerfect = false

  /** Tilesets */
  private tilesets: Tileset[] = []

  /** Tile layers */
  private tileLayers: TileLayer[] = []

  /** Material effects retained across data/chunk rebuilds and R3F lifecycles. */
  private readonly _effects: MaterialEffect[] = []

  /** Flatland observers reconcile lighting/global state when layer materials change. */
  private readonly _materialListeners = new Set<
    (previous: readonly Sprite2DMaterial[], current: readonly Sprite2DMaterial[]) => void
  >()

  /** Flatland observes terminal disposal so scene and material ownership retire canonically. */
  private readonly _disposeListeners = new Set<() => void>()

  /** Disposal is terminal; a disposed map cannot rebuild untracked projection resources. */
  private _disposed = false

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
    const classOptions = (this.constructor as typeof TileMap2D).options
    this._pixelPerfect = resolvePixelPerfect(options?.pixelPerfect, classOptions)

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
    this._assertMutable('data')
    if (this._data === value) return
    this._rebuildProjection(value, this._chunkSize, true)
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
    this._assertMutable('chunkSize')
    if (this._chunkSize === value) return
    if (this._data) this._rebuildProjection(this._data, value, false)
    else this._chunkSize = value
  }

  /**
   * Get/set collision extraction flag.
   */
  get enableCollision(): boolean {
    return this._enableCollision
  }

  set enableCollision(value: boolean) {
    this._assertMutable('enableCollision')
    if (this._enableCollision === value) return
    this._enableCollision = value
    if (this._data && value) {
      this.extractCollisionData()
    } else {
      this.collisionShapes = []
    }
  }

  /** Whether every rendered tile snaps its projected pivot to physical pixels. */
  get pixelPerfect(): boolean {
    return this._pixelPerfect
  }

  set pixelPerfect(value: boolean) {
    this._assertMutable('pixelPerfect')
    if (value === this._pixelPerfect) return
    this._pixelPerfect = value
    for (const layer of this.tileLayers) layer.pixelPerfect = value
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
    this._bounds = new Box3(new Vector3(0, 0, 0), new Vector3(this._widthInPixels, this._heightInPixels, 0))

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
          this._chunkSize,
          this._effects
        )
        layer.pixelPerfect = this._pixelPerfect

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
      if (objLayer.name.toLowerCase().includes('collision') || objLayer.name.toLowerCase().includes('solid')) {
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
  private transformShape(shape: CollisionShape, offsetX: number, offsetY: number): CollisionShape {
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

  get lit(): boolean {
    return this.tileLayers[0]?.lit ?? true
  }

  set lit(value: boolean) {
    this._assertMutable('lit')
    for (const layer of this.tileLayers) {
      layer.lit = value
    }
  }

  get receiveShadows(): boolean {
    return this.tileLayers[0]?.receiveShadows ?? true
  }

  set receiveShadows(value: boolean) {
    this._assertMutable('receiveShadows')
    for (const layer of this.tileLayers) {
      layer.receiveShadows = value
    }
  }

  /**
   * Register a MaterialEffect on all tile layer materials.
   * Use this to add channel providers (e.g. NormalMapProvider) so
   * tilemaps participate in the lighting pipeline's channel system.
   *
   * @example
   * ```tsx
   * <tileMap2D data={mapData}>
   *   <normalMapProvider attach={attachEffect} />
   * </tileMap2D>
   * ```
   */
  addEffect(effect: MaterialEffect): this {
    this._assertMutable('addEffect')
    if (this._effects.includes(effect)) return this
    if (effect._sprite) {
      throw new Error(
        `TileMap2D.addEffect: effect '${effect.name}' is already attached to a sprite; remove it before reattaching`
      )
    }
    if (effect._tileMap && effect._tileMap !== this) {
      throw new Error(
        `TileMap2D.addEffect: effect '${effect.name}' is already attached to another tilemap; remove it before reattaching`
      )
    }
    const EffectClass = effect.constructor as typeof MaterialEffect
    if (this._effects.some((attached) => attached.constructor === EffectClass)) {
      throw new Error(
        `TileMap2D.addEffect: only one '${EffectClass.effectName}' instance may be attached to a tilemap at a time`
      )
    }
    for (const layer of this.tileLayers) {
      layer.material._assertEffectRegistrations([{ effectClass: EffectClass, constants: effect._constants }])
    }

    const nextEffects = [...this._effects, effect]
    this._reconcileEffects(nextEffects, () => {
      effect._attachTileMap(this)
      this._effects.push(effect)
    })
    return this
  }

  removeEffect(effect: MaterialEffect): this {
    this._assertMutable('removeEffect')
    const index = this._effects.indexOf(effect)
    if (index === -1) return this
    const nextEffects = this._effects.filter((attached) => attached !== effect)
    this._reconcileEffects(nextEffects, () => {
      this._effects.splice(index, 1)
      effect._detachTileMap()
    })
    return this
  }

  /** Observe one atomic old/new layer-material replacement. @internal */
  _subscribeLayerMaterials(
    listener: (previous: readonly Sprite2DMaterial[], current: readonly Sprite2DMaterial[]) => void
  ): () => void {
    this._materialListeners.add(listener)
    return () => this._materialListeners.delete(listener)
  }

  /** Observe terminal disposal while this map is owned by a Flatland. @internal */
  _subscribeDispose(listener: () => void): () => void {
    this._disposeListeners.add(listener)
    return () => this._disposeListeners.delete(listener)
  }

  /** Whether this tilemap has crossed its terminal disposal boundary. @internal */
  _isDisposed(): boolean {
    return this._disposed
  }

  private _layerMaterials(): Sprite2DMaterial[] {
    return this.tileLayers.map((layer) => layer.material)
  }

  private _assertMutable(member: string): void {
    if (this._disposed) throw new Error(`TileMap2D.${member} cannot be used after dispose()`)
  }

  private _notifyMaterialReplacement(previous: readonly Sprite2DMaterial[]): void {
    if (this._materialListeners.size === 0) return
    const current = this._layerMaterials()
    for (const listener of this._materialListeners) listener(previous, current)
  }

  /** Build a replacement projection before retiring the currently published one. */
  private _rebuildProjection(data: TileMapData | null, chunkSize: number, disposePreviousTilesets: boolean): void {
    const previous = {
      bounds: this._bounds,
      children: [...this.children],
      chunkSize: this._chunkSize,
      collisionShapes: this.collisionShapes,
      data: this._data,
      heightInPixels: this._heightInPixels,
      heightInTiles: this._heightInTiles,
      objectLayers: this.objectLayers,
      tileHeight: this._tileHeight,
      tileLayers: this.tileLayers,
      tileWidth: this._tileWidth,
      tilesets: this.tilesets,
      widthInPixels: this._widthInPixels,
      widthInTiles: this._widthInTiles,
    }
    const previousMaterials = previous.tileLayers.map((layer) => layer.material)

    try {
      // Object3D.remove() mutates the hierarchy before dispatching `removed`.
      // Keep retirement inside the transaction so a throwing user listener
      // can restore every old layer instead of stranding a partial projection.
      for (const layer of previous.tileLayers) this.remove(layer)
      this.tileLayers = []
      this.tilesets = []
      this.objectLayers = []
      this.collisionShapes = []
      this._chunkSize = chunkSize
      if (data) this.buildMap(data)
    } catch (error) {
      if (this.tileLayers !== previous.tileLayers) {
        try {
          this.disposeInternal(
            false,
            disposePreviousTilesets,
            new Set(previous.tilesets.map((tileset) => tileset.texture))
          )
        } catch {
          // Preserve the exact transaction failure. disposeInternal remains
          // first-error-safe and has already retired every prepared resource.
        }
      }
      this._bounds = previous.bounds
      this._chunkSize = previous.chunkSize
      this.collisionShapes = previous.collisionShapes
      this._data = previous.data
      this._heightInPixels = previous.heightInPixels
      this._heightInTiles = previous.heightInTiles
      this.objectLayers = previous.objectLayers
      this._tileHeight = previous.tileHeight
      this.tileLayers = previous.tileLayers
      this._tileWidth = previous.tileWidth
      this.tilesets = previous.tilesets
      this._widthInPixels = previous.widthInPixels
      this._widthInTiles = previous.widthInTiles
      for (const layer of previous.tileLayers) {
        if (layer.parent === this) continue
        try {
          this.add(layer)
        } catch {
          // Object3D.add() publishes parent/children before user `added`
          // listeners run. Preserve the original retirement failure.
        }
      }
      const previousChildren = new Set(previous.children)
      for (const child of this.children) {
        if (!previousChildren.has(child) && child.parent === this) child.parent = null
      }
      for (const child of previous.children) {
        if (child.parent === this) continue
        const currentParent = child.parent
        if (currentParent) {
          const currentIndex = currentParent.children.indexOf(child)
          if (currentIndex !== -1) currentParent.children.splice(currentIndex, 1)
        }
        child.parent = this
      }
      this.children.length = 0
      for (const child of previous.children) this.children.push(child)
      throw error
    }

    this._data = data
    let firstError: unknown
    let didError = false
    const runCleanup = (cleanup: () => void): void => {
      try {
        cleanup()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    runCleanup(() => this._notifyMaterialReplacement(previousMaterials))
    for (const layer of previous.tileLayers) runCleanup(() => layer.dispose())
    if (disposePreviousTilesets) {
      const retainedTextures = new Set(this.tilesets.map((tileset) => tileset.texture))
      for (const tileset of previous.tilesets) {
        if (!retainedTextures.has(tileset.texture)) runCleanup(() => tileset.dispose())
      }
    }
    if (didError) throw firstError
  }

  private _reconcileEffects(effects: readonly MaterialEffect[], commitOwnership: () => void): void {
    if (this.tileLayers.length === 0) {
      commitOwnership()
      return
    }
    const prepared: Sprite2DMaterial[] = []
    try {
      for (const layer of this.tileLayers) prepared.push(layer._prepareEffectMaterial(effects))
    } catch (error) {
      for (const material of prepared) {
        try {
          material.dispose()
        } catch {
          // Preserve the preparation failure after draining every prepared material.
        }
      }
      throw error
    }

    const previous: Sprite2DMaterial[] = []
    try {
      for (let index = 0; index < this.tileLayers.length; index++) {
        previous.push(this.tileLayers[index]!._replaceMaterial(prepared[index]!))
      }
    } catch (error) {
      // A chunk allocation/build failure is rare, but a retained owner must
      // still observe either the complete old projection or the complete new
      // one. Restore every committed layer before publishing a replacement.
      for (let index = previous.length - 1; index >= 0; index--) {
        try {
          const abandoned = this.tileLayers[index]!._replaceMaterial(previous[index]!)
          abandoned.dispose()
        } catch {
          // Preserve the replacement failure after best-effort rollback.
        }
      }
      for (let index = previous.length + 1; index < prepared.length; index++) {
        try {
          prepared[index]!.dispose()
        } catch {
          // Preserve the replacement failure while draining prepared materials.
        }
      }
      throw error
    }

    try {
      for (const listener of this._materialListeners) listener(previous, prepared)
    } catch (error) {
      for (let index = previous.length - 1; index >= 0; index--) {
        try {
          const abandoned = this.tileLayers[index]!._replaceMaterial(previous[index]!)
          abandoned.dispose()
        } catch {
          // Preserve the publication failure. Each layer replacement restores
          // its prior material internally before throwing.
        }
      }
      try {
        this._notifyMaterialReplacement(prepared)
      } catch {
        // Best-effort owner rollback; preserve the original notification error.
      }
      throw error
    }

    commitOwnership()

    let firstError: unknown
    let didError = false
    for (const material of previous) {
      try {
        material.dispose()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    if (didError) throw firstError
  }

  /**
   * Mark tiles as shadow casters based on object layer data.
   * Typically called with IntGrid-derived collision objects.
   *
   * @param types - Object types to treat as occluders (e.g. ['collision', 'torch_switch'])
   * @param layerIndex - Which tile layer to mark (default: 0)
   */
  markOccluders(types: string[], layerIndex = 0): void {
    this._assertMutable('markOccluders')
    const layer = this.tileLayers[layerIndex]
    if (!layer || !this._data) return
    const typeSet = new Set(types)
    for (const objLayer of this.objectLayers) {
      for (const obj of objLayer.objects) {
        if (!typeSet.has(obj.type)) continue
        const tileX = Math.floor(obj.x / this._tileWidth)
        const tileY = Math.floor(obj.y / this._tileHeight)
        layer.setCastsShadowAt(tileX, tileY, true)
      }
    }
  }

  /**
   * Update animated tiles.
   * Call this in your animation loop with delta time in milliseconds.
   */
  update(deltaMs: number): void {
    this._assertMutable('update')
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
   * Canonical three.js raycast: O(1) arithmetic tile lookup on the
   * local Z=0 plane. Top-most layer with a non-zero GID wins;
   * `faceIndex` carries the layer index. Returns `false` to stop
   * three's traversal from recursing into TileLayer children
   * (spec §7.2 / §11.1).
   */
  override raycast(raycaster: Raycaster, intersects: Intersection[]): false {
    // See Sprite2D.raycast — Flatland's internal scene disables
    // matrixWorldAutoUpdate, so refresh (ancestors included, for
    // raycasts issued outside the frame loop) before reading matrixWorld.
    this.updateWorldMatrix(true, false)
    const hit = rayPlaneZ0(raycaster, this)
    if (!hit) return false
    const { localX, localY } = hit
    if (localX < 0 || localX >= this._widthInPixels || localY < 0 || localY >= this._heightInPixels) {
      return false
    }
    for (let i = this.tileLayers.length - 1; i >= 0; i--) {
      const gid = this.getTileAtWorld(localX, localY, i)
      if (gid === 0) continue
      const u = (localX % this._tileWidth) / this._tileWidth
      const v = (localY % this._tileHeight) / this._tileHeight
      const intersection = createIntersection(hit, this, u, v)
      intersection.faceIndex = i
      intersects.push(intersection)
      break
    }
    return false
  }

  /**
   * Resolve a raycast intersection produced by this tilemap into
   * layer + tile coordinates (Tiled Y-down) + GID. Returns null for
   * foreign intersections. Spec §7.2.
   */
  tileFromIntersection(hit: Intersection): { layer: number; tileX: number; tileY: number; gid: number } | null {
    if (hit.object !== this || hit.faceIndex === undefined || hit.faceIndex === null) return null
    _tileLocalPoint.copy(hit.point).applyMatrix4(_tileInvMatrix.copy(this.matrixWorld).invert())
    const { x: tileX, y: tileY } = this.worldToTile(_tileLocalPoint.x, _tileLocalPoint.y)
    const gid = this.tileLayers[hit.faceIndex]?.getTileAt(tileX, tileY) ?? 0
    return { layer: hit.faceIndex, tileX, tileY, gid }
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
    return this._bounds
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
   * Clone for devtools/serialization compatibility.
   * Returns a Group containing cloned child layers for visual inspection.
   */
  override clone(recursive?: boolean): this {
    const cloned = new Group()
    cloned.name = this.name
    cloned.visible = this.visible
    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
    if (recursive !== false) {
      for (const child of this.children) {
        cloned.add(child.clone(true))
      }
    }
    return cloned as unknown as this
  }

  /**
   * Dispose internal resources (without clearing external references).
   */
  private disposeInternal(
    notify = true,
    disposeTilesets = true,
    protectedTextures: ReadonlySet<unknown> = new Set()
  ): void {
    let firstError: unknown
    let didError = false
    const runCleanup = (cleanup: () => void): void => {
      try {
        cleanup()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    const previousMaterials = notify ? this._layerMaterials() : []
    for (const layer of this.tileLayers) {
      runCleanup(() => this.remove(layer))
      runCleanup(() => layer.dispose())
    }
    if (disposeTilesets) {
      for (const tileset of this.tilesets) {
        if (!protectedTextures.has(tileset.texture)) runCleanup(() => tileset.dispose())
      }
    }
    this.tileLayers = []
    this.tilesets = []
    this.objectLayers = []
    this.collisionShapes = []
    if (notify) runCleanup(() => this._notifyMaterialReplacement(previousMaterials))
    if (didError) throw firstError
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    let firstError: unknown
    let didError = false
    const runCleanup = (cleanup: () => void): void => {
      try {
        cleanup()
      } catch (error) {
        if (!didError) {
          firstError = error
          didError = true
        }
      }
    }
    const disposeListeners = new Set(this._disposeListeners)
    for (const listener of disposeListeners) runCleanup(listener)
    this._disposeListeners.clear()
    runCleanup(() => this.disposeInternal(false))
    for (const effect of this._effects) runCleanup(() => effect._detachTileMap())
    this._effects.length = 0
    this._materialListeners.clear()
    this._data = null
    if (didError) throw firstError
  }
}
