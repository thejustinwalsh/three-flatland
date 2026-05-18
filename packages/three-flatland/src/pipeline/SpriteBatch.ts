import {
  InstancedMesh,
  PlaneGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  type Matrix4,
} from 'three'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { InstanceAttributeType } from './types'

/**
 * Default maximum sprites per batch.
 */
export const DEFAULT_BATCH_SIZE = 8192

/**
 * Stride (in floats) of the interleaved per-instance core buffer. The
 * layout mirrors four vec4 slots:
 *
 *   offset  0..3   instanceUV      (uv.x, uv.y, uv.w, uv.h)
 *   offset  4..7   instanceColor   (r, g, b, a)
 *   offset  8..11  instanceSystem  (flipX, flipY, sysFlags, enableBits)
 *   offset 12..15  instanceExtras  (shadowRadius, reserved, reserved, reserved)
 *
 * Packing all four into one `InstancedInterleavedBuffer` keeps SpriteBatch
 * under the WebGPU `maxVertexBuffers = 8` cap even when multiple
 * `effectBuf*` bindings are active. See
 * `planning/superpowers/specs/2026-04-23-interleaved-instance-buffer-design.md`.
 */
export const INSTANCE_STRIDE = 16

const OFFSET_UV = 0
const OFFSET_COLOR = 4
const OFFSET_SYSTEM = 8
const OFFSET_EXTRAS = 12

/**
 * A batch of sprites rendered with a single draw call.
 *
 * Uses InstancedMesh with an interleaved per-instance attribute buffer
 * carrying UV, color, flip + system flags, and reserved extras. Plus
 * `effectBuf*` custom attributes from the material schema for pure
 * MaterialEffect data (no system reservations).
 *
 * Systems write to batch buffers directly via write methods.
 */
export class SpriteBatch extends InstancedMesh {
  /**
   * The material used by all sprites in this batch.
   */
  readonly spriteMaterial: Sprite2DMaterial

  /**
   * Maximum number of sprites this batch can hold.
   */
  readonly maxSize: number

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
   * Interleaved core-data storage (16 floats per instance — see
   * {@link INSTANCE_STRIDE} header comment for layout).
   */
  private _interleavedData: Float32Array
  private _interleavedBuffer: InstancedInterleavedBuffer
  private _uvAttribute: InterleavedBufferAttribute
  private _colorAttribute: InterleavedBufferAttribute
  private _systemAttribute: InterleavedBufferAttribute
  private _extrasAttribute: InterleavedBufferAttribute

  /**
   * Custom attribute buffers (from material schema — pure effect data).
   */
  private _customAttributes: Map<string, { buffer: Float32Array; size: number; attribute: InstancedBufferAttribute; dirtyMin: number; dirtyMax: number }> = new Map()

  /**
   * Whether transforms need to be re-read from sprites during upload.
   */
  private _transformsDirty: boolean = false

  // Per-attribute dirty slot ranges (min/max slot index).
  // Infinity/−1 sentinel means "clean". Write methods expand the range;
  // flushDirtyRanges() converts to addUpdateRange + needsUpdate once per frame.
  private _matrixDirtyMin = Infinity
  private _matrixDirtyMax = -1
  // Single dirty range for the whole interleaved buffer — any of the
  // four attributes sharing it flush together.
  private _interleavedDirtyMin = Infinity
  private _interleavedDirtyMax = -1

  constructor(material: Sprite2DMaterial, maxSize: number = DEFAULT_BATCH_SIZE) {
    // Allocate interleaved core storage BEFORE creating InstancedMesh
    // so the attribute bindings exist during shader compilation.
    const interleavedData = new Float32Array(maxSize * INSTANCE_STRIDE)

    // Initialize with default values: full texture UV, white fully-opaque
    // color, no flip, zero flags / enable bits / shadowRadius.
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
      // System: flipX=1, flipY=1, flags=0, enableBits=0
      interleavedData[base + OFFSET_SYSTEM + 0] = 1
      interleavedData[base + OFFSET_SYSTEM + 1] = 1
      interleavedData[base + OFFSET_SYSTEM + 2] = 0
      interleavedData[base + OFFSET_SYSTEM + 3] = 0
      // Extras: shadowRadius=0 + reserved=0
      interleavedData[base + OFFSET_EXTRAS + 0] = 0
      interleavedData[base + OFFSET_EXTRAS + 1] = 0
      interleavedData[base + OFFSET_EXTRAS + 2] = 0
      interleavedData[base + OFFSET_EXTRAS + 3] = 0
    }

