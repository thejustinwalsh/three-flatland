import {
  InstancedMesh,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  DynamicDrawUsage,
  Sphere,
  Vector3,
  type Matrix4,
  type Raycaster,
  type Intersection,
} from 'three'
import { SpriteSpatialGrid, quadHalfExtents } from './SpriteSpatialGrid'
import { retireBatchPicking, isR3FManaged } from '../react/batchPicking'
import type { Sprite2D } from '../sprites/Sprite2D'
import { createSynthQuadGeometry } from './synthQuadGeometry'
import { buildEnvelopeGeometry } from './envelopeGeometry'
import { getAtlasMesh } from '../loaders/atlasMeshRegistry'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { InstanceAttributeType } from './types'
import { BucketedDirtyTracker } from './BucketedDirtyTracker'

/**
 * Fallback slot count when a batch is constructed without an explicit
 * size (tests, direct construction). Orchestrated paths always pass a
 * size — the tier ladder for auto-batch, `maxBatchSize` for explicit
 * SpriteGroup opt-ins.
 */
const FALLBACK_BATCH_SIZE = 16384

/**
 * Stride (in floats) of the interleaved per-instance core buffer. Layout
 * matches four vec4 logical slots backed by one underlying buffer:
 *
 *   offset  0..3   instanceUV       (uv.x, uv.y, uv.w, uv.h)
 *   offset  4..7   instanceColor    (r, g, b, a)
 *   offset  8..11  instanceSystem   (flipX, flipY, sysFlags, enableBits)
 *   offset 12..15  instanceExtras   (shadowRadius, reserved×3)
 *
 * Packing all four into one `InstancedInterleavedBuffer` collapses what
 * was previously 3 vertex-buffer bindings (instanceUV / instanceColor /
 * instanceFlip) into 1, freeing 2 slots under WebGPU's
 * `maxVertexBuffers = 8` cap for `effectBuf*` growth.
 */
export const INSTANCE_STRIDE = 16

const OFFSET_UV = 0
const OFFSET_COLOR = 4
const OFFSET_SYSTEM = 8
const OFFSET_EXTRAS = 12

/**
 * Dirty-tracker bucket size. Must be a power of 2. At the default
 * batch size of 16384 this produces 64 buckets per attribute — enough
 * spatial resolution to localize sparse uploads, few enough that the
 * flush walk stays sub-microsecond.
 */
const BUCKET_SIZE = 256

/**
 * Per-attribute thresholds for the "ranged vs full upload" decision in
 * `BucketedDirtyTracker.flush`. When `bucketDirtyCount >= threshold`,
 * the tracker emits a single full-buffer upload (three's `bufferData`
 * fast path) instead of N per-bucket `bufferSubData` calls.
 *
 * Tuned for mobile WebGPU first.
 */
const MATRIX_FULL_THRESHOLD = 5
const INTERLEAVED_FULL_THRESHOLD = 3
const CUSTOM_FULL_THRESHOLD = 3

/**
 * Scratch for the two XY endpoints of the ray's sweep across the batch's
 * member z-span (see `raycast`). Module-level — raycast is single-threaded
 * and synchronous.
 */
const _pickPoint = new Vector3()
const _pickPoint2 = new Vector3()
/** Scratch for `indexForPicking`'s half-extents — single-threaded, synchronous. */
const _he = { hx: 0, hy: 0 }

/**
 * A batch of sprites rendered with a single draw call.
 *
 * Uses InstancedMesh with:
 * - `instanceMatrix` — auto-managed by InstancedMesh (1 buffer slot)
 * - Interleaved core buffer carrying UV / color / system / extras
 *   (1 buffer slot, 4 logical attribute views)
 * - `effectBuf*` custom attributes from the material's effect schema
 *
 * Total vertex-buffer bindings: 0 (synth-quad `position`/`uv` exist for
 * user TSL but the built-in shader synthesizes from `vertexIndex`
 * instead, so neither is consumed) + 1 (instanceMatrix) + 1
 * (interleaved) + N (effect buffers). N is capped by
 * `EffectMaterial.MAX_EFFECT_FLOATS / 4 = 6` so the total never exceeds
 * the WebGPU 8-binding limit.
 *
 * Systems write to batch buffers directly via the write methods.
 *
 * @internal
 */
