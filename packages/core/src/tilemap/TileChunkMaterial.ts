import { MeshBasicNodeMaterial } from 'three/webgpu'
import { texture, uv, vec2, vec4, float, Fn, If, Discard, attribute } from 'three/tsl'
import { type Texture, FrontSide, NormalBlending } from 'three'

export interface TileChunkMaterialOptions {
  /** The tileset texture atlas */
  map: Texture
  /** Alpha test threshold (default: 0.01) */
  alphaTest?: number
}

/**
 * TSL-based material for tile chunk rendering.
 *
 * Uses instance attributes for per-tile UV data:
 * - instanceUV (vec4): UV offset and size in atlas (x, y, width, height)
 *
 * The material samples the texture atlas at the correct position for each tile instance.
 */
export class TileChunkMaterial extends MeshBasicNodeMaterial {
  private _tileTexture: Texture

  constructor(options: TileChunkMaterialOptions) {
    super()

    const { map: tileTexture, alphaTest = 0.01 } = options
    this._tileTexture = tileTexture

    // Instance attribute for UV offset/scale
    const instanceUV = attribute('instanceUV', 'vec4')

    // Setup color node
    this.colorNode = Fn(() => {
      // Get base UV (0-1 on quad)
      const baseUV = uv()

      // Remap to tile position in atlas
      // instanceUV = (x, y, width, height) in normalized coordinates
      // We need to flip Y since Tiled uses Y-down but textures use Y-up
      const flippedY = float(1).sub(baseUV.y)
      const atlasUV = vec2(baseUV.x, flippedY)
        .mul(vec2(instanceUV.z, instanceUV.w))
        .add(vec2(instanceUV.x, instanceUV.y))

      // Sample texture
      const texColor = texture(tileTexture, atlasUV)

      // Alpha test - discard fully transparent pixels
      If(texColor.a.lessThan(float(alphaTest)), () => {
        Discard()
      })

      return texColor
    })()

    // Material settings
    this.transparent = true
    this.depthWrite = true
    this.depthTest = true
    this.side = FrontSide
    this.blending = NormalBlending
  }

  /**
   * Get the tile texture.
   */
  get tileTexture(): Texture {
    return this._tileTexture
  }
}