    // Create geometry and add ALL instance attributes BEFORE super()
    // so they exist when the shader compiles.
    const geometry = new PlaneGeometry(1, 1)

    const interleavedBuffer = new InstancedInterleavedBuffer(
      interleavedData,
      INSTANCE_STRIDE,
      1
    )
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
    // These are pure MaterialEffect data — no system reservations.
    const customAttributes = new Map<string, { buffer: Float32Array; size: number; attribute: InstancedBufferAttribute; dirtyMin: number; dirtyMax: number }>()
    const schema = material.getInstanceAttributeSchema()
    for (const [name, config] of schema) {
      const size = getTypeSize(config.type)
      const buffer = new Float32Array(maxSize * size)

      // Fill with default values
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
      customAttributes.set(name, { buffer, size, attribute: attr, dirtyMin: Infinity, dirtyMax: -1 })
    }

    // Use the material directly - it's already set up for instanced rendering
    // (cloning was causing issues with custom colorNodes that have captured closures)
    // Note: multiple batches with the same material will share shader compilation,
    // which is actually more efficient

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
    this.spriteMaterial = material // Keep reference to original for batchId matching
    this.maxSize = maxSize
    this.frustumCulled = false // Batches manage their own culling

    // Set initial count to 0 (no sprites yet)
    this.count = 0
    this.name = 'SpriteBatch'
  }

  // ============================================
  // Buffer write methods (called by ECS systems)
  // ============================================

  private _markInterleavedDirty(index: number) {
    if (index < this._interleavedDirtyMin) this._interleavedDirtyMin = index
    if (index > this._interleavedDirtyMax) this._interleavedDirtyMax = index
  }

  writeColor(index: number, r: number, g: number, b: number, a: number): void {
    const o = index * INSTANCE_STRIDE + OFFSET_COLOR
    this._interleavedData[o + 0] = r
    this._interleavedData[o + 1] = g
    this._interleavedData[o + 2] = b
    this._interleavedData[o + 3] = a
    this._markInterleavedDirty(index)
  }

  writeUV(index: number, x: number, y: number, w: number, h: number): void {
    const o = index * INSTANCE_STRIDE + OFFSET_UV
    this._interleavedData[o + 0] = x
    this._interleavedData[o + 1] = y
    this._interleavedData[o + 2] = w
    this._interleavedData[o + 3] = h
    this._markInterleavedDirty(index)
  }

  writeFlip(index: number, flipX: number, flipY: number): void {
    const o = index * INSTANCE_STRIDE + OFFSET_SYSTEM
    this._interleavedData[o + 0] = flipX
    this._interleavedData[o + 1] = flipY
    this._markInterleavedDirty(index)
  }

  /**
   * Write the system-flags bitfield (lit, receiveShadows, castsShadow bits).
   * Stored in `instanceSystem.z`.
   */
  writeSystemFlags(index: number, flags: number): void {
    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_SYSTEM + 2] = flags
    this._markInterleavedDirty(index)
  }

  /**
   * Write the MaterialEffect enable bits. Stored in `instanceSystem.w`.
   */
  writeEnableBits(index: number, bits: number): void {
    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_SYSTEM + 3] = bits
    this._markInterleavedDirty(index)
  }

  /**
   * Write the per-instance shadow-occluder radius (world units).
   * Stored in `instanceExtras.x`.
   */
  writeShadowRadius(index: number, radius: number): void {
    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_EXTRAS + 0] = radius
    this._markInterleavedDirty(index)
  }

  writeMatrix(index: number, matrix: Matrix4): void {
    this.setMatrixAt(index, matrix)
    if (index < this._matrixDirtyMin) this._matrixDirtyMin = index
    if (index > this._matrixDirtyMax) this._matrixDirtyMax = index
  }

  /**
   * Expand the matrix dirty range for a slot.
   * Used by transformSyncSystem which writes the instanceMatrix buffer directly.
   */
  markMatrixDirty(slot: number): void {
    if (slot < this._matrixDirtyMin) this._matrixDirtyMin = slot
    if (slot > this._matrixDirtyMax) this._matrixDirtyMax = slot
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
    if (index < custom.dirtyMin) custom.dirtyMin = index
    if (index > custom.dirtyMax) custom.dirtyMax = index
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
    if (index < custom.dirtyMin) custom.dirtyMin = index
    if (index > custom.dirtyMax) custom.dirtyMax = index
  }

  // ============================================
  // Slot management (used by ECS systems)
  // ============================================

  /**
   * Get current active slot count.
   */
  get activeCount(): number {
    return this._activeCount
  }

  /**
   * Check if batch is full.
   */
  get isFull(): boolean {
    return this._freeList.length === 0 && this._nextIndex >= this.maxSize
  }

  /**
   * Check if batch is empty.
   */
  get isEmpty(): boolean {
    return this._activeCount === 0
  }

  /**
   * Allocate a slot in this batch.
   * Reuses a free slot if available, otherwise allocates the next sequential one.
   *
   * @returns The slot index, or -1 if batch is full
   */
  allocateSlot(): number {
    let index: number

    if (this._freeList.length > 0) {
      index = this._freeList.pop()!
    } else {
      if (this._nextIndex >= this.maxSize) {
        return -1 // Batch is full
      }
      index = this._nextIndex++
    }

    this._activeCount++
    return index
  }

  /**
   * Free a slot in this batch.
   * Sets alpha to 0 (invisible) and adds the slot to the free list.
   *
   * @param index - Slot index to free
   */
  freeSlot(index: number): void {
    if (index < 0 || index >= this._nextIndex) return

    // Make slot invisible (alpha = 0) so it doesn't render
    this._interleavedData[index * INSTANCE_STRIDE + OFFSET_COLOR + 3] = 0
    this._markInterleavedDirty(index)

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
  }

  /**
   * Mark transforms as needing update.
   * Call when sprite positions/rotations/scales have changed.
   */
  invalidateTransforms(): void {
    this._transformsDirty = true
  }

  /**
   * Sync the instance count to include all allocated slots.
   * Free slots have alpha=0 so they're invisible.
   */
  syncCount(): void {
    this.count = this._nextIndex
    // Update bounding sphere for devtools highlight and frustum visualization
    if (this.count > 0) {
      this.computeBoundingSphere()
    }
  }

  /**
   * Flush per-attribute dirty ranges to GPU upload ranges.
   *
   * Each write method (writeColor, writeUV, etc.) tracks the min/max slot
   * that was touched. This method converts those slot ranges into
   * `addUpdateRange` calls so the renderer uploads only the changed portion
   * of each buffer via `bufferSubData`.
   *
   * Call once per frame after all systems have run — replaces the old
   * `applyUpdateRanges()` which always uploaded [0, _nextIndex] for every
   * attribute regardless of what actually changed.
   */
  flushDirtyRanges(): void {
    if (this._matrixDirtyMax >= 0) {
      this.instanceMatrix.clearUpdateRanges()
      this.instanceMatrix.addUpdateRange(this._matrixDirtyMin * 16, (this._matrixDirtyMax - this._matrixDirtyMin + 1) * 16)
      this.instanceMatrix.needsUpdate = true
      this._matrixDirtyMin = Infinity
      this._matrixDirtyMax = -1
    }

    if (this._interleavedDirtyMax >= 0) {
      this._interleavedBuffer.clearUpdateRanges()
      this._interleavedBuffer.addUpdateRange(
        this._interleavedDirtyMin * INSTANCE_STRIDE,
        (this._interleavedDirtyMax - this._interleavedDirtyMin + 1) * INSTANCE_STRIDE
      )
      this._interleavedBuffer.needsUpdate = true
      this._interleavedDirtyMin = Infinity
      this._interleavedDirtyMax = -1
    }

    for (const [, custom] of this._customAttributes) {
      if (custom.dirtyMax >= 0) {
        custom.attribute.clearUpdateRanges()
        custom.attribute.addUpdateRange(custom.dirtyMin * custom.size, (custom.dirtyMax - custom.dirtyMin + 1) * custom.size)
        custom.attribute.needsUpdate = true
        custom.dirtyMin = Infinity
        custom.dirtyMax = -1
      }
    }
  }

  /**
   * Clone for devtools/serialization compatibility.
   * SpriteBatch requires material in its constructor, so the default
   * Object3D.clone() (`new this.constructor()`) would crash.
   * Returns a plain InstancedMesh with matching geometry and transforms.
   */
  override clone(_recursive?: boolean): this {
    const cloned = new InstancedMesh(
      this.geometry.clone(),
      this.material,
      this.count
    )
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
    this.resetSlots()
    this.geometry.dispose()
    // Don't dispose the material - it may be shared between batches
    // The material owner (user code) is responsible for disposing it
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