export class SpriteBatch extends InstancedMesh {
  /**
   * Type marker for graph-management code (sceneGraphSyncSystem's prune)
   * that must distinguish batch meshes from other SpriteGroup children
   * without a value import of this class.
   */
  readonly isSpriteBatch = true

  /**
   * The material used by all sprites in this batch.
   */
  readonly spriteMaterial: Sprite2DMaterial

  /**
   * Maximum number of sprites this batch can hold.
   */
  readonly maxSize: number

  /**
   * Geometry strategy this batch was built with. Pool recycling must
   * match it — a synth-quad mesh can't serve a tight-mesh material
   * (different attribute layouts compiled into the shader).
   */
  readonly geometryKind: 'synth-quad' | 'tight-mesh'

  /**
   * Atlas registry `version` the envelope hull was built from (-1 for
   * synth-quad, which has no envelope). A merge/degrade on the same
   * texture bumps the registry's version without necessarily flipping
   * `geometryKind` — pool recycling in `findOrCreateBatch` compares
   * this against the live atlas version so a batch whose hull no
   * longer matches its registration gets rebuilt instead of reused.
   */
  readonly envelopeVersion: number

  /**
   * Picking broadphase: a uniform hash grid of this batch's member
   * sprites keyed by world position. Maintained by the batch lifecycle
   * systems (assign/reassign/remove insert + remove entries) and by
   * `transformSyncSystem` (moves). Queried by {@link SpriteBatch.raycast}.
   */
  readonly grid = new SpriteSpatialGrid()

  /**
   * Current number of active slots in the batch.
   */
  private _activeCount: number = 0

  /**
   * Free slot indices for reuse (pooling).
   */
  private _freeList: number[] = []

  /**
   * Next index to allocate when freeList is empty.
   */
  private _nextIndex: number = 0

  /**
   * Interleaved core buffer (UV + color + system + extras).
   */
  private _interleavedData: Float32Array
  private _interleavedBuffer: InstancedInterleavedBuffer

  /**
   * Attribute views into the interleaved buffer. Each is a separate
   * vertex-attribute binding from the shader's perspective, but they
   * all share the same underlying GPU buffer.
   */
  private _uvAttribute: InterleavedBufferAttribute
  private _colorAttribute: InterleavedBufferAttribute
  private _systemAttribute: InterleavedBufferAttribute
  private _extrasAttribute: InterleavedBufferAttribute

  /**
   * Custom attribute buffers (from material schema — effect data).
   */
  private _customAttributes: Map<
    string,
    {
      buffer: Float32Array
      size: number
      attribute: InstancedBufferAttribute
      tracker: BucketedDirtyTracker
    }
  > = new Map()

  /**
   * Whether transforms need to be re-read from sprites during upload.
   */
  private _transformsDirty: boolean = false

  /**
   * Per-batch sort-dirty flag. Set by `Sprite2D.zIndex` setter when a
   * member sprite's zIndex changes (non-gated materials only) and by
   * `batchAssignSystem` when a new sprite is added. Consumed by
   * `batchSortSystem` which re-sorts the batch and clears the flag.
   */
  private _sortDirty: boolean = false

  /**
   * Per-buffer dirty trackers. One for the matrix buffer, one for the
   * interleaved core (covers all 4 logical attributes since they share
   * the underlying buffer), and one per custom effect buffer.
   */
  private _matrixTracker!: BucketedDirtyTracker
  private _interleavedTracker!: BucketedDirtyTracker

