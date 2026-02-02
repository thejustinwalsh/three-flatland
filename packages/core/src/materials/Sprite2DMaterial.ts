import { MeshBasicNodeMaterial } from 'three/webgpu'
import { attribute, texture, uv, vec2, vec4, float, Fn, If, Discard, select, positionWorld } from 'three/tsl'
import { type Texture, FrontSide, NormalBlending } from 'three'
import type { InstanceAttributeConfig, InstanceAttributeType } from '../pipeline/types'
import type { TSLNode } from '../nodes/types'
import type { GlobalUniforms } from '../GlobalUniforms'

/**
 * Context passed to colorTransform callbacks.
 */
export interface ColorTransformContext {
  /** Base sampled + tinted color (vec4) */
  color: TSLNode
  /** UV after flip + atlas remap */
  atlasUV: TSLNode
  /** World position XY (works with instancing via positionWorld) */
  worldPosition: TSLNode
}

/**
 * A function that transforms the base sprite color.
 * Receives the base color and context, returns modified color (vec4).
 */
export type ColorTransformFn = (ctx: ColorTransformContext) => TSLNode

export interface Sprite2DMaterialOptions {
  map?: Texture
  transparent?: boolean
  alphaTest?: number
  /** Color transform function for custom effects (e.g., lighting) */
  colorTransform?: ColorTransformFn
  /** Whether this material should be lit by Flatland's lights */
  lit?: boolean
  /** Global uniforms for auto-applying tint, time, etc. */
  globalUniforms?: GlobalUniforms
}

// Global material ID counter for batching
let nextMaterialId = 0

// WeakMap to assign stable numeric IDs to colorTransform functions
const colorTransformIds = new WeakMap<ColorTransformFn, number>()
let nextColorTransformId = 0

function getColorTransformId(fn: ColorTransformFn | undefined): number {
  if (!fn) return -1
  let id = colorTransformIds.get(fn)
  if (id === undefined) {
    id = nextColorTransformId++
    colorTransformIds.set(fn, id)
  }
  return id
}

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
   * Cache of shared material instances, keyed by configuration.
   * Used by `getShared()` so sprites with identical config reuse the same material.
   */
  private static _cache = new Map<string, Sprite2DMaterial>()

  /**
   * Get a shared material instance for the given options.
   * Materials with identical configuration (texture, transparent, lit, colorTransform)
   * return the same instance, enabling automatic batching.
   */
  static getShared(options: Sprite2DMaterialOptions = {}): Sprite2DMaterial {
    const textureId = options.map?.id ?? -1
    const transparent = options.transparent ?? true
    const lit = options.lit ?? false
    const ctId = getColorTransformId(options.colorTransform)

    const key = `${textureId}:${transparent}:${lit}:${ctId}`

    let material = Sprite2DMaterial._cache.get(key)
    if (!material) {
      material = new Sprite2DMaterial(options)
      Sprite2DMaterial._cache.set(key, material)
    }
    return material
  }

  /**
   * Unique batch ID for this material instance (used for batching).
   */
  readonly batchId: number

  private _spriteTexture: Texture | null = null

  /**
   * Color transform function for custom effects (e.g., lighting).
   */
  private _colorTransform: ColorTransformFn | null = null

  /**
   * Whether this material should be auto-lit by Flatland.
   */
  private _lit: boolean = false

  /**
   * Global uniforms reference (shared by all materials via same node objects).
   */
  private _globalUniforms: GlobalUniforms | null = null

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

    this._lit = options.lit ?? false
    this._globalUniforms = options.globalUniforms ?? null

    if (options.colorTransform) {
      this._colorTransform = options.colorTransform
    }

    if (options.map) {
      this.setTexture(options.map)
    }
  }

  /**
   * Get the color transform function.
   */
  get colorTransform(): ColorTransformFn | null {
    return this._colorTransform
  }

  /**
   * Set the color transform function.
   * Triggers shader recompilation.
   */
  set colorTransform(value: ColorTransformFn | null) {
    this._colorTransform = value
    if (this._spriteTexture) {
      this.setupNodes()
      this.needsUpdate = true
    }
  }

  /**
   * Whether this material should be auto-lit by Flatland.
   */
  get lit(): boolean {
    return this._lit
  }

  set lit(value: boolean) {
    this._lit = value
  }

  /**
   * Get the global uniforms reference.
   */
  get globalUniforms(): GlobalUniforms | null {
    return this._globalUniforms
  }

  /**
   * Set the global uniforms reference.
   * Triggers shader recompilation to include global tint.
   */
  set globalUniforms(value: GlobalUniforms | null) {
    this._globalUniforms = value
    if (this._spriteTexture) {
      this.setupNodes()
      this.needsUpdate = true
    }
  }

  private setupNodes() {
    if (!this._spriteTexture) return

    const mapTexture = this._spriteTexture
    const colorTransform = this._colorTransform
    const globalUniforms = this._globalUniforms

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
      let tintedRGB = texColor.rgb.mul(instanceColor.rgb)

      // Apply global tint if globalUniforms are wired
      if (globalUniforms) {
        tintedRGB = tintedRGB.mul(globalUniforms.globalTintNode)
      }

      const baseColor = vec4(
        tintedRGB,
        texColor.a.mul(instanceColor.a)
      )

      // Apply color transform if set (e.g., lighting)
      if (colorTransform) {
        return colorTransform({
          color: baseColor,
          atlasUV,
          worldPosition: positionWorld.xy,
        })
      }

      return baseColor
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
   * Ensures the cloned material has the texture, nodes, and custom colorNode preserved.
   */
  override clone(): this {
    const cloned = new Sprite2DMaterial({
      map: this._spriteTexture ?? undefined,
      transparent: this.transparent,
      alphaTest: this.alphaTest,
      colorTransform: this._colorTransform ?? undefined,
      lit: this._lit,
      globalUniforms: this._globalUniforms ?? undefined,
    }) as this

    // Copy instance attributes
    for (const [name, config] of this._instanceAttributes) {
      ;(cloned as Sprite2DMaterial)._instanceAttributes.set(name, { ...config })
    }

    // Preserve custom colorNode if it was set externally (e.g., for effects)
    // This is important because setupNodes() sets a default colorNode,
    // but users may override it with custom TSL effects
    if (this.colorNode) {
      cloned.colorNode = this.colorNode
      cloned.needsUpdate = true
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
