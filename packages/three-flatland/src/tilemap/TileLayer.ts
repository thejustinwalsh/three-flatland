import {
  Group,
  InstancedMesh,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  DynamicDrawUsage,
  Matrix4,
  Vector3,
} from 'three'
import type { BufferGeometry } from 'three'
import { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { MaterialEffect } from '../materials/MaterialEffect'
import { createSynthQuadGeometry } from '../pipeline/synthQuadGeometry'
import {
  _registerMeshBatchSource,
  _unregisterMeshBatchSource,
  type MeshBatchEntry,
  type MeshBatchSourceFn,
} from '../debug/debug-sink'
import { LIT_FLAG_MASK, RECEIVE_SHADOWS_MASK, CAST_SHADOW_MASK, PIXEL_PERFECT_MASK } from '../materials/effectFlagBits'
import type { Tileset } from './Tileset'
import type { TileLayerData } from './types'
import { resolvePixelPerfect, type RenderingSetting } from '../config/RenderingConfig'
import { registerTileLayerOperations } from '../internal/tile-layer-operations'
import { copyFlatlandMaterialState } from '../internal/flatland-material-state'
import { resolveTileEffectComponent } from '../internal/tile-effect-overrides'
import { notifyTileLayerDataChanged, releaseTileLayerOwner } from '../internal/tile-layer-ownership'

// Types the build-time `process.env` reads without requiring @types/node (shadows the global where present; erased at compile).
declare const process: { env: { NODE_ENV?: string; FL_DEVTOOLS?: string } }

/** Internal per-chunk data. `instanceData` is the interleaved core
 *  buffer (stride 16 floats): UV at offset 0, color at 4, system
 *  (flip/flags/enable) at 8, extras (shadowRadius/reserved) at 12. */
interface ChunkData {
  mesh: InstancedMesh
  instanceData: Float32Array
  effectBufs: Map<string, Float32Array>
  instanceCount: number
}

interface CleanupResult {
  didError: boolean
  error?: unknown
}

interface MaterialReplacement extends CleanupResult {
  previous: Sprite2DMaterial
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
 * // Standard three.js material state is supported on the live layer material.
 * layer.material.opacity = 0.8
 * ```
 *
 * Register shader effects through {@link TileMap2D.addEffect}; direct
 * `colorNode` assignments are replaced when the tile projection rebuilds.
 */
export class TileLayer extends Group {
  /** Class-level rendering defaults, resolved before {@link RenderingConfig}. */
  static options: RenderingSetting | undefined = undefined

  /** Layer data */
  readonly data: TileLayerData

  /** Tile dimensions */
  readonly tileWidth: number
  readonly tileHeight: number

  /** Chunk size in tiles (e.g., 256 means 256×256 tiles per chunk) */
  readonly chunkSize: number

  /** Material for standard three.js render state; use TileMap2D.addEffect for shader effects. */
  private _material: Sprite2DMaterial

  get material(): Sprite2DMaterial {
    return this._material
  }

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

  /** Terminal disposal latch. */
  private _disposed = false

  /** Reject nested projection mutation while user-extensible cleanup runs. */
  private _projectionTransition = false

  /** Invalidates an in-flight projection when disposal runs reentrantly. */
  private _lifecycleRevision = 0

  /** Retained effect instances provide live per-layer baseline values. */
  private _effects: readonly MaterialEffect[]

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

  /** Reused animation-update scratch; cleared and filled without per-frame allocation. */
  private readonly _changedAnimationGids = new Set<number>()
  private readonly _dirtyAnimationChunks = new Set<string>()

  /** Internal retirement is idempotent across reentrant disposal callbacks. */
  private readonly _retiredChunkGeometries = new WeakSet<BufferGeometry>()

  /** Reused two-phase projection scratch keeps live effect updates atomic and allocation-free. */
  private _effectSyncCount = 0
  private _effectSyncSize = 0
  private _effectSyncBufferName = ''
  private _effectValueTransition = false
  private readonly _effectSyncBuffers: Float32Array[] = []
  private readonly _effectSyncOffsets: number[] = []
  private readonly _effectSync0: number[] = []
  private readonly _effectSync1: number[] = []
  private readonly _effectSync2: number[] = []
  private readonly _effectSync3: number[] = []

  /** System flags bitmask (lit/receiveShadows/castsShadow) — same semantics as Sprite2D._systemFlags */
  private _systemFlags: number = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK

  /** Whether the tileset texture uses flipY (loaded images vs DataTextures) */
  private readonly texFlipY: boolean

  /** Reusable matrix for transforms */
  private static tempMatrix = new Matrix4()
  private static tempScale = new Vector3()

  get lit(): boolean {
    return (this._systemFlags & LIT_FLAG_MASK) !== 0
  }

  set lit(value: boolean) {
    this._assertMutable('lit')
    const was = (this._systemFlags & LIT_FLAG_MASK) !== 0
    if (was === value) return
    if (value) {
      this._systemFlags |= LIT_FLAG_MASK
    } else {
      this._systemFlags &= ~LIT_FLAG_MASK
    }
    this._syncEffectFlagsToChunks()
  }

  get receiveShadows(): boolean {
    return (this._systemFlags & RECEIVE_SHADOWS_MASK) !== 0
  }

  set receiveShadows(value: boolean) {
    this._assertMutable('receiveShadows')
    const was = (this._systemFlags & RECEIVE_SHADOWS_MASK) !== 0
    if (was === value) return
    if (value) {
      this._systemFlags |= RECEIVE_SHADOWS_MASK
    } else {
      this._systemFlags &= ~RECEIVE_SHADOWS_MASK
    }
    this._syncEffectFlagsToChunks()
  }

  get pixelPerfect(): boolean {
    return (this._systemFlags & PIXEL_PERFECT_MASK) !== 0
  }

  set pixelPerfect(value: boolean) {
    this._assertMutable('pixelPerfect')
    const was = (this._systemFlags & PIXEL_PERFECT_MASK) !== 0
    if (was === value) return
    if (value) {
      this._systemFlags |= PIXEL_PERFECT_MASK
    } else {
      this._systemFlags &= ~PIXEL_PERFECT_MASK
    }
    this._syncEffectFlagsToChunks()
  }

  /**
   * Set castsShadow on a specific tile by its data-array index.
   * Use with IntGrid data to mark wall tiles as shadow casters.
   */
  setCastsShadowAt(tileX: number, tileY: number, value: boolean): void {
    this._assertMutable('setCastsShadowAt')
    const index = tileY * this.data.width + tileX
    const mapping = this.tileIndexMap.get(index)
    if (!mapping) return
    const chunk = this.chunks.get(mapping.chunkKey)
    if (!chunk) return
    // System flags live in the interleaved core buffer at
    // `instanceSystem.z` (offset 10 within the 16-float stride). The
    // post-interleaved-refactor shader (`readCastShadowFlag`) reads
    // them from there; writing into `effectBuf0` is a no-op the
    // shader can't see, and `effectBuf0` may not even exist on the
    // chunk's geometry (only allocated when an effect needs it).
    const off = mapping.instanceIndex * 16 + 10
    const prev = chunk.instanceData[off] ?? 0
    chunk.instanceData[off] = value ? prev | CAST_SHADOW_MASK : prev & ~CAST_SHADOW_MASK
    // Mark the underlying InstancedInterleavedBuffer dirty — every
    // interleaved attribute (instanceUV/Color/System/Extras) shares
    // the same buffer, so one needsUpdate flag covers all of them.
    const attr = chunk.mesh.geometry.getAttribute('instanceSystem') as InterleavedBufferAttribute
    attr.data.needsUpdate = true
  }

  private _syncEffectFlagsToChunks(): void {
    // Only touch the bits the layer actually owns (`lit` /
    // `receiveShadows`). `castsShadow` is set per-tile by
    // `setCastsShadowAt` (driven by `markOccluders`) and would be
    // wiped if we did a wholesale write of the layer-level flags
    // word — toggling `layer.lit` after marking wall occluders
    // would silently un-mark them. Mask carves out the layer's
    // bits and merges them into each tile's existing flag word so
    // per-tile state survives layer-level toggles.
    const layerMask = LIT_FLAG_MASK | RECEIVE_SHADOWS_MASK | PIXEL_PERFECT_MASK
    const layerBits = this._systemFlags & layerMask
    const preserveMask = ~layerMask
    for (const chunk of this.chunks.values()) {
      const data = chunk.instanceData
      for (let i = 0; i < chunk.instanceCount; i++) {
        const off = i * 16 + 10
        const prev = data[off] ?? 0
        data[off] = (prev & preserveMask) | layerBits
      }
      const attr = chunk.mesh.geometry.getAttribute('instanceSystem') as InterleavedBufferAttribute
      attr.data.needsUpdate = true
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
  private writeUV(
    buffer: Float32Array,
    offset: number,
    uv: { x: number; y: number; width: number; height: number }
  ): void {
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
    chunkSize: number = 256,
    effects: readonly MaterialEffect[] = []
  ) {
    super()

    const classOptions = (this.constructor as typeof TileLayer).options
    if (resolvePixelPerfect(undefined, classOptions)) this._systemFlags |= PIXEL_PERFECT_MASK

    this.data = data
    this.tileset = tileset
    this.tileWidth = tileWidth
    this.tileHeight = tileHeight
    this.chunkSize = chunkSize
    this._effects = [...effects]
    registerTileLayerOperations(this, {
      beginEffectValues: (effect) => this.#beginEffectValues(effect),
      clearEffectValues: () => this.#clearEffectValues(),
      commitEffectValues: () => this.#commitEffectValues(),
      copyMaterialState: (source) => this.#copyMaterialState(source),
      dispose: (disposeMaterial, notifyOwner) => this.#dispose(disposeMaterial, notifyOwner),
      prepareEffectMaterial: (nextEffects) => this.#prepareEffectMaterial(nextEffects),
      prepareEffectValues: (effect, fieldName) => this.#prepareEffectValues(effect, fieldName),
      replaceMaterial: (current, nextEffects) => this.#replaceMaterial(current, nextEffects),
    })

    this.name = data.name
    this.visible = data.visible ?? true

    if (data.offset) {
      this.position.set(data.offset.x, data.offset.y, 0)
    }

    // Detect whether the texture uses flipY (loaded images = true, DataTextures = false)
    this.texFlipY = tileset.texture?.flipY ?? false

    this._material = new Sprite2DMaterial({
      map: tileset.texture ?? undefined,
      transparent: true,
    })
    this._material.depthWrite = true
    this._material.alphaTest = 0.5
    // Tag the material so devtools / scene walkers can distinguish
    // tile-layer materials from regular sprite materials at a glance.
    // `type` stays `'Sprite2DMaterial'` (they share a class); `name`
    // carries the layer-specific hint.
    this._material.name = `tilemap:${data.name}`
    try {
      for (const effect of effects) {
        const EffectClass = effect.constructor as typeof MaterialEffect
        this._material.registerEffect(EffectClass, effect._constants)
      }

      // Register chunk meshes with the devtools sink so the batch
      // inspector sees tile-chunk draws alongside ECS sprite batches.
      // No-op in prod (tree-shaken by the devtools build gate).
      if (process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true') {
        this._batchMeshSource = () => this._iterChunkMeshes()
        _registerMeshBatchSource(this._batchMeshSource)
      }

      // Build chunked instanced meshes from tile data
      const cleanup = this.buildInstances()
      if (cleanup.didError) throw cleanup.error
    } catch (error) {
      try {
        this.dispose()
      } catch {
        // Preserve the construction failure; cleanup is best-effort for an
        // instance that was never published.
      }
      throw error
    }
  }

  /** Build a replacement material without publishing it to the layer. @internal */
  #prepareEffectMaterial(effects: readonly MaterialEffect[]): Sprite2DMaterial {
    this._assertMutable('_prepareEffectMaterial')
    const previous = this._material
    const current = new Sprite2DMaterial({
      map: this.tileset.texture ?? undefined,
      transparent: previous.transparent,
      alphaTest: previous.alphaTest,
      premultipliedAlpha: previous.premultipliedAlpha,
      colorTransform: previous.colorTransform ?? undefined,
      globalUniforms: previous.globalUniforms ?? undefined,
    })
    try {
      this.#copyPublicMaterialState(current, previous)
      for (const effect of effects) {
        const EffectClass = effect.constructor as typeof MaterialEffect
        current.registerEffect(EffectClass, effect._constants)
      }
      // NodeMaterial.copy carries the old shader graph. Rebuild it only after
      // the replacement has its complete effect schema.
      current.setTexture(this.tileset.texture ?? null)
    } catch (error) {
      current.dispose()
      throw error
    }

    return current
  }

  /** Carry authored three.js material state into a newly built layer. @internal */
  #copyMaterialState(source: Sprite2DMaterial): void {
    this._assertMutable('_copyMaterialState')
    const initial = this._material
    const current = new Sprite2DMaterial({
      map: this.tileset.texture ?? undefined,
      transparent: source.transparent,
      alphaTest: source.alphaTest,
      premultipliedAlpha: source.variantOptions.premultipliedAlpha,
      colorTransform: source.colorTransform ?? undefined,
      globalUniforms: source.globalUniforms ?? undefined,
    })
    try {
      this.#copyPublicMaterialState(current, source)
      for (const effectClass of initial.getEffects()) {
        current.registerEffect(effectClass, initial._effectConstants.get(effectClass.effectName))
      }
      current.setTexture(this.tileset.texture ?? null)
    } catch (error) {
      current.dispose()
      throw error
    }
    const replacement = this.#replaceMaterial(current, this._effects)
    let firstError = replacement.error
    let didError = replacement.didError
    try {
      initial.dispose()
    } catch (error) {
      if (!didError) {
        firstError = error
        didError = true
      }
    }
    if (didError) throw firstError
  }

  /** Publish a prepared material and rebuild its chunk projection. @internal */
  #replaceMaterial(current: Sprite2DMaterial, effects: readonly MaterialEffect[]): MaterialReplacement {
    this._assertMutable('_replaceMaterial')
    const previous = this._material
    const previousEffects = this._effects
    this._material = current
    this._effects = [...effects]
    try {
      const cleanup = this.buildInstances()
      return { previous, ...cleanup }
    } catch (error) {
      if (this._disposed) throw error
      this._material = previous
      this._effects = previousEffects
      try {
        current.dispose()
      } catch {
        // Preserve the projection-build failure. The old projection was never
        // retired and buildInstances restored it before throwing.
      }
      throw error
    }
  }

  /** Prepare every row before publishing any live effect value. */
  #beginEffectValues(effect: MaterialEffect): void {
    this.#clearEffectValues()
    this._assertMutable('effect value update')
    if (!this._effects.includes(effect)) {
      throw new Error('TileLayer effect value update requires an attached effect')
    }
    this._effectValueTransition = true
  }

  #prepareEffectValues(effect: MaterialEffect, fieldName: string): void {
    if (!this._effectValueTransition) {
      throw new Error('TileLayer effect value update requires an active projection transition')
    }
    const effectClass = effect.constructor as typeof MaterialEffect
    const field = effectClass._fieldMap.get(fieldName)!
    const location = this.material.getEffectFieldLocation(effectClass.effectName, field.name)
    this._effectSyncCount = 0
    this._effectSyncSize = field.size
    this._effectSyncBufferName = location?.bufferName ?? ''
    if (!location) return
    for (const [dataIndex, mapping] of this.tileIndexMap) {
      const chunk = this.chunks.get(mapping.chunkKey)
      if (!chunk) continue
      const gid = (this.data.data[dataIndex] ?? 0) & 0x1fffffff
      const properties = this.tileset.getTile(gid)?.properties
      const buffer = chunk.effectBufs.get(location.bufferName)
      if (!buffer) continue
      const offset = mapping.instanceIndex * 4 + location.componentIndex
      const value = effect._defaults[field.name]!
      const tuple = typeof value === 'number' ? undefined : value
      const index = this._effectSyncCount++
      this._effectSyncBuffers[index] = buffer
      this._effectSyncOffsets[index] = offset
      this._effectSync0[index] = resolveTileEffectComponent(
        properties,
        field.name,
        field.size,
        0,
        typeof value === 'number' ? value : (tuple?.[0] ?? 0)
      )
      if (field.size >= 2) {
        this._effectSync1[index] = resolveTileEffectComponent(properties, field.name, field.size, 1, tuple?.[1] ?? 0)
      }
      if (field.size >= 3) {
        this._effectSync2[index] = resolveTileEffectComponent(properties, field.name, field.size, 2, tuple?.[2] ?? 0)
      }
      if (field.size >= 4) {
        this._effectSync3[index] = resolveTileEffectComponent(properties, field.name, field.size, 3, tuple?.[3] ?? 0)
      }
    }
  }

  /** Commit a fully prepared projection; no user-owned data is read here. */
  #commitEffectValues(): void {
    if (!this._effectValueTransition || this._disposed) {
      throw new Error('TileLayer effect value update cannot commit outside its projection transition')
    }
    for (let index = 0; index < this._effectSyncCount; index++) {
      const buffer = this._effectSyncBuffers[index]!
      const offset = this._effectSyncOffsets[index]!
      buffer[offset] = this._effectSync0[index]!
      if (this._effectSyncSize >= 2) buffer[offset + 1] = this._effectSync1[index]!
      if (this._effectSyncSize >= 3) buffer[offset + 2] = this._effectSync2[index]!
      if (this._effectSyncSize >= 4) buffer[offset + 3] = this._effectSync3[index]!
    }
    for (const chunk of this.chunks.values()) {
      const attribute = chunk.mesh.geometry.getAttribute(this._effectSyncBufferName) as
        | InstancedBufferAttribute
        | undefined
      if (attribute) attribute.needsUpdate = true
    }
  }

  /** Release every object reference retained by the reusable projection scratch. */
  #clearEffectValues(): void {
    this._effectValueTransition = false
    this._effectSyncCount = 0
    this._effectSyncSize = 0
    this._effectSyncBufferName = ''
    this._effectSyncBuffers.length = 0
    this._effectSyncOffsets.length = 0
    this._effectSync0.length = 0
    this._effectSync1.length = 0
    this._effectSync2.length = 0
    this._effectSync3.length = 0
  }

  #copyPublicMaterialState(target: Sprite2DMaterial, source: Sprite2DMaterial): void {
    target.copy(source)
    copyFlatlandMaterialState(target, source)
    target.colorTransform = source.colorTransform
    target.globalUniforms = source.globalUniforms
    target.requiredChannels = source.requiredChannels
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
  private buildInstances(): CleanupResult {
    this._assertMutable('buildInstances')
    if (this._projectionTransition) {
      throw new Error('TileLayer projection cannot be changed reentrantly')
    }
    this._projectionTransition = true
    const revision = this._lifecycleRevision
    try {
      return this._buildInstancesTransaction(revision)
    } finally {
      this._projectionTransition = false
    }
  }

  private _buildInstancesTransaction(revision: number): CleanupResult {
    const previous = {
      animatedTilePositions: this.animatedTilePositions,
      animationTimers: this.animationTimers,
      children: [...this.children],
      chunks: this.chunks,
      tileIndexMap: this.tileIndexMap,
      totalInstanceCount: this._totalInstanceCount,
    }

    this.chunks = new Map()
    this.tileIndexMap = new Map()
    this.animatedTilePositions = new Map()
    this.animationTimers = new Map()
    this._totalInstanceCount = 0

    try {
      this._buildInstancesIntoPublishedState()
    } catch (error) {
      this._retireChunks(this.chunks)
      if (this._disposed || this._lifecycleRevision !== revision) {
        this._retireChunks(previous.chunks)
        throw error
      }
      this.chunks = previous.chunks
      this.tileIndexMap = previous.tileIndexMap
      this.animatedTilePositions = previous.animatedTilePositions
      this.animationTimers = previous.animationTimers
      this._totalInstanceCount = previous.totalInstanceCount
      this._restoreChildren(previous.children)
      throw error
    }

    const newMeshes = [...this.chunks.values()].map((chunk) => chunk.mesh)
    const oldMeshes = new Set([...previous.chunks.values()].map((chunk) => chunk.mesh))
    const publishedChildren: (typeof this.children)[number][] = []
    let nextMesh = 0
    let lastOldSlot = -1
    for (const child of previous.children) {
      if (oldMeshes.has(child as InstancedMesh)) {
        lastOldSlot = publishedChildren.length
        const replacement = newMeshes[nextMesh++]
        if (replacement) publishedChildren.push(replacement)
      } else {
        publishedChildren.push(child)
      }
    }
    if (nextMesh < newMeshes.length) {
      publishedChildren.splice(lastOldSlot + 1, 0, ...newMeshes.slice(nextMesh))
    }

    const cleanup = this._retireChunks(previous.chunks)
    if (this._disposed || this._lifecycleRevision !== revision) {
      if (cleanup.didError) throw cleanup.error
      throw new Error('TileLayer projection was terminated during cleanup')
    }
    this._restoreChildren(publishedChildren)
    return cleanup
  }

  /** Populate the current empty projection while the previous one stays live. */
  private _buildInstancesIntoPublishedState(): void {
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

      // Allocate interleaved core buffer — 16 floats per instance
      // matching SpriteBatch's layout (see `INSTANCE_STRIDE` header
      // comment there). Keeps TileLayer under WebGPU's 8-buffer cap
      // and keeps the shader attribute shape identical to the sprite
      // path.
      const instanceData = new Float32Array(count * 16)

      // Create geometry with instance attributes — synth quad (corner
      // position/UV synthesized from vertexIndex by the material, not
      // read from the geometry's own position/uv attributes)
      const geometry = createSynthQuadGeometry()

      const interleaved = new InstancedInterleavedBuffer(instanceData, 16, 1)
      interleaved.setUsage(DynamicDrawUsage)
      geometry.setAttribute('instanceUV', new InterleavedBufferAttribute(interleaved, 4, 0))
      geometry.setAttribute('instanceColor', new InterleavedBufferAttribute(interleaved, 4, 4))
      geometry.setAttribute('instanceSystem', new InterleavedBufferAttribute(interleaved, 4, 8))
      geometry.setAttribute('instanceExtras', new InterleavedBufferAttribute(interleaved, 4, 12))

      // Add all effect buffer attributes from the material schema so the
      // shader's attribute() reads don't hit missing bindings. Effect
      // data is pure here — no system reservations.
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

      let effectEnableFlags = 0
      for (const effectClass of this.material.getEffects()) {
        const bitIndex = this.material._effectBitIndex.get(effectClass.effectName)
        if (bitIndex !== undefined) effectEnableFlags |= 1 << bitIndex
      }

      // Populate per-instance system data in the interleaved buffer:
      //   instanceSystem.x = flipX (1 by default, written below per-tile)
      //   instanceSystem.y = flipY (1 by default)
      //   instanceSystem.z = system flags (lit/receive/cast)
      //   instanceSystem.w = attached MaterialEffect enable bits
      //   instanceExtras.x = per-tile shadow radius (all tiles in a
      //                      layer share tile dimensions → same radius)
      //   instanceExtras.yzw = reserved
      const flags = this._systemFlags
      const tileRadius = Math.max(this.tileWidth, this.tileHeight)
      for (let i = 0; i < count; i++) {
        const base = i * 16
        // Initialize UV and color to sensible defaults; the per-tile
        // loop below overwrites UV. Color stays white/opaque.
        instanceData[base + 4] = 1 // color.r
        instanceData[base + 5] = 1 // color.g
        instanceData[base + 6] = 1 // color.b
        instanceData[base + 7] = 1 // color.a
        instanceData[base + 8] = 1 // flipX
        instanceData[base + 9] = 1 // flipY
        instanceData[base + 10] = flags
        instanceData[base + 11] = effectEnableFlags
        instanceData[base + 12] = tileRadius
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
      // ignored. Tiles without matching properties use the effect's
      // declared schema defaults.
      type FieldWriter = {
        effectName: string
        fieldName: string
        bufferName: string
        componentIndex: number
        size: number
        defaultValue: readonly number[]
      }
      const fieldWriters: FieldWriter[] = []
      for (const effectClass of this.material.getEffects()) {
        const effect = this._effects.find(
          (attached) => (attached.constructor as typeof MaterialEffect).effectName === effectClass.effectName
        )
        for (const field of effectClass._fields) {
          const loc = this.material.getEffectFieldLocation(effectClass.effectName, field.name)
          if (!loc) continue
          fieldWriters.push({
            effectName: effectClass.effectName,
            fieldName: field.name,
            bufferName: loc.bufferName,
            componentIndex: loc.componentIndex,
            size: loc.size,
            defaultValue: (() => {
              const value = effect?._defaults[field.name]
              return typeof value === 'number' ? [value] : (value ?? field.default)
            })(),
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
        const base = i * 16
        // UV at interleaved offset 0..3
        this.writeUV(instanceData, base + 0, uv)
        // Color already initialized to white/opaque by the outer loop.
        // Flip overrides the default (1, 1) at offset 8..9 only when
        // the tile is actually flipped.
        if (tile.flipH) instanceData[base + 8] = -1
        if (tile.flipV) instanceData[base + 9] = -1

        // Per-tile effect attribute overrides from TileDefinition.properties.
        // Example: a tile with `{ normalKind: 1 }` in its properties sets
        // the `normalKind` field on any registered effect that declares it.
        const tileDef = this.tileset.getTile(tile.gid)
        const props = tileDef?.properties
        for (const writer of fieldWriters) {
          const buf = effectBufs.get(writer.bufferName)
          if (!buf) continue
          const base = i * 4 + writer.componentIndex
          for (let c = 0; c < writer.size; c++) buf[base + c] = writer.defaultValue[c] ?? 0

          for (let component = 0; component < writer.size; component++) {
            buf[base + component] = resolveTileEffectComponent(
              props,
              writer.fieldName,
              writer.size,
              component,
              buf[base + component]!
            )
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
        TileLayer.tempMatrix.makeTranslation(tile.x + this.tileWidth / 2, tile.y + this.tileHeight / 2, 0)
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
        instanceData,
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
    this._assertMutable('update')
    if (this.animatedTilePositions.size === 0) return

    // Update animation timers
    const changedGids = this._changedAnimationGids
    changedGids.clear()
    const dirtyChunks = this._dirtyAnimationChunks
    dirtyChunks.clear()

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

    for (const [, data] of this.animatedTilePositions) {
      if (!changedGids.has(data.baseGid)) continue

      const timer = this.animationTimers.get(data.baseGid)!
      const animation = this.tileset.getAnimation(data.baseGid)!
      const newGid = animation[timer.frameIndex]!.tileId + this.tileset.firstGid

      const chunk = this.chunks.get(data.chunkKey)
      if (!chunk) continue

      const i = data.instanceIndex
      const uv = this.tileset.getUV(newGid)
      // UV lives at offset 0 within each instance's 16-float stride.
      this.writeUV(chunk.instanceData, i * 16 + 0, uv)

      data.gid = newGid
      dirtyChunks.add(data.chunkKey)
    }

    for (const chunkKey of dirtyChunks) {
      const chunk = this.chunks.get(chunkKey)
      if (chunk) {
        // Any attribute view into the interleaved buffer re-uploads the
        // full stride when we flip `data.needsUpdate`.
        const uvAttr = chunk.mesh.geometry.getAttribute('instanceUV') as InterleavedBufferAttribute
        if (uvAttr && (uvAttr.data as { needsUpdate?: boolean })) {
          ;(uvAttr.data as { needsUpdate: boolean }).needsUpdate = true
        }
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
    this._assertMutable('setTileAt')
    const { width, height, data } = this.data
    if (tileX < 0 || tileX >= width || tileY < 0 || tileY >= height) {
      return
    }
    this._projectionTransition = true
    const revision = this._lifecycleRevision
    try {
      const index = tileY * width + tileX
      const oldRawGid = data[index] ?? 0
      const oldGid = oldRawGid & 0x1fffffff
      const mapping = this.tileIndexMap.get(index)
      const nextGid = gid & 0x1fffffff
      const needsProjectionRebuild = this._requiresTileProjectionRebuild(oldGid, nextGid)
      let preparedUv: { x: number; y: number; width: number; height: number } | undefined
      if (oldGid !== 0 && nextGid !== 0 && mapping && !needsProjectionRebuild) {
        const uv = this.tileset.getUV(nextGid)
        // Snapshot user-supplied TileDefinition accessors before publishing the
        // logical GID so a throwing component getter cannot split CPU/GPU state.
        preparedUv = { x: uv.x, y: uv.y, width: uv.width, height: uv.height }
      }
      if (this._disposed || this._lifecycleRevision !== revision) {
        throw new Error('TileLayer tile mutation was terminated during preparation')
      }

      // Publish logical data only after every observable preparation step and
      // the lifecycle revision check have succeeded.
      data[index] = gid

      if (mapping && preparedUv) {
        // Non-zero -> non-zero: update UV in-place within the chunk
        const chunk = this.chunks.get(mapping.chunkKey)
        if (!chunk) return

        const i = mapping.instanceIndex
        const base = i * 16
        this.writeUV(chunk.instanceData, base + 0, preparedUv)
        chunk.instanceData[base + 8] = (gid & 0x80000000) !== 0 ? -1 : 1
        chunk.instanceData[base + 9] = (gid & 0x40000000) !== 0 ? -1 : 1

        const uvAttr = chunk.mesh.geometry.getAttribute('instanceUV') as InterleavedBufferAttribute
        if (uvAttr && (uvAttr.data as { needsUpdate?: boolean })) {
          ;(uvAttr.data as { needsUpdate: boolean }).needsUpdate = true
        }
        notifyTileLayerDataChanged(this)
      } else {
        // Tile added or removed — rebuild the entire layer inside the already
        // active mutation transition.
        let cleanup: CleanupResult
        try {
          cleanup = this._buildInstancesTransaction(revision)
        } catch (error) {
          data[index] = oldRawGid
          throw error
        }
        let firstError = cleanup.error
        let didError = cleanup.didError
        try {
          notifyTileLayerDataChanged(this)
        } catch (error) {
          if (!didError) {
            firstError = error
            didError = true
          }
        }
        if (didError) throw firstError
      }
    } finally {
      this._projectionTransition = false
    }
  }

  private _requiresTileProjectionRebuild(previousGid: number, currentGid: number): boolean {
    if (previousGid === currentGid) return false
    if (this.tileset.isAnimated(previousGid) || this.tileset.isAnimated(currentGid)) return true
    const previousProperties = this.tileset.getTile(previousGid)?.properties
    const currentProperties = this.tileset.getTile(currentGid)?.properties
    for (const effectClass of this.material.getEffects()) {
      const effect = this._effects.find(
        (attached) => (attached.constructor as typeof MaterialEffect).effectName === effectClass.effectName
      )
      for (const field of effectClass._fields) {
        const baseline = effect?._defaults[field.name]
        for (let component = 0; component < field.size; component++) {
          const fallback =
            typeof baseline === 'number' ? baseline : (baseline?.[component] ?? field.default[component] ?? 0)
          const previousValue = resolveTileEffectComponent(
            previousProperties,
            field.name,
            field.size,
            component,
            fallback
          )
          const currentValue = resolveTileEffectComponent(
            currentProperties,
            field.name,
            field.size,
            component,
            fallback
          )
          if (!Object.is(previousValue, currentValue)) return true
        }
      }
    }
    return false
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
    this.#dispose(true, true)
  }

  #dispose(disposeMaterial: boolean, notifyOwner: boolean): void {
    if (this._disposed) return
    this._disposed = true
    this._lifecycleRevision++
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
    if (notifyOwner) {
      try {
        const release = releaseTileLayerOwner(this)
        disposeMaterial &&= !release.retainMaterial
        if (release.didError) {
          firstError = release.error
          didError = true
        }
      } catch (error) {
        firstError = error
        didError = true
      }
    }
    if (
      (process.env.NODE_ENV !== 'production' || process.env.FL_DEVTOOLS === 'true') &&
      this._batchMeshSource !== null
    ) {
      runCleanup(() => _unregisterMeshBatchSource(this._batchMeshSource!))
      this._batchMeshSource = null
    }
    for (const chunk of Array.from(this.chunks.values())) {
      runCleanup(() => this.remove(chunk.mesh))
      this._forceDetach(chunk.mesh)
      runCleanup(() => this._disposeChunkGeometry(chunk.mesh.geometry))
    }
    this.chunks.clear()
    if (disposeMaterial) runCleanup(() => this._material.dispose())
    this.tileIndexMap.clear()
    this.animatedTilePositions.clear()
    this.animationTimers.clear()
    this.#clearEffectValues()
    this._totalInstanceCount = 0
    if (didError) throw firstError
  }

  private _assertMutable(member: string): void {
    if (this._disposed) throw new Error(`TileLayer.${member} cannot be used after dispose()`)
    if (this._projectionTransition) {
      throw new Error(`TileLayer.${member} cannot run during a projection transition`)
    }
    if (this._effectValueTransition) {
      throw new Error(`TileLayer.${member} cannot run during an effect value transition`)
    }
  }

  private _forceDetach(child: InstancedMesh): void {
    const parent = child.parent
    if (parent) {
      const index = parent.children.indexOf(child)
      if (index !== -1) parent.children.splice(index, 1)
      child.parent = null
    }
  }

  private _restoreChildren(children: readonly (typeof this.children)[number][]): void {
    const retained = new Set(children)
    const currentChildren = this.children.slice()
    for (const child of currentChildren) {
      if (!retained.has(child)) {
        const parent = child.parent
        if (parent) {
          const index = parent.children.indexOf(child)
          if (index !== -1) parent.children.splice(index, 1)
        }
        child.parent = null
      }
    }
    for (const child of children) {
      const parent = child.parent
      if (parent && parent !== this) {
        const index = parent.children.indexOf(child)
        if (index !== -1) parent.children.splice(index, 1)
      }
      child.parent = this
    }
    this.children.length = 0
    this.children.push(...children)
  }

  private _retireChunks(chunks: ReadonlyMap<string, ChunkData>): CleanupResult {
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
    for (const chunk of Array.from(chunks.values())) {
      runCleanup(() => this.remove(chunk.mesh))
      this._forceDetach(chunk.mesh)
      runCleanup(() => this._disposeChunkGeometry(chunk.mesh.geometry))
    }
    return didError ? { didError, error: firstError } : { didError }
  }

  private _disposeChunkGeometry(geometry: BufferGeometry): void {
    if (this._retiredChunkGeometries.has(geometry)) return
    this._retiredChunkGeometries.add(geometry)
    geometry.dispose()
  }
}
