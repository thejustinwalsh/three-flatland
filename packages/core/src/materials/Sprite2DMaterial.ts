import { MeshBasicNodeMaterial } from 'three/webgpu'
import { attribute, texture, uv, vec2, vec4, float, Fn, If, Discard, select } from 'three/tsl'
import { type Texture, FrontSide, NormalBlending } from 'three'
import type { InstanceAttributeConfig, InstanceAttributeType } from '../pipeline/types'

export interface Sprite2DMaterialOptions {
  map?: Texture
  transparent?: boolean
  alphaTest?: number
}

// Global material ID counter for batching
let nextMaterialId = 0

/**
 * TSL-based material for 2D sprites.
 *
 * UNIFIED API: This material reads from instance attributes, which works for:
 * - Single sprites (Sprite2D sets attributes on its geometry)
 * - Batched sprites (SpriteBatch sets instanced attributes)
 *
 * Core instance attributes (always present):
 * - instanceUV (vec4): frame UV (x, y, width, height) in atlas
 * - instanceColor (vec4): tint color and alpha (r, g, b, a)
 * - instanceFlip (vec2): flip flags (x, y) where 1 = normal, -1 = flipped
 *
 * Custom instance attributes can be added via addInstanceFloat(), etc.
 */
export class Sprite2DMaterial extends MeshBasicNodeMaterial {
  /**
   * Unique batch ID for this material instance (used for batching).
   */
  readonly batchId: number

  private _spriteTexture: Texture | null = null

  /**
   * Custom instance attribute schema.
   * Defines additional per-sprite attributes for effects.
   */
  private _instanceAttributes: Map<string, InstanceAttributeConfig> = new Map()

  constructor(options: Sprite2DMaterialOptions = {}) {
    super()

    this.batchId = nextMaterialId++

    this.transparent = options.transparent ?? true
    // Enable depth write by default for proper zIndex sorting within batches
    // The batch system automatically sets Z position based on layer/zIndex
    this.depthWrite = true
    this.depthTest = true
    this.side = FrontSide
    this.blending = NormalBlending

    if (options.map) {
      this.setTexture(options.map)
    }
  }

  private setupNodes() {
    if (!this._spriteTexture) return

    const mapTexture = this._spriteTexture

    // Read from instance attributes (works for both single sprites and batched)
    const instanceUV = attribute('instanceUV', 'vec4')
    const instanceColor = attribute('instanceColor', 'vec4')
    const instanceFlip = attribute('instanceFlip', 'vec2')

    // Color node: sample texture with instance UV, apply instance color
    this.colorNode = Fn(() => {
      // Get base UV
      const baseUV = uv()

      // Apply flip using instance attribute
      const flippedUV = vec2(
        select(instanceFlip.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
        select(instanceFlip.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
      )

      // Remap to frame in atlas using instance UV
      const atlasUV = flippedUV
        .mul(vec2(instanceUV.z, instanceUV.w))
        .add(vec2(instanceUV.x, instanceUV.y))

      // Sample texture
      const texColor = texture(mapTexture, atlasUV)

      // Alpha test - discard fully transparent pixels
      If(texColor.a.lessThan(float(0.01)), () => {
        Discard()
      })

      // Apply instance color (tint) and alpha
      return vec4(
        texColor.rgb.mul(instanceColor.rgb),
        texColor.a.mul(instanceColor.a)
      )
    })()
  }

  /**
   * Get the sprite texture.
   */
  getTexture(): Texture | null {
    return this._spriteTexture
  }

  /**
   * Set the sprite texture.
   */
  setTexture(value: Texture | null) {
    this._spriteTexture = value
    if (value) {
      this.setupNodes()
      this.needsUpdate = true
    }
  }

  // ============================================
  // INSTANCE ATTRIBUTE SYSTEM
  // ============================================

  /**
   * Add a float instance attribute.
   */
  addInstanceFloat(name: string, defaultValue: number = 0): this {
    this._instanceAttributes.set(name, {
      name,
      type: 'float',
      defaultValue,
    })
    return this
  }

  /**
   * Add a vec2 instance attribute.
   */
  addInstanceVec2(name: string, defaultValue: [number, number] = [0, 0]): this {
    this._instanceAttributes.set(name, {
      name,
      type: 'vec2',
      defaultValue,
    })
    return this
  }

  /**
   * Add a vec3 instance attribute.
   */
  addInstanceVec3(name: string, defaultValue: [number, number, number] = [0, 0, 0]): this {
    this._instanceAttributes.set(name, {
      name,
      type: 'vec3',
      defaultValue,
    })
    return this
  }

  /**
   * Add a vec4 instance attribute.
   */
  addInstanceVec4(name: string, defaultValue: [number, number, number, number] = [0, 0, 0, 0]): this {
    this._instanceAttributes.set(name, {
      name,
      type: 'vec4',
      defaultValue,
    })
    return this
  }

  /**
   * Remove an instance attribute.
   */
  removeInstanceAttribute(name: string): this {
    this._instanceAttributes.delete(name)
    return this
  }

  /**
   * Check if an instance attribute exists.
   */
  hasInstanceAttribute(name: string): boolean {
    return this._instanceAttributes.has(name)
  }

  /**
   * Get an instance attribute configuration.
   */
  getInstanceAttribute(name: string): InstanceAttributeConfig | undefined {
    return this._instanceAttributes.get(name)
  }

  /**
   * Get all instance attribute configurations.
   * Used by SpriteBatch to create InstancedBufferAttributes.
   */
  getInstanceAttributeSchema(): Map<string, InstanceAttributeConfig> {
    return this._instanceAttributes
  }

  /**
   * Get the number of floats needed per instance for custom attributes.
   */
  getInstanceAttributeStride(): number {
    let stride = 0
    for (const config of this._instanceAttributes.values()) {
      stride += getTypeSize(config.type)
    }
    return stride
  }

  /**
   * Clone this material.
   * Ensures the cloned material has the texture and nodes set up properly.
   */
  override clone(): this {
    const cloned = new Sprite2DMaterial({
      map: this._spriteTexture ?? undefined,
      transparent: this.transparent,
      alphaTest: this.alphaTest,
    }) as this

    // Copy instance attributes
    for (const [name, config] of this._instanceAttributes) {
      ;(cloned as Sprite2DMaterial)._instanceAttributes.set(name, { ...config })
    }

    return cloned
  }

  dispose() {
    super.dispose()
    this._instanceAttributes.clear()
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