  constructor(material: Sprite2DMaterial, maxSize: number = FALLBACK_BATCH_SIZE) {
    // Allocate interleaved core storage BEFORE creating InstancedMesh
    // so the attribute bindings exist during shader compilation.
    const interleavedData = new Float32Array(maxSize * INSTANCE_STRIDE)

    // Initialize defaults: full texture UV, white opaque color,
    // no flip, zero system flags / enable bits / shadow radius.
    for (let i = 0; i < maxSize; i++) {
      const base = i * INSTANCE_STRIDE
      // UV: full texture (0, 0, 1, 1)
      interleavedData[base + OFFSET_UV + 0] = 0
      interleavedData[base + OFFSET_UV + 1] = 0
      interleavedData[base + OFFSET_UV + 2] = 1
      interleavedData[base + OFFSET_UV + 3] = 1
      // Color: white, fully opaque
      interleavedData[base + OFFSET_COLOR + 0] = 1
      interleavedData[base + OFFSET_COLOR + 1] = 1
      interleavedData[base + OFFSET_COLOR + 2] = 1
      interleavedData[base + OFFSET_COLOR + 3] = 1
      // System: flipX=1, flipY=1, sysFlags=0, enableBits=0
      interleavedData[base + OFFSET_SYSTEM + 0] = 1
      interleavedData[base + OFFSET_SYSTEM + 1] = 1
      interleavedData[base + OFFSET_SYSTEM + 2] = 0
      interleavedData[base + OFFSET_SYSTEM + 3] = 0
      // Extras: shadowRadius=0, reserved×3 = 0
      interleavedData[base + OFFSET_EXTRAS + 0] = 0
      interleavedData[base + OFFSET_EXTRAS + 1] = 0
      interleavedData[base + OFFSET_EXTRAS + 2] = 0
      interleavedData[base + OFFSET_EXTRAS + 3] = 0
    }

    // Create geometry and add ALL instance attributes BEFORE super().
    // Strategy split (GEOMETRY-PIPELINE-OPTIMIZATION §Part 2):
    //   synth-quad  — index-only; corner position + UV derived from
    //                 vertexIndex (alphaTest path; discard kills fringe)
    //   tight-mesh  — per-batch envelope hull of the atlas polygons
    //                 (alpha-blend path; fringe blend cost is real)
    // The material's resolved strategy decides — its shader was built
    // for exactly one of these attribute layouts.
    const atlas = material._tightMesh ? getAtlasMesh(material.getTexture()) : null
    const envelope = atlas ? buildEnvelopeGeometry(material.getTexture()) : null
    const geometry = envelope ?? createSynthQuadGeometry()
    // The batch is never frustum-culled; give it an honest infinite bound.
    geometry.boundingSphere = new Sphere(geometry.boundingSphere!.center, Infinity)

    const interleavedBuffer = new InstancedInterleavedBuffer(interleavedData, INSTANCE_STRIDE, 1)
    interleavedBuffer.setUsage(DynamicDrawUsage)

    const uvAttr = new InterleavedBufferAttribute(interleavedBuffer, 4, OFFSET_UV)
    const colorAttr = new InterleavedBufferAttribute(interleavedBuffer, 4, OFFSET_COLOR)
    const systemAttr = new InterleavedBufferAttribute(interleavedBuffer, 4, OFFSET_SYSTEM)
    const extrasAttr = new InterleavedBufferAttribute(interleavedBuffer, 4, OFFSET_EXTRAS)
    geometry.setAttribute('instanceUV', uvAttr)
    geometry.setAttribute('instanceColor', colorAttr)
    geometry.setAttribute('instanceSystem', systemAttr)
    geometry.setAttribute('instanceExtras', extrasAttr)

    // Create custom attributes from material schema BEFORE super().
    // Effect buffers are pure MaterialEffect data — no system reservations.
    const customAttributes = new Map<
      string,
      {
        buffer: Float32Array
        size: number
        attribute: InstancedBufferAttribute
        tracker: BucketedDirtyTracker
      }
    >()
    const schema = material.getInstanceAttributeSchema()
    for (const [name, config] of schema) {
      const size = getTypeSize(config.type)
      const buffer = new Float32Array(maxSize * size)

      const defaultValue = config.defaultValue
      for (let i = 0; i < maxSize; i++) {
        if (typeof defaultValue === 'number') {
          buffer[i * size] = defaultValue
        } else {
          for (let j = 0; j < defaultValue.length; j++) {
            buffer[i * size + j] = defaultValue[j] ?? 0
          }
        }
      }

      const attr = new InstancedBufferAttribute(buffer, size)
      attr.setUsage(DynamicDrawUsage)
      geometry.setAttribute(name, attr)
      const tracker = new BucketedDirtyTracker(attr, maxSize, BUCKET_SIZE, size, CUSTOM_FULL_THRESHOLD)
      customAttributes.set(name, { buffer, size, attribute: attr, tracker })
    }

    // Create InstancedMesh - geometry now has all required attributes
    super(geometry, material, maxSize)

    // Store references
    this._interleavedData = interleavedData
    this._interleavedBuffer = interleavedBuffer
    this._uvAttribute = uvAttr
    this._colorAttribute = colorAttr
    this._systemAttribute = systemAttr
    this._extrasAttribute = extrasAttr
    this._customAttributes = customAttributes
    this.spriteMaterial = material
    this.maxSize = maxSize
    this.geometryKind = envelope !== null ? 'tight-mesh' : 'synth-quad'
    this.envelopeVersion = atlas?.version ?? -1
    this.frustumCulled = false

    // Initialize dirty trackers — matrix tracks the auto-created
    // instanceMatrix attribute, interleaved tracks the single shared
    // core buffer (one entry per logical 4-vec4 instance row).
    this._matrixTracker = new BucketedDirtyTracker(this.instanceMatrix, maxSize, BUCKET_SIZE, 16, MATRIX_FULL_THRESHOLD)
    this._interleavedTracker = new BucketedDirtyTracker(
      interleavedBuffer,
      maxSize,
      BUCKET_SIZE,
      INSTANCE_STRIDE,
      INTERLEAVED_FULL_THRESHOLD
    )

    // Set initial count to 0 (no sprites yet)
    this.count = 0
    this.name = 'SpriteBatch'
  }

