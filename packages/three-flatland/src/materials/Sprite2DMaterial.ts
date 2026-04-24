import { attribute, texture, uv, vec2, vec4, float, If, Discard, select } from 'three/tsl'
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
import { readFlip } from '../lights/wrapWithLightFlags'
import type { GlobalUniforms } from '../GlobalUniforms'

// Re-export types that moved to EffectMaterial for backwards compatibility
export type { ColorTransformContext, ColorTransformFn } from './EffectMaterial'
import type { ColorTransformFn } from './EffectMaterial'

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
  /** Global uniforms for auto-applying tint, time, etc. */
  globalUniforms?: GlobalUniforms
  /** Effect configuration key for material caching/batching */
  effectsKey?: string
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
   * Canonical three.js class identifier — every built-in material
   * overrides this (MeshBasicMaterial's `type` is `'MeshBasicMaterial'`,
   * etc.). Devtools / inspectors that walk the scene graph read `.type`
   * to categorise materials without `instanceof` checks. Subclasses
   * (e.g. future `TileMapMaterial`) should override again.
   */
  override type: string = 'Sprite2DMaterial'


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
    const ctId = getColorTransformId(options.colorTransform)
    const effectsKey = options.effectsKey ?? ''

    const key = `${textureId}:${transparent}:${ctId}:${effectsKey}`

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
  private _globalUniforms: GlobalUniforms | null = null

  constructor(options: Sprite2DMaterialOptions = {}) {
    super({ effectTier: options.effectTier })

    this.batchId = nextMaterialId++

    this._premultipliedAlpha = options.premultipliedAlpha ?? false
    this._globalUniforms = options.globalUniforms ?? null
    this._colorTransform = options.colorTransform ?? null
    this.transparent = options.transparent ?? true
    this.depthTest = true
    this.side = FrontSide

    if (this._premultipliedAlpha) {
      this.blending = CustomBlending
      this.blendSrc = OneFactor
      this.blendDst = OneMinusSrcAlphaFactor
      this.depthWrite = false
    } else {
      this.blending = NormalBlending
      this.depthWrite = false
    }

    if (options.map) {
      this.setTexture(options.map)
    }
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

    // Read from core instance attributes. Named helpers
    // (`readFlip`) hide the packed layout; see
    // `lights/wrapWithLightFlags.ts` for the full accessor set.
    const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
    const instanceColor = attribute<'vec4'>('instanceColor', 'vec4')
    const flip = readFlip()

    // Apply flip
    const baseUV = uv()
    const flippedUV = vec2(
      select(flip.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
      select(flip.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
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
    if (this._premultipliedAlpha) {
      color = vec4(tintedRGB.mul(finalAlpha), finalAlpha)
    } else {
      If(texColor.a.lessThan(float(0.01)), () => {
        Discard()
      })
      color = vec4(tintedRGB, finalAlpha)
    }

    return { color, uv: atlasUV }
  }

  /**
   * Get the base sprite texture for channel providers.
   * @internal
   */
  protected override _getBaseTexture(): Texture | null {
    return this._spriteTexture
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
      globalUniforms: this._globalUniforms ?? undefined,
    }) as this

    cloned._requiredChannels = this._requiredChannels

    // Copy effects (registers their packed slots and rebuilds colorNode)
    for (const effectClass of this._effects) {
      const constants = this._effectConstants.get(effectClass.effectName)
      ;(cloned as Sprite2DMaterial).registerEffect(effectClass, constants)
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
