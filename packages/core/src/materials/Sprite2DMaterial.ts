import { MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform, texture, uv, vec2, vec4, float, Fn, If, Discard, select } from 'three/tsl'
import { Color, Vector2, Vector4, type Texture, FrontSide, NormalBlending } from 'three'

export interface Sprite2DMaterialOptions {
  map?: Texture
  transparent?: boolean
  alphaTest?: number
}

/**
 * TSL-based material for 2D sprites.
 *
 * Supports:
 * - Texture atlas frame sampling
 * - Tint color
 * - Alpha/opacity
 * - Flip X/Y
 * - Alpha testing
 */
export class Sprite2DMaterial extends MeshBasicNodeMaterial {
  // Uniforms exposed for animation/updates
  readonly frameUV = uniform(new Vector4(0, 0, 1, 1)) // x, y, w, h
  readonly tintColor = uniform(new Color(0xffffff))
  readonly alphaValue = uniform(1.0)
  readonly flipFlags = uniform(new Vector2(1, 1)) // 1 or -1

  private _spriteTexture: Texture | null = null

  constructor(options: Sprite2DMaterialOptions = {}) {
    super()

    this.transparent = options.transparent ?? true
    this.depthWrite = false
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

    // Color node: sample texture with frame UV, apply tint and alpha
    this.colorNode = Fn(() => {
      // Get base UV
      const baseUV = uv()

      // Apply flip
      const flippedUV = vec2(
        select(this.flipFlags.x.greaterThan(float(0)), baseUV.x, float(1).sub(baseUV.x)),
        select(this.flipFlags.y.greaterThan(float(0)), baseUV.y, float(1).sub(baseUV.y))
      )

      // Remap to frame in atlas
      const atlasUV = flippedUV
        .mul(vec2(this.frameUV.z, this.frameUV.w))
        .add(vec2(this.frameUV.x, this.frameUV.y))

      // Sample texture
      const texColor = texture(mapTexture, atlasUV)

      // Alpha test - discard fully transparent pixels
      If(texColor.a.lessThan(float(0.01)), () => {
        Discard()
      })

      // Apply tint and alpha
      return vec4(texColor.rgb.mul(this.tintColor), texColor.a.mul(this.alphaValue))
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
      // Rebuild nodes with new texture
      this.setupNodes()
      this.needsUpdate = true
    }
  }

  /**
   * Set the frame UV coordinates.
   */
  setFrame(x: number, y: number, width: number, height: number) {
    this.frameUV.value.set(x, y, width, height)
  }

  /**
   * Set tint color.
   */
  setTint(color: Color | string | number) {
    if (color instanceof Color) {
      this.tintColor.value.copy(color)
    } else {
      this.tintColor.value.set(color)
    }
  }

  /**
   * Set alpha/opacity.
   */
  setAlpha(alpha: number) {
    this.alphaValue.value = alpha
  }

  /**
   * Set flip flags.
   */
  setFlip(flipX: boolean, flipY: boolean) {
    this.flipFlags.value.set(flipX ? -1 : 1, flipY ? -1 : 1)
  }

  dispose() {
    super.dispose()
  }
}
