import { attribute, texture, uv, vec2, vec4, float, If, Discard, select, positionWorld } from 'three/tsl'
import {
  type Texture,
  FrontSide,
  NormalBlending,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
} from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import { EffectMaterial } from './EffectMaterial'
import type { GlobalUniforms } from '../GlobalUniforms'

/**
 * Context passed to colorTransform callbacks.
 */
export interface ColorTransformContext {
  /** Base sampled + tinted color (vec4) */
  color: Node<'vec4'>
  /** UV after flip + atlas remap */
  atlasUV: Node<'vec2'>
  /** World position XY (works with instancing via positionWorld) */
  worldPosition: Node<'vec2'>
}

/**
 * A function that transforms the base sprite color.
 * Receives the base color and context, returns modified color (vec4).
 */
export type ColorTransformFn = (ctx: ColorTransformContext) => Node<'vec4'>

export interface Sprite2DMaterialOptions {
  map?: Texture
  transparent?: boolean
  alphaTest?: number
  /**
   * Use premultiplied alpha blending.
   * When true, the shader outputs `vec4(rgb * alpha, alpha)` and uses
   * `CustomBlending` with `OneFactor` / `OneMinusSrcAlphaFactor`.
   * This eliminates `Discard()` calls, improving performance on WebGL
   * by preserving early-z optimization. Depth writes are disabled since
   * transparent pixels produce (0,0,0,0) which blends to nothing.
   */
  premultipliedAlpha?: boolean
  /**
   * Effect buffer tier size in floats.
   * Buffers are allocated in tiers: 0, 4, 8, 16.
   * Default is 8 (2 vec4 buffers), covering most effect combinations.
   * Set to 0 for fully effect-free materials (no effect buffer overhead).
   */
  effectTier?: number
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
 * Effects are composed via `registerEffect()`, which packs effect data into
 * fixed-size vec4 buffers with per-sprite enable flags.
 */
export class Sprite2DMaterial extends EffectMaterial {
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
    const alphaTest = options.alphaTest ?? 0
    // alphaTest > 0 implies the depth-test fast path: opaque + depthWrite=true.
    const transparent = options.transparent ?? (alphaTest > 0 ? false : true)
    const lit = options.lit ?? false
    const ctId = getColorTransformId(options.colorTransform)

    const key = `${textureId}:${transparent}:${lit}:${ctId}:${alphaTest}`

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
  private _premultipliedAlpha: boolean = false
  private _colorTransform: ColorTransformFn | null = null
  private _lit: boolean = false
  private _globalUniforms: GlobalUniforms | null = null

