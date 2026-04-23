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
import { DEVTOOLS_BUNDLED } from '../debug-protocol'
import {
  _registerMeshBatchSource,
  _unregisterMeshBatchSource,
  type MeshBatchEntry,
  type MeshBatchSourceFn,
} from '../debug/debug-sink'
import {
  LIT_FLAG_MASK,
  RECEIVE_SHADOWS_MASK,
  CAST_SHADOW_MASK,
} from '../materials/effectFlagBits'
import type { Tileset } from './Tileset'
import type { TileLayerData } from './types'

/** Internal per-chunk data */
interface ChunkData {
  mesh: InstancedMesh
  instanceUV: Float32Array
  instanceColor: Float32Array
  instanceFlip: Float32Array
  effectBufs: Map<string, Float32Array>
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

  /**
   * Bound mesh-source callback registered with the devtools sink so
   * each chunk's `InstancedMesh` shows up in the batch inspector.
   * Retained on the instance so `dispose()` can pass the same
   * reference to `_unregisterMeshBatchSource`.
   */
  private _batchMeshSource: MeshBatchSourceFn | null = null

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

  /** System flags bitmask — same semantics as Sprite2D._effectFlags */
  private _effectFlags: number = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK

  /** Whether the tileset texture uses flipY (loaded images vs DataTextures) */
  private readonly texFlipY: boolean

  /** Reusable matrix for transforms */
  private static tempMatrix = new Matrix4()
  private static tempScale = new Vector3()

  get lit(): boolean {
    return (this._effectFlags & LIT_FLAG_MASK) !== 0
  }

  set lit(value: boolean) {
    const was = (this._effectFlags & LIT_FLAG_MASK) !== 0
    if (was === value) return
    if (value) {
      this._effectFlags |= LIT_FLAG_MASK
    } else {
      this._effectFlags &= ~LIT_FLAG_MASK
    }
    this._syncEffectFlagsToChunks()
  }

  get receiveShadows(): boolean {
    return (this._effectFlags & RECEIVE_SHADOWS_MASK) !== 0
  }

  set receiveShadows(value: boolean) {
    const was = (this._effectFlags & RECEIVE_SHADOWS_MASK) !== 0
    if (was === value) return
    if (value) {
      this._effectFlags |= RECEIVE_SHADOWS_MASK
    } else {
      this._effectFlags &= ~RECEIVE_SHADOWS_MASK
    }
    this._syncEffectFlagsToChunks()
  }

  /**
   * Set castsShadow on a specific tile by its data-array index.
   * Use with IntGrid data to mark wall tiles as shadow casters.
   */
  setCastsShadowAt(tileX: number, tileY: number, value: boolean): void {
    const index = tileY * this.data.width + tileX
    const mapping = this.tileIndexMap.get(index)
    if (!mapping) return
    const chunk = this.chunks.get(mapping.chunkKey)
    if (!chunk) return
    const eb0 = chunk.effectBufs.get('effectBuf0')
    if (!eb0) return
    const off = mapping.instanceIndex * 4
    if (value) {
      eb0[off] = (eb0[off] ?? 0) | CAST_SHADOW_MASK
    } else {
      eb0[off] = (eb0[off] ?? 0) & ~CAST_SHADOW_MASK
    }
    const attr = chunk.mesh.geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
    attr.needsUpdate = true
  }

  private _syncEffectFlagsToChunks(): void {
    const flags = this._effectFlags
    for (const chunk of this.chunks.values()) {
      const eb0 = chunk.effectBufs.get('effectBuf0')
      if (!eb0) continue
      for (let i = 0; i < chunk.instanceCount; i++) {
        eb0[i * 4] = flags
      }
      const attr = chunk.mesh.geometry.getAttribute('effectBuf0') as InstancedBufferAttribute
      attr.needsUpdate = true
    }
  }

