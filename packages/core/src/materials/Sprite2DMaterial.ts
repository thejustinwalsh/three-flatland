import { attribute, texture, uv, vec2, vec4, float, Fn, If, Discard, select } from 'three/tsl'
import {
  type Texture,
  FrontSide,
  NormalBlending,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
} from 'three'
import { EffectMaterial } from './EffectMaterial'
import type { TSLNode } from '../nodes/types'

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
 * Effects are composed via `registerEffect()`, which packs effect data into
 * fixed-size vec4 buffers with per-sprite enable flags.
 */
export class Sprite2DMaterial extends EffectMaterial {
  /**
   * Unique batch ID for this material instance (used for batching).
   */
  readonly batchId: number

  private _spriteTexture: Texture | null = null
  private _premultipliedAlpha: boolean = false

  constructor(options: Sprite2DMaterialOptions = {}) {
    super({ effectTier: options.effectTier })

    this.batchId = nextMaterialId++

    this._premultipliedAlpha = options.premultipliedAlpha ?? false
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
      this.depthWrite = true
    }

    if (options.map) {
      this.setTexture(options.map)
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
  protected override _buildBaseColor(): { color: TSLNode; uv: TSLNode } | null {
    const mapTexture = this._spriteTexture!


    // Read from core instance attributes
    const instanceUV = attribute('instanceUV', 'vec4')
    const instanceColor = attribute('instanceColor', 'vec4')
    const instanceFlip = attribute('instanceFlip', 'vec2')

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
    const finalAlpha = texColor.a.mul(instanceColor.a)

    let color: TSLNode
    if (this._premultipliedAlpha) {
      color = vec4(texColor.rgb.mul(instanceColor.rgb).mul(finalAlpha), finalAlpha)
    } else {
      If(texColor.a.lessThan(float(0.01)), () => {
        Discard()
      })
      color = vec4(texColor.rgb.mul(instanceColor.rgb), finalAlpha)
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
    }) as this

    // Copy effects (registers their packed slots and rebuilds colorNode)
    for (const effectClass of this._effects) {
      ;(cloned as Sprite2DMaterial).registerEffect(effectClass)
    }

    return cloned
  }

  dispose() {
    super.dispose()
    this._effects.length = 0
    this._instanceAttributes.clear()
    this._effectSlots.clear()
    this._effectBitIndex.clear()
  }
}