  constructor(options: Sprite2DMaterialOptions = {}) {
    super({ effectTier: options.effectTier })

    this.batchId = nextMaterialId++

    this._premultipliedAlpha = options.premultipliedAlpha ?? false
    this._lit = options.lit ?? false
    this._globalUniforms = options.globalUniforms ?? null
    this._colorTransform = options.colorTransform ?? null

    // alphaTest > 0 opts the material into an opaque + depth-test fast
    // path. Transparent defaults flip to false and depthWrite flips to
    // true, so the GPU's depth buffer resolves draw order regardless of
    // instance slot order (the batchSortSystem's CPU sort is then
    // unnecessary and is skipped for this material).
    const alphaTest = options.alphaTest ?? 0
    this.alphaTest = alphaTest
    this.transparent = options.transparent ?? (alphaTest > 0 ? false : true)
    this.depthTest = true
    this.side = FrontSide

    if (this._premultipliedAlpha) {
      this.blending = CustomBlending
      this.blendSrc = OneFactor
      this.blendDst = OneMinusSrcAlphaFactor
      this.depthWrite = false
    } else {
      this.blending = NormalBlending
      // Opaque (transparent=false) materials write depth so the depth
      // test can resolve ordering — enables the alphaTest fast path.
      this.depthWrite = !this.transparent
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
   * Triggers shader rebuild.
   */
  set colorTransform(value: ColorTransformFn | null) {
    if (this._colorTransform === value) return
    this._colorTransform = value
    if (this._spriteTexture) {
      this._rebuildColorNode()
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
   * Triggers shader rebuild to include global tint.
   */
  set globalUniforms(value: GlobalUniforms | null) {
    if (this._globalUniforms === value) return
    this._globalUniforms = value
    if (this._spriteTexture) {
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  /**
   * Gate _rebuildColorNode() — skip if no texture is set yet.
   * @internal
   */
  protected override _canBuildColor(): boolean {
    return this._spriteTexture !== null
  }

  /**
   * Build the base color node for sprites.
   * Handles UV flip, atlas remapping, texture sampling, tint, and alpha test.
   * Called inside Fn() context by EffectMaterial._rebuildColorNode().
   * @internal
   */
  protected override _buildBaseColor(): { color: Node<'vec4'>; uv: Node<'vec2'> } | null {
    const mapTexture = this._spriteTexture!
    const globalUniforms = this._globalUniforms
    const colorTransform = this._colorTransform

    // Read from core instance attributes
    // Explicit type params needed for @types/three ≥0.183 generic AttributeNode
    const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
    const instanceColor = attribute<'vec4'>('instanceColor', 'vec4')
    const instanceFlip = attribute<'vec2'>('instanceFlip', 'vec2')

    // Apply flip
    const baseUV = uv()
    const flippedUV = vec2(
      select(instanceFlip.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
      select(instanceFlip.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
    )

    // Remap to frame in atlas
    const atlasUV = flippedUV
      .mul(vec2(instanceUV.z, instanceUV.w))
      .add(vec2(instanceUV.x, instanceUV.y))

    // Sample texture
    const texColor = texture(mapTexture, atlasUV)

    // Apply instance color (tint) and alpha
    let tintedRGB = texColor.rgb.mul(instanceColor.rgb)

    // Apply global tint if globalUniforms are wired
    if (globalUniforms) {
      tintedRGB = tintedRGB.mul(globalUniforms.globalTintNode)
    }

    const finalAlpha = texColor.a.mul(instanceColor.a)

    let color: Node<'vec4'>
    const alphaTestValue = this.alphaTest
    if (this._premultipliedAlpha) {
      if (alphaTestValue > 0) {
        If(finalAlpha.lessThan(float(alphaTestValue)), () => {
          Discard()
        })
      }
      color = vec4(tintedRGB.mul(finalAlpha), finalAlpha)
    } else {
      const cutoff = alphaTestValue > 0 ? alphaTestValue : 0.01
      If(finalAlpha.lessThan(float(cutoff)), () => {
        Discard()
      })
      color = vec4(tintedRGB, finalAlpha)
    }

    // Apply color transform if set (e.g., lighting)
    if (colorTransform) {
      color = colorTransform({
        color,
        atlasUV,
        worldPosition: positionWorld.xy,
      })
    }

    return { color, uv: atlasUV }
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
      this._rebuildColorNode()
      this.needsUpdate = true
    }
  }

  /**
   * Clone this material.
   */
  override clone(): this {
    const cloned = new Sprite2DMaterial({
      map: this._spriteTexture ?? undefined,
      transparent: this.transparent,
      alphaTest: this.alphaTest,
      premultipliedAlpha: this._premultipliedAlpha,
      effectTier: this._defaultEffectTier,
      colorTransform: this._colorTransform ?? undefined,
      lit: this._lit,
      globalUniforms: this._globalUniforms ?? undefined,
    }) as this

    // Copy effects (registers their packed slots and rebuilds colorNode)
    for (const effectClass of this._effects) {
      ;(cloned as Sprite2DMaterial).registerEffect(effectClass)
    }

    return cloned
  }

  dispose() {
    this._effects.length = 0
    this._instanceAttributes.clear()
    this._effectSlots.clear()
    this._effectBitIndex.clear()
    super.dispose()
  }
}