  /**
   * Write UV data for a tile into the instanceUV buffer.
   * Handles the flipY difference between loaded images (flipY=true) and DataTextures (flipY=false).
   *
   * With flipY=true: UV y=0 is image bottom, y=1 is image top. Tileset row 0 is at the visual top,
   * so we remap y to (1 - y - height) and use positive height (PlaneGeometry UV direction matches).
   *
   * With flipY=false: UV y=0 is first pixel row (image top). We offset y by +height and negate
   * height so the shader traverses UV space in the correct direction.
   */
  private writeUV(buffer: Float32Array, offset: number, uv: { x: number; y: number; width: number; height: number }): void {
    buffer[offset] = uv.x
    buffer[offset + 2] = uv.width
    if (this.texFlipY) {
      buffer[offset + 1] = 1.0 - uv.y - uv.height
      buffer[offset + 3] = uv.height
    } else {
      buffer[offset + 1] = uv.y + uv.height
      buffer[offset + 3] = -uv.height
    }
  }

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

    // Detect whether the texture uses flipY (loaded images = true, DataTextures = false)
    this.texFlipY = tileset.texture?.flipY ?? false

    this.material = new Sprite2DMaterial({
      map: tileset.texture ?? undefined,
      transparent: true,
    })
    this.material.depthWrite = true
    this.material.alphaTest = 0.5
    // Tag the material so devtools / scene walkers can distinguish
    // tile-layer materials from regular sprite materials at a glance.
    // `type` stays `'Sprite2DMaterial'` (they share a class); `name`
    // carries the layer-specific hint.
    this.material.name = `tilemap:${data.name}`

    // Register chunk meshes with the devtools sink so the batch
    // inspector sees tile-chunk draws alongside ECS sprite batches.
    // No-op in prod (tree-shaken by DEVTOOLS_BUNDLED).
    if (DEVTOOLS_BUNDLED) {
      this._batchMeshSource = () => this._iterChunkMeshes()
      _registerMeshBatchSource(this._batchMeshSource)
    }