  // ============================================
  // Buffer write methods (called by ECS systems)
  // ============================================

  writeColor(index: number, r: number, g: number, b: number, a: number): void {
    const o = index * INSTANCE_STRIDE + OFFSET_COLOR
    this._interleavedData[o + 0] = r
    this._interleavedData[o + 1] = g
    this._interleavedData[o + 2] = b
    this._interleavedData[o + 3] = a
    this._interleavedTracker.markDirty(index)
  }

  writeUV(index: number, x: number, y: number, w: number, h: number): void {
    const o = index * INSTANCE_STRIDE + OFFSET_UV
    this._interleavedData[o + 0] = x
    this._interleavedData[o + 1] = y
    this._interleavedData[o + 2] = w
    this._interleavedData[o + 3] = h
    this._interleavedTracker.markDirty(index)
  }

  writeFlip(index: number, flipX: number, flipY: number): void {
    const o = index * INSTANCE_STRIDE + OFFSET_SYSTEM
    this._interleavedData[o + 0] = flipX
    this._interleavedData[o + 1] = flipY
    this._interleavedTracker.markDirty(index)
  }

  /**
   * Write system-level flag bits (e.g., castsShadow, isLit). Stored in
   * `instanceSystem.z`. Reserved here for lighting integration; sprite-
   * sort PR leaves it at zero.
   */
  writeSystemFlags(index: number, flags: number): void {
    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_SYSTEM + 2] = flags
    this._interleavedTracker.markDirty(index)
  }

  /**
   * Write the MaterialEffect enable-bits bitmask. Stored in
   * `instanceSystem.w`. The shader reads this to gate per-effect color
   * contribution in the effect chain.
   */
  writeEnableBits(index: number, bits: number): void {
    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_SYSTEM + 3] = bits
    this._interleavedTracker.markDirty(index)
  }

  /**
   * Write the per-instance shadow-occluder radius (world units).
   * Stored in `instanceExtras.x`. Lighting-only; zero for sprite-sort PR.
   */
  writeShadowRadius(index: number, radius: number): void {
    // Idempotent: transformSyncSystem re-derives this from scale every frame
    // for every sprite, but scale is static in the common case. Skip the write
    // and the dirty mark when the value is unchanged, so a static-scale scene
    // doesn't re-upload the whole interleaved buffer every frame.
    const o = index * INSTANCE_STRIDE + OFFSET_EXTRAS + 0
    if (this._interleavedData[o] === radius) return
    this._interleavedData[o] = radius
    this._interleavedTracker.markDirty(index)
  }

  writeMatrix(index: number, matrix: Matrix4): void {
    this.setMatrixAt(index, matrix)
    this._matrixTracker.markDirty(index)
  }

  /**
   * Expand the matrix dirty range for a slot.
   * Used by transformSyncSystem which writes the instanceMatrix buffer directly.
   */
  markMatrixDirty(slot: number): void {
    this._matrixTracker.markDirty(slot)
  }

  writeCustom(index: number, name: string, value: number | number[]): void {
    const custom = this._customAttributes.get(name)
    if (!custom) return

    const { buffer, size } = custom
    if (typeof value === 'number') {
      buffer[index * size] = value
    } else {
      for (let i = 0; i < value.length && i < size; i++) {
        buffer[index * size + i] = value[i] ?? 0
      }
    }
    custom.tracker.markDirty(index)
  }

  getCustomBuffer(name: string): { buffer: Float32Array; size: number } | undefined {
    const custom = this._customAttributes.get(name)
    return custom ? { buffer: custom.buffer, size: custom.size } : undefined
  }

  getColorAttribute(): InterleavedBufferAttribute {
    return this._colorAttribute
  }

  getUVAttribute(): InterleavedBufferAttribute {
    return this._uvAttribute
  }

  getSystemAttribute(): InterleavedBufferAttribute {
    return this._systemAttribute
  }

  getExtrasAttribute(): InterleavedBufferAttribute {
    return this._extrasAttribute
  }

  getCustomAttribute(name: string): InstancedBufferAttribute | undefined {
    return this._customAttributes.get(name)?.attribute
  }

  writeEffectSlot(index: number, bufferIndex: number, component: number, value: number): void {
    const attrName = `effectBuf${bufferIndex}`
    const custom = this._customAttributes.get(attrName)
    if (!custom) return
    custom.buffer[index * 4 + component] = value
    custom.tracker.markDirty(index)
  }

  /**
   * Swap all per-instance attribute rows between physical slots `a` and `b`.
   * Used by batchSortSystem to re-order instances by zIndex without
   * rewriting ECS state — all buffers (matrix, interleaved core, custom
   * effect buffers) are permuted in lockstep.
   *
   * Zero-alloc: uses element-wise writes on typed arrays in place.
   */
  swapSlots(a: number, b: number): void {
    if (a === b) return

    // instanceMatrix (16 floats)
    const m = this.instanceMatrix.array as Float32Array
    const ao = a * 16
    const bo = b * 16
    for (let i = 0; i < 16; i++) {
      const tmp = m[ao + i]!
      m[ao + i] = m[bo + i]!
      m[bo + i] = tmp
    }
    this._matrixTracker.markDirty(a)
    this._matrixTracker.markDirty(b)

    // Interleaved core (16 floats = UV+color+system+extras row)
    const il = this._interleavedData
    const ail = a * INSTANCE_STRIDE
    const bil = b * INSTANCE_STRIDE
    for (let i = 0; i < INSTANCE_STRIDE; i++) {
      const tmp = il[ail + i]!
      il[ail + i] = il[bil + i]!
      il[bil + i] = tmp
    }
    this._interleavedTracker.markDirty(a)
    this._interleavedTracker.markDirty(b)

    // Custom attributes (effect buffers + user-defined)
    for (const [, custom] of this._customAttributes) {
      const size = custom.size
      const buf = custom.buffer
      const ax = a * size
      const bx = b * size
      for (let i = 0; i < size; i++) {
        const tmp = buf[ax + i]!
        buf[ax + i] = buf[bx + i]!
        buf[bx + i] = tmp
      }
      custom.tracker.markDirty(a)
      custom.tracker.markDirty(b)
    }
  }

  // ============================================
  // Slot management (used by ECS systems)
  // ============================================

  get activeCount(): number {
    return this._activeCount
  }

  get isFull(): boolean {
    return this._freeList.length === 0 && this._nextIndex >= this.maxSize
  }

  get isEmpty(): boolean {
    return this._activeCount === 0
  }

  allocateSlot(): number {
    let index: number

    if (this._freeList.length > 0) {
      index = this._freeList.pop()!
    } else {
      if (this._nextIndex >= this.maxSize) {
        return -1
      }
      index = this._nextIndex++
    }

    this._activeCount++
    return index
  }

  /**
   * Free a slot. Collapses the instance matrix to zero scale — a
   * degenerate quad rasterizes no fragments at all, unlike the previous
   * alpha=0 approach where every freed slot still paid full-quad
   * rasterization + a per-fragment discard. Alpha is zeroed too as
   * belt-and-braces (any path that resurrects the matrix before
   * reassignment still draws nothing).
   */
  freeSlot(index: number): void {
    if (index < 0 || index >= this._nextIndex) return

    const m = this.instanceMatrix.array as Float32Array
    m.fill(0, index * 16, index * 16 + 16)
    this._matrixTracker.markDirty(index)

    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_COLOR + 3] = 0
    this._interleavedTracker.markDirty(index)

    this._freeList.push(index)
    this._activeCount--
  }

  /**
   * Reset all slots without disposing GPU resources.
   * Used when recycling a batch from the pool.
   */
  resetSlots(): void {
    this._activeCount = 0
    this._freeList.length = 0
    this._nextIndex = 0
    this.count = 0
    // Wholesale membership reset — the broadphase index goes with it.
    this.grid.clear()
  }

  /**
   * Mark transforms as needing update.
   */
  invalidateTransforms(): void {
    this._transformsDirty = true
  }

  /**
   * Mark this batch as needing a zIndex re-sort.
   */
  markSortDirty(): void {
    this._sortDirty = true
  }

  /**
   * Read-and-clear the sort-dirty flag.
   */
  consumeSortDirty(): boolean {
    const wasDirty = this._sortDirty
    this._sortDirty = false
    return wasDirty
  }

  /**
   * Sync the instance count to include all allocated slots.
   * Free slots have alpha=0 so they're invisible.
   */
  syncCount(): void {
    this.count = this._nextIndex
    if (this.count > 0) {
      this.computeBoundingSphere()
    }
  }

  /**
   * The instance slots carry each sprite's WORLD transform (the ECS
   * transform pass folds the owning SpriteGroup's world affine in), so
   * the batch mesh itself must stay pinned at identity — inheriting the
   * group's transform through the normal parent-chain compose would
   * double-apply it in the shader's `modelMatrix × instanceMatrix`.
   */
  override updateMatrixWorld(_force?: boolean): void {
    this.matrixWorld.identity()
    this.matrixWorldNeedsUpdate = false
  }

  /** See {@link SpriteBatch.updateMatrixWorld} — identity-pinned. */
  override updateWorldMatrix(_updateParents?: boolean, _updateChildren?: boolean): void {
    this.matrixWorld.identity()
    this.matrixWorldNeedsUpdate = false
  }

  /**
   * The batch is never frustum-culled — an infinite bound is the
   * honest answer at zero cost (InstancedMesh's default would union
   * all instance spheres).
   */
  override computeBoundingSphere(): void {
    if (this.boundingSphere === null) this.boundingSphere = new Sphere()
    this.boundingSphere.center.set(0, 0, 0)
    this.boundingSphere.radius = Infinity
  }

  /**
   * Index `sprite` into the picking broadphase from its local matrix. The
   * batch systems call this at slot assign/reassign; the group-folded WORLD
   * position lands later the same schedule run via `transformSyncSystem`'s
   * `grid.update`. When transform sync is disabled the instance matrix IS
   * this local affine, so the grid and the rendered position agree either way.
   */
  indexForPicking(sprite: Sprite2D): void {
    const te = sprite.matrix.elements
    quadHalfExtents(te[0]!, te[4]!, te[1]!, te[5]!, sprite.hitRadius, _he)
    this.grid.insert(sprite, te[12]!, te[13]!, _he.hx, _he.hy, te[14]!)
  }

  /**
   * Batch-root broadphase picking. Scene traversal reaches the batch
   * (member sprites are not graph children), so the batch localizes the
   * ray and queries its spatial grid for candidate sprites. Each candidate
   * delegates to `Sprite2D.raycast`, which owns ALL narrow-phase
   * correctness (on-demand world-matrix compose, hitTestMode
   * bounds/alpha/radius, near/far) and pushes intersections with
   * `object === sprite`. three's Raycaster distance-sorts afterward, so
   * higher-zIndex sprites (closer along +z) surface first — no sorting
   * here.
   *
   * The grid is indexed by world XY, but the ray's XY depends on the depth
   * at which it is sampled: under an orthographic camera the ray is
   * z-parallel (XY constant), but under perspective it converges, so a
   * single z=0 sample would query the wrong cell for a sprite at non-zero
   * world Z. Localize by sweeping the ray across the grid's [zMin, zMax]
   * span — the XY endpoints at where the ray ENTERS and EXITS the span,
   * clamped to the forward (t ≥ 0) half. That collapses to one cell (the
   * fast path) when the batch is coplanar or the camera is orthographic,
   * and — unlike intersecting the two z-planes directly — stays correct
   * when the ray origin sits inside the span or a stale span reaches behind
   * the camera (those just clamp; they never abort the whole broadphase).
   */
  override raycast(raycaster: Raycaster, intersects: Intersection[]): void {
    if (this._activeCount === 0) return
    const grid = this.grid
    const zMin = grid.zMin
    const zMax = grid.zMax
    if (zMin > zMax) return // empty grid
    const ray = raycaster.ray
    const oz = ray.origin.z
    const dz = ray.direction.z
    if (dz === 0) return // ray edge-on to the 2D plane — XY unbounded, no localize
    // Ray parameters where z crosses the span bounds, ordered + clamped to the
    // forward half. Entirely-behind span (tHi < 0) → nothing to pick.
    const ta = (zMin - oz) / dz
    const tb = (zMax - oz) / dz
    let tLo = ta < tb ? ta : tb
    const tHi = ta < tb ? tb : ta
    if (tHi < 0) return
    if (tLo < 0) tLo = 0
    _pickPoint.copy(ray.direction).multiplyScalar(tLo).add(ray.origin)
    _pickPoint2.copy(ray.direction).multiplyScalar(tHi).add(ray.origin)
    for (const sprite of grid.querySegment(_pickPoint.x, _pickPoint.y, _pickPoint2.x, _pickPoint2.y)) {
      if (sprite._pickProxied) {
        // R3F batch-root picking nulled the sprite's own `raycast` and made
        // THIS batch its raycast path. Bypass the null straight to the
        // narrow phase (`_hitTestInto` re-checks `hitTestMode = 'none'`).
        sprite._hitTestInto(raycaster, intersects)
      } else if (isR3FManaged(sprite)) {
        // R3F-managed but NOT proxied (own custom `raycast`, or an opt-out
        // null): R3F's own per-object interaction list still holds it, so
        // hit-testing it here too would fire its raycast twice per pointer
        // event. Leave it to R3F.
        continue
      } else if (typeof sprite.raycast === 'function') {
        // Vanilla (three.js) sprite — the batch grid is its ONLY picking
        // path. Honor its OWN raycast: the prototype hit test or a
        // user-supplied custom one. A null raycast (`hitTestMode = 'none'`
        // or an explicit opt-out) is falsy here and correctly skipped.
        sprite.raycast(raycaster, intersects)
      }
    }
  }

  /**
   * Flush per-buffer dirty state to GPU upload ranges.
   *
   * Each tracker decides per-buffer whether to emit a single full-
   * buffer upload (three's `bufferData` fast path) or one
   * `addUpdateRange` per dirty bucket, based on how many buckets
   * accumulated changes during the frame.
   */
  /**
   * Whether any occluder-relevant attribute changed since the last flush.
   * Reads the matrix tracker (transforms) and interleaved tracker
   * (frame/castsShadow/alpha/add-remove) — together these capture every
   * change that alters an occluder silhouette. Must be read BEFORE
   * `flushDirtyRanges`, which clears the trackers.
   */
  get isDirty(): boolean {
    return this._matrixTracker.isDirty || this._interleavedTracker.isDirty
  }

  flushDirtyRanges(): void {
    this._matrixTracker.flush()
    this._interleavedTracker.flush()
    for (const [, custom] of this._customAttributes) custom.tracker.flush()
  }

  /**
   * Clone for devtools/serialization compatibility.
   */
  override clone(_recursive?: boolean): this {
    const cloned = new InstancedMesh(this.geometry.clone(), this.material, this.count)
    cloned.instanceMatrix.copy(this.instanceMatrix)
    cloned.count = this.count
    cloned.frustumCulled = this.frustumCulled
    cloned.name = this.name
    cloned.position.copy(this.position)
    cloned.rotation.copy(this.rotation)
    cloned.scale.copy(this.scale)
    if (this.count > 0) {
      cloned.computeBoundingSphere()
    }
    return cloned as unknown as this
  }

  /**
   * Dispose of resources.
   */
  override dispose(): this {
    // Drop any R3F batch-root picking registration — a disposed mesh
    // must not linger in a live root's interaction list.
    retireBatchPicking(this)
    this.resetSlots()
    this.geometry.dispose()
    // Don't dispose the material - it may be shared between batches
    this._customAttributes.clear()
    return this
  }
}

/**
 * Get the number of floats for an attribute type.
 */
function getTypeSize(type: InstanceAttributeType): number {
  switch (type) {
    case 'float':
      return 1
    case 'vec2':
      return 2
    case 'vec3':
      return 3
    case 'vec4':
      return 4
  }
}
