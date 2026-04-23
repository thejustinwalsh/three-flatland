import {
  InstancedMesh,
  PlaneGeometry,
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
 * A batch of sprites rendered with a single draw call.
 *
 * Uses InstancedMesh with per-instance attributes for:
 * - Transform (via instanceMatrix)
 * - Frame UV (instanceUV)
 * - Color (instanceColor)
 * - Flip (instanceFlip)
 * - Custom attributes from material schema
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
   * Core attribute buffers.
   */
  private _instanceUV: Float32Array
  private _instanceColor: Float32Array
  private _instanceFlip: Float32Array
  private _instanceShadowRadius: Float32Array

  /**
   * Core attribute references.
   */
  private _uvAttribute: InstancedBufferAttribute
  private _colorAttribute: InstancedBufferAttribute
  private _flipAttribute: InstancedBufferAttribute
  private _shadowRadiusAttribute: InstancedBufferAttribute

  /**
   * Custom attribute buffers (from material schema).
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
  private _uvDirtyMin = Infinity
  private _uvDirtyMax = -1
  private _colorDirtyMin = Infinity
  private _colorDirtyMax = -1
  private _flipDirtyMin = Infinity
  private _flipDirtyMax = -1
  private _shadowRadiusDirtyMin = Infinity
  private _shadowRadiusDirtyMax = -1

  constructor(material: Sprite2DMaterial, maxSize: number = DEFAULT_BATCH_SIZE) {
    // Allocate core attribute buffers BEFORE creating InstancedMesh
    // so they exist during shader compilation
    const instanceUV = new Float32Array(maxSize * 4)
    const instanceColor = new Float32Array(maxSize * 4)
    const instanceFlip = new Float32Array(maxSize * 2)
    // `instanceShadowRadius` carries the sprite's occluder size (world
    // units) to any lighting effect that traces shadows. Consumers read
    // it via `readShadowRadius()` (which unpacks `.x`) and use it as
    // e.g. the SDF sphere-trace escape distance. Stored as a vec2
    // rather than a single float because single-component attributes
    // don't bind reliably through TSL; `.y` is reserved for a future
    // per-sprite shadow datum (e.g., softness hint or penumbra width).
    // transformSyncSystem resolves each sprite's actual radius each
    // frame (user override or auto max(scale.x, scale.y)).
    const instanceShadowRadius = new Float32Array(maxSize * 2)

    // Initialize with default values (white, fully opaque, no flip, full texture)
    for (let i = 0; i < maxSize; i++) {
      // instanceUV: full texture (0, 0, 1, 1)
      instanceUV[i * 4 + 0] = 0
      instanceUV[i * 4 + 1] = 0
      instanceUV[i * 4 + 2] = 1
      instanceUV[i * 4 + 3] = 1
      // instanceColor: white, fully opaque (1, 1, 1, 1)
      instanceColor[i * 4 + 0] = 1
      instanceColor[i * 4 + 1] = 1
      instanceColor[i * 4 + 2] = 1
      instanceColor[i * 4 + 3] = 1
      // instanceFlip: no flip (1, 1)
      instanceFlip[i * 2 + 0] = 1
      instanceFlip[i * 2 + 1] = 1
      // instanceShadowRadius: (0, 0) — transformSyncSystem fills .x each frame.
      instanceShadowRadius[i * 2 + 0] = 0
      instanceShadowRadius[i * 2 + 1] = 0
    }

    // Create geometry and add ALL instance attributes BEFORE super()
    // This ensures attributes exist when shader compiles
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

    const shadowRadiusAttr = new InstancedBufferAttribute(instanceShadowRadius, 2)
    shadowRadiusAttr.setUsage(DynamicDrawUsage)
    geometry.setAttribute('instanceShadowRadius', shadowRadiusAttr)

    // Create custom attributes from material schema BEFORE super()
    // This is critical - the shader may compile in super() or on first render,
    // and all attributes must be present on the geometry at that time
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
    this._instanceUV = instanceUV
    this._instanceColor = instanceColor
    this._instanceFlip = instanceFlip
    this._instanceShadowRadius = instanceShadowRadius
    this._uvAttribute = uvAttr
    this._colorAttribute = colorAttr
    this._flipAttribute = flipAttr
    this._shadowRadiusAttribute = shadowRadiusAttr
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

  writeColor(index: number, r: number, g: number, b: number, a: number): void {
    this._instanceColor[index * 4 + 0] = r
    this._instanceColor[index * 4 + 1] = g
    this._instanceColor[index * 4 + 2] = b
    this._instanceColor[index * 4 + 3] = a
    if (index < this._colorDirtyMin) this._colorDirtyMin = index
    if (index > this._colorDirtyMax) this._colorDirtyMax = index
  }

  writeUV(index: number, x: number, y: number, w: number, h: number): void {
    this._instanceUV[index * 4 + 0] = x
    this._instanceUV[index * 4 + 1] = y
    this._instanceUV[index * 4 + 2] = w
    this._instanceUV[index * 4 + 3] = h
    if (index < this._uvDirtyMin) this._uvDirtyMin = index
    if (index > this._uvDirtyMax) this._uvDirtyMax = index
  }

  writeFlip(index: number, flipX: number, flipY: number): void {
    this._instanceFlip[index * 2 + 0] = flipX
    this._instanceFlip[index * 2 + 1] = flipY
    if (index < this._flipDirtyMin) this._flipDirtyMin = index
    if (index > this._flipDirtyMax) this._flipDirtyMax = index
  }

  writeShadowRadius(index: number, radius: number): void {
    this._instanceShadowRadius[index * 2 + 0] = radius
    if (index < this._shadowRadiusDirtyMin) this._shadowRadiusDirtyMin = index
    if (index > this._shadowRadiusDirtyMax) this._shadowRadiusDirtyMax = index
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

  getColorAttribute(): InstancedBufferAttribute {
    return this._colorAttribute
  }

  getUVAttribute(): InstancedBufferAttribute {
    return this._uvAttribute
  }

  getFlipAttribute(): InstancedBufferAttribute {
    return this._flipAttribute
  }

  getShadowRadiusAttribute(): InstancedBufferAttribute {
    return this._shadowRadiusAttribute
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
    this._instanceColor[index * 4 + 3] = 0
    if (index < this._colorDirtyMin) this._colorDirtyMin = index
    if (index > this._colorDirtyMax) this._colorDirtyMax = index

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

    if (this._uvDirtyMax >= 0) {
      this._uvAttribute.clearUpdateRanges()
      this._uvAttribute.addUpdateRange(this._uvDirtyMin * 4, (this._uvDirtyMax - this._uvDirtyMin + 1) * 4)
      this._uvAttribute.needsUpdate = true
      this._uvDirtyMin = Infinity
      this._uvDirtyMax = -1
    }

    if (this._colorDirtyMax >= 0) {
      this._colorAttribute.clearUpdateRanges()
      this._colorAttribute.addUpdateRange(this._colorDirtyMin * 4, (this._colorDirtyMax - this._colorDirtyMin + 1) * 4)
      this._colorAttribute.needsUpdate = true
      this._colorDirtyMin = Infinity
      this._colorDirtyMax = -1
    }

    if (this._flipDirtyMax >= 0) {
      this._flipAttribute.clearUpdateRanges()
      this._flipAttribute.addUpdateRange(this._flipDirtyMin * 2, (this._flipDirtyMax - this._flipDirtyMin + 1) * 2)
      this._flipAttribute.needsUpdate = true
      this._flipDirtyMin = Infinity
      this._flipDirtyMax = -1
    }

    if (this._shadowRadiusDirtyMax >= 0) {
      this._shadowRadiusAttribute.clearUpdateRanges()
      this._shadowRadiusAttribute.addUpdateRange(this._shadowRadiusDirtyMin * 2, (this._shadowRadiusDirtyMax - this._shadowRadiusDirtyMin + 1) * 2)
      this._shadowRadiusAttribute.needsUpdate = true
      this._shadowRadiusDirtyMin = Infinity
      this._shadowRadiusDirtyMax = -1
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
