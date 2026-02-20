import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  DynamicDrawUsage,
  type Matrix4,
} from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { InstanceAttributeType } from './types'
import type { BatchTarget } from './BatchTarget'

/**
 * Default maximum sprites per batch.
 */
export const DEFAULT_BATCH_SIZE = 10000

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
 * Implements BatchTarget interface for zero-copy direct writes from sprites.
 */
export class SpriteBatch extends InstancedMesh implements BatchTarget {
  /**
   * The material used by all sprites in this batch.
   */
  readonly spriteMaterial: Sprite2DMaterial

  /**
   * Maximum number of sprites this batch can hold.
   */
  readonly maxSize: number

  /**
   * Current number of active sprites in the batch.
   */
  private _activeCount: number = 0

  /**
   * Sprites currently in this batch (null = free slot).
   */
  private _sprites: (Sprite2D | null)[] = []

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

  /**
   * Core attribute references.
   */
  private _uvAttribute: InstancedBufferAttribute
  private _colorAttribute: InstancedBufferAttribute
  private _flipAttribute: InstancedBufferAttribute

  /**
   * Custom attribute buffers (from material schema).
   */
  private _customAttributes: Map<string, { buffer: Float32Array; size: number; attribute: InstancedBufferAttribute }> = new Map()

  /**
   * Whether transforms need to be re-read from sprites during upload.
   */
  private _transformsDirty: boolean = false

  constructor(material: Sprite2DMaterial, maxSize: number = DEFAULT_BATCH_SIZE) {
    // Allocate core attribute buffers BEFORE creating InstancedMesh
    // so they exist during shader compilation
    const instanceUV = new Float32Array(maxSize * 4)
    const instanceColor = new Float32Array(maxSize * 4)
    const instanceFlip = new Float32Array(maxSize * 2)

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

    // Create custom attributes from material schema BEFORE super()
    // This is critical - the shader may compile in super() or on first render,
    // and all attributes must be present on the geometry at that time
    const customAttributes = new Map<string, { buffer: Float32Array; size: number; attribute: InstancedBufferAttribute }>()
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
      customAttributes.set(name, { buffer, size, attribute: attr })
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
    this._uvAttribute = uvAttr
    this._colorAttribute = colorAttr
    this._flipAttribute = flipAttr
    this._customAttributes = customAttributes
    this.spriteMaterial = material // Keep reference to original for batchId matching
    this.maxSize = maxSize
    this.frustumCulled = false // Batches manage their own culling

    // Set initial count to 0 (no sprites yet)
    this.count = 0
  }

  // ============================================
  // BatchTarget interface implementation
  // ============================================

  writeColor(index: number, r: number, g: number, b: number, a: number): void {
    this._instanceColor[index * 4 + 0] = r
    this._instanceColor[index * 4 + 1] = g
    this._instanceColor[index * 4 + 2] = b
    this._instanceColor[index * 4 + 3] = a
  }

  writeUV(index: number, x: number, y: number, w: number, h: number): void {
    this._instanceUV[index * 4 + 0] = x
    this._instanceUV[index * 4 + 1] = y
    this._instanceUV[index * 4 + 2] = w
    this._instanceUV[index * 4 + 3] = h
  }

  writeFlip(index: number, flipX: number, flipY: number): void {
    this._instanceFlip[index * 2 + 0] = flipX
    this._instanceFlip[index * 2 + 1] = flipY
  }

  writeMatrix(index: number, matrix: Matrix4): void {
    this.setMatrixAt(index, matrix)
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

  getCustomAttribute(name: string): InstancedBufferAttribute | undefined {
    return this._customAttributes.get(name)?.attribute
  }

  writeEffectSlot(index: number, bufferIndex: number, component: number, value: number): void {
    const attrName = `effectBuf${bufferIndex}`
    const custom = this._customAttributes.get(attrName)
    if (!custom) return
    custom.buffer[index * 4 + component] = value
  }

  // ============================================
  // Sprite management
  // ============================================

  /**
   * Get current sprite count.
   */
  get spriteCount(): number {
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
   * Add a sprite to the batch.
   * The sprite will write directly to this batch's buffers.
   *
   * @returns The index of the sprite in the batch, or -1 if batch is full
   */
  addSprite(sprite: Sprite2D): number {
    let index: number

    // Reuse free slot if available
    if (this._freeList.length > 0) {
      index = this._freeList.pop()!
    } else {
      // Allocate new slot
      if (this._nextIndex >= this.maxSize) {
        return -1 // Batch is full
      }
      index = this._nextIndex++
    }

    this._sprites[index] = sprite
    this._activeCount++

    // Attach sprite to this batch - it will sync its current state
    sprite._attachToBatch(this, index)

    // Mark transforms dirty for upload
    this._transformsDirty = true

    return index
  }

  /**
   * Remove a sprite from the batch.
   * The sprite will revert to using its own buffers.
   */
  removeSprite(sprite: Sprite2D): void {
    const index = sprite._batchIndex
    if (index < 0 || this._sprites[index] !== sprite) return

    // Make slot invisible (alpha = 0) so it doesn't render
    this._instanceColor[index * 4 + 3] = 0
    this._colorAttribute.needsUpdate = true

    // Clear the slot and add to free list
    this._sprites[index] = null
    this._freeList.push(index)
    this._activeCount--

    // Detach sprite from batch - it will sync to its own buffers
    sprite._detachFromBatch()
  }

  /**
   * Clear all sprites from the batch.
   */
  clearSprites(): void {
    // Detach all sprites
    for (let i = 0; i < this._sprites.length; i++) {
      const sprite = this._sprites[i]
      if (sprite) {
        sprite._detachFromBatch()
      }
    }

    this._activeCount = 0
    this._sprites.length = 0
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
   * Upload buffer data to GPU.
   * Only transforms are re-read from sprites (safest with Three.js).
   * Other attributes are written directly by sprites.
   */
  upload(): void {
    // Update transforms from sprites if dirty
    if (this._transformsDirty) {
      for (let i = 0; i < this._sprites.length; i++) {
        const sprite = this._sprites[i]
        if (sprite) {
          sprite.updateMatrix()
          this.setMatrixAt(i, sprite.matrix)
        }
      }
      this.instanceMatrix.needsUpdate = true
      this._transformsDirty = false
    }

    // Update instance count to include all allocated slots
    // (free slots have alpha=0 so they're invisible)
    this.count = this._nextIndex
  }

  /**
   * Get sprites in this batch.
   */
  getSprites(): readonly (Sprite2D | null)[] {
    return this._sprites
  }

  /**
   * Get active (non-null) sprites in this batch.
   */
  getActiveSprites(): Sprite2D[] {
    return this._sprites.filter((s): s is Sprite2D => s !== null)
  }

  /**
   * Dispose of resources.
   */
  override dispose(): this {
    // Detach all sprites first
    this.clearSprites()

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