    // Build chunked instanced meshes from tile data
    this.buildInstances()
  }

  /**
   * Lazy iterator over the current chunk meshes, tagged as
   * `kind: 'tilechunk'` with `label: 'chunk(x,y)'` so the batch
   * inspector can group tile chunks distinctly from sprite batches
   * and identify which chunk in the grid each draw corresponds to.
   *
   * Per-frame allocation cost: one small `{ mesh, kind, label }`
   * object per chunk. Chunk counts are tiny (1 per frustum-sized
   * region), so this is well below measurement noise — but the scratch
   * object is reused across frames via `_chunkEntryScratch` below.
   */
  private *_iterChunkMeshes(): Iterable<MeshBatchEntry> {
    let i = 0
    for (const [chunkKey, chunk] of this.chunks) {
      let entry = this._chunkEntryScratch[i]
      if (entry === undefined) {
        entry = { mesh: chunk.mesh, kind: 'tilechunk', label: '' }
        this._chunkEntryScratch[i] = entry
      }
      entry.mesh = chunk.mesh
      entry.kind = 'tilechunk'
      entry.label = `chunk(${chunkKey})`
      yield entry
      i++
    }
  }
  /** Reused `{ mesh, kind, label }` scratch — one slot per active chunk. */
  private _chunkEntryScratch: MeshBatchEntry[] = []

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
      // Per-tile shadow-occluder radius (world units). All tiles in a
      // layer share the same tile dimensions, so every slot gets the
      // same max-of-width/height. The shader needs this attribute
      // bound (lighting reads `instanceShadowRadius`) even for tiles
      // that never cast shadows.
      const instanceShadowRadius = new Float32Array(count)
      const tileRadius = Math.max(this.tileWidth, this.tileHeight)
      for (let i = 0; i < count; i++) instanceShadowRadius[i] = tileRadius

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

      const shadowRadiusAttr = new InstancedBufferAttribute(instanceShadowRadius, 1)
      shadowRadiusAttr.setUsage(DynamicDrawUsage)
      geometry.setAttribute('instanceShadowRadius', shadowRadiusAttr)

      // Add all effect buffer attributes from the material schema so the
      // shader's attribute() reads don't hit missing bindings.
      const effectBufs = new Map<string, Float32Array>()
      const schema = this.material.getInstanceAttributeSchema()
      for (const [name, config] of schema) {
        const size = config.type === 'vec4' ? 4 : config.type === 'vec3' ? 3 : config.type === 'vec2' ? 2 : 1
        const buf = new Float32Array(count * size)
        const attr = new InstancedBufferAttribute(buf, size)
        attr.setUsage(DynamicDrawUsage)
        geometry.setAttribute(name, attr)
        effectBufs.set(name, buf)
      }

      // Write system flags into effectBuf0.x (lit + receiveShadows)
      const eb0 = effectBufs.get('effectBuf0')
      if (eb0) {
        const flags = this._effectFlags
        for (let i = 0; i < count; i++) {
          eb0[i * 4] = flags
        }
      }

      // Track bounds for frustum culling
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      // Cache per-effect-field writer info so the hot loop below can map
      // `TileDefinition.properties[fieldName]` straight into the packed
      // effect buffers. Named properties whose key matches a registered
      // effect's schema field are written per-tile; anything else is
      // ignored. Tiles without matching properties fall back to the
      // effect's schema defaults (zero-init in the buffers since they
      // were just allocated).
      type FieldWriter = {
        effectName: string
        fieldName: string
        bufferName: string
        componentIndex: number
        size: number
      }
      const fieldWriters: FieldWriter[] = []
      for (const effectClass of this.material.getEffects()) {
        for (const field of effectClass._fields) {
          const loc = this.material.getEffectFieldLocation(
            effectClass.effectName,
            field.name
          )
          if (!loc) continue
          fieldWriters.push({
            effectName: effectClass.effectName,
            fieldName: field.name,
            bufferName: loc.bufferName,
            componentIndex: loc.componentIndex,
            size: loc.size,
          })
        }
      }

      // Populate buffers
      for (let i = 0; i < count; i++) {
        const tile = tiles[i]!

        // Map data index -> chunk location
        this.tileIndexMap.set(tile.dataIndex, { chunkKey, instanceIndex: i })

        // UV — handles flipY difference between loaded images and DataTextures
        const uv = this.tileset.getUV(tile.gid)
        this.writeUV(instanceUV, i * 4, uv)

        // Color: white, fully opaque
        instanceColor[i * 4 + 0] = 1
        instanceColor[i * 4 + 1] = 1
        instanceColor[i * 4 + 2] = 1
        instanceColor[i * 4 + 3] = 1

        // Flip via instanceFlip attribute
        instanceFlip[i * 2 + 0] = tile.flipH ? -1 : 1
        instanceFlip[i * 2 + 1] = tile.flipV ? -1 : 1

        // Per-tile effect attribute overrides from TileDefinition.properties.
        // Example: a tile with `{ normalKind: 1 }` in its properties sets
        // the `normalKind` field on any registered effect that declares it.
        const tileDef = this.tileset.getTile(tile.gid)
        const props = tileDef?.properties
        if (props && fieldWriters.length > 0) {
          for (const writer of fieldWriters) {
            const value = props[writer.fieldName]
            if (value === undefined) continue
            const buf = effectBufs.get(writer.bufferName)
            if (!buf) continue
            const base = i * 4 + writer.componentIndex
            if (writer.size === 1 && typeof value === 'number') {
              buf[base] = value
            } else if (Array.isArray(value)) {
              for (let c = 0; c < Math.min(writer.size, value.length); c++) {
                buf[base + c] = Number(value[c])
              }
            }
          }
        }

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
        effectBufs,
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
      this.writeUV(chunk.instanceUV, i * 4, uv)

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
      this.writeUV(chunk.instanceUV, i * 4, uv)

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
   * Clone for devtools/serialization compatibility.
   * TileLayer requires data/tileset in its constructor, so the default
   * Object3D.clone() (`new this.constructor()`) would crash.
   * Returns a Group containing cloned child meshes.
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
   * Dispose of all resources.
   */
  dispose(): void {
    if (DEVTOOLS_BUNDLED && this._batchMeshSource !== null) {
      _unregisterMeshBatchSource(this._batchMeshSource)
      this._batchMeshSource = null
    }
    for (const chunk of this.chunks.values()) {
      chunk.mesh.geometry.dispose()
    }
    this.chunks.clear()
    // Material is NOT disposed here — materials are shared resources.
    // Users/frameworks manage material lifecycle separately.
    this.tileIndexMap.clear()
    this.animatedTilePositions.clear()
    this.animationTimers.clear()
  }
}
