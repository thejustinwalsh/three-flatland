import {
  InstancedMesh,
  PlaneGeometry,
  InstancedBufferAttribute,
  DynamicDrawUsage,
} from 'three'
import type { Sprite2D } from '../sprites/Sprite2D'
import type { Sprite2DMaterial } from '../materials/Sprite2DMaterial'
import type { InstanceAttributeType } from './types'

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
   * Current number of sprites in the batch.
   */
  private _count: number = 0

  /**
   * Sprites currently in this batch.
   */
  private _sprites: Sprite2D[] = []

  /**
   * Core attribute buffers.
   */
  private _instanceUV: Float32Array
  private _instanceColor: Float32Array
  private _instanceFlip: Float32Array

  /**
   * Custom attribute buffers (from material schema).
   */
  private _customAttributes: Map<string, { buffer: Float32Array; size: number }> = new Map()

  /**
   * Whether the batch data needs to be re-uploaded to GPU.
   */
  private _dirty: boolean = false

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

    // Create geometry and add instance attributes BEFORE super()
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

    // Clone the material to ensure shader is compiled correctly for instanced rendering
    const clonedMaterial = material.clone() as Sprite2DMaterial

    // Create InstancedMesh - geometry now has all required attributes
    super(geometry, clonedMaterial, maxSize)

    // Store references
    this._instanceUV = instanceUV
    this._instanceColor = instanceColor
    this._instanceFlip = instanceFlip
    this.spriteMaterial = material // Keep reference to original for batchId matching
    this.maxSize = maxSize
    this.frustumCulled = false // Batches manage their own culling

    // Set initial count to 0 (no sprites yet)
    this.count = 0

    // Create custom attributes from material schema
    this._createCustomAttributes()
  }


  /**
   * Create custom attributes from material's instance attribute schema.
   */
  private _createCustomAttributes() {
    const schema = this.spriteMaterial.getInstanceAttributeSchema()
    const geo = this.geometry

    for (const [name, config] of schema) {
      const size = getTypeSize(config.type)
      const buffer = new Float32Array(this.maxSize * size)

      // Fill with default values
      const defaultValue = config.defaultValue
      for (let i = 0; i < this.maxSize; i++) {
        if (typeof defaultValue === 'number') {
          buffer[i * size] = defaultValue
        } else {
          for (let j = 0; j < defaultValue.length; j++) {
            buffer[i * size + j] = defaultValue[j] ?? 0
          }
        }
      }

      this._customAttributes.set(name, { buffer, size })

      const attr = new InstancedBufferAttribute(buffer, size)
      attr.setUsage(DynamicDrawUsage)
      geo.setAttribute(name, attr)
    }
  }

  /**
   * Get current sprite count.
   */
  get spriteCount(): number {
    return this._count
  }

  /**
   * Check if batch is full.
   */
  get isFull(): boolean {
    return this._count >= this.maxSize
  }

  /**
   * Check if batch is empty.
   */
  get isEmpty(): boolean {
    return this._count === 0
  }

  /**
   * Check if batch needs GPU upload.
   */
  get isDirty(): boolean {
    return this._dirty
  }

  /**
   * Add a sprite to the batch.
   *
   * @returns The index of the sprite in the batch, or -1 if batch is full
   */
  addSprite(sprite: Sprite2D): number {
    if (this._count >= this.maxSize) {
      return -1
    }

    const index = this._count
    this._sprites[index] = sprite
    this._count++
    this._dirty = true

    // Write sprite data to buffers
    this._writeSprite(index, sprite)

    return index
  }

  /**
   * Clear all sprites from the batch.
   */
  clearSprites(): void {
    this._count = 0
    this._sprites.length = 0
    this._dirty = true
    this.count = 0
  }

  /**
   * Rebuild the batch from current sprites.
   * Call after sprites have been modified.
   */
  rebuild(): void {
    for (let i = 0; i < this._count; i++) {
      const sprite = this._sprites[i]
      if (sprite) {
        this._writeSprite(i, sprite)
      }
    }
    this._dirty = true
  }

  /**
   * Write a sprite's data to the buffers at the given index.
   */
  private _writeSprite(index: number, sprite: Sprite2D): void {
    // Transform matrix (Sprite2D.updateMatrix() handles Z offset for layer/zIndex sorting)
    sprite.updateMatrix()
    this.setMatrixAt(index, sprite.matrix)

    // Frame UV
    const frame = sprite.frame
    if (frame) {
      this._instanceUV[index * 4 + 0] = frame.x
      this._instanceUV[index * 4 + 1] = frame.y
      this._instanceUV[index * 4 + 2] = frame.width
      this._instanceUV[index * 4 + 3] = frame.height
    } else {
      // Default: full texture
      this._instanceUV[index * 4 + 0] = 0
      this._instanceUV[index * 4 + 1] = 0
      this._instanceUV[index * 4 + 2] = 1
      this._instanceUV[index * 4 + 3] = 1
    }

    // Color (tint + alpha)
    const tint = sprite.tint
    this._instanceColor[index * 4 + 0] = tint.r
    this._instanceColor[index * 4 + 1] = tint.g
    this._instanceColor[index * 4 + 2] = tint.b
    this._instanceColor[index * 4 + 3] = sprite.alpha

    // Flip
    this._instanceFlip[index * 2 + 0] = sprite.flipX ? -1 : 1
    this._instanceFlip[index * 2 + 1] = sprite.flipY ? -1 : 1

    // Custom attributes
    const instanceValues = sprite.getInstanceValues()
    for (const [name, { buffer, size }] of this._customAttributes) {
      const value = instanceValues.get(name)
      const config = this.spriteMaterial.getInstanceAttribute(name)

      if (value !== undefined) {
        if (typeof value === 'number') {
          buffer[index * size] = value
        } else {
          for (let i = 0; i < value.length && i < size; i++) {
            buffer[index * size + i] = value[i] ?? 0
          }
        }
      } else if (config) {
        // Use default from material
        const defaultValue = config.defaultValue
        if (typeof defaultValue === 'number') {
          buffer[index * size] = defaultValue
        } else {
          for (let i = 0; i < defaultValue.length; i++) {
            buffer[index * size + i] = defaultValue[i] ?? 0
          }
        }
      }
    }
  }

  /**
   * Upload buffer data to GPU.
   * Call after adding/modifying sprites and before rendering.
   */
  upload(): void {
    if (!this._dirty) return

    // Update instance count
    this.count = this._count

    // Mark instance matrix for upload
    this.instanceMatrix.needsUpdate = true

    // Mark core attributes for upload
    const geo = this.geometry
    const uvAttr = geo.getAttribute('instanceUV') as InstancedBufferAttribute
    const colorAttr = geo.getAttribute('instanceColor') as InstancedBufferAttribute
    const flipAttr = geo.getAttribute('instanceFlip') as InstancedBufferAttribute

    uvAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    flipAttr.needsUpdate = true

    // Mark custom attributes for upload
    for (const name of this._customAttributes.keys()) {
      const attr = geo.getAttribute(name) as InstancedBufferAttribute
      if (attr) {
        attr.needsUpdate = true
      }
    }

    this._dirty = false
  }

  /**
   * Get sprites in this batch.
   */
  getSprites(): readonly Sprite2D[] {
    return this._sprites.slice(0, this._count)
  }

  /**
   * Dispose of resources.
   */
  override dispose(): this {
    this.geometry.dispose()
    // Dispose the cloned material (this.material is the cloned one used for rendering)
    const mat = this.material
    if (mat && !Array.isArray(mat) && mat !== this.spriteMaterial) {
      mat.dispose()
    }
    this._sprites.length = 0
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
