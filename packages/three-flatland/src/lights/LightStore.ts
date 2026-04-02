import { DataTexture, FloatType, RGBAFormat, NearestFilter } from 'three'
import { uniform, int, ivec2, texture as sampleTexture, textureLoad } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type { Light2D } from './Light2D'

/**
 * Light type encoding for the shader.
 * Stored as float in the DataTexture.
 */
const LIGHT_TYPE_POINT = 0
const LIGHT_TYPE_SPOT = 1
const LIGHT_TYPE_DIRECTIONAL = 2
const LIGHT_TYPE_AMBIENT = 3

/**
 * Function that reads a light index from a tile buffer/texture.
 * Abstracts over WebGPU storage buffers and WebGL2 DataTextures.
 *
 * @param tileIndex - TSL node for the flat tile index
 * @param slotIndex - TSL node for the slot within the tile (0..MAX_LIGHTS_PER_TILE-1)
 * @returns TSL int node containing the 1-based light index (0 = empty)
 */
export type TileLookupFn = (tileIndex: Node<'int'>, slotIndex: Node<'int'>) => Node<'int'>

/**
 * Thin DataTexture storage for 2D lights.
 *
 * Stores per-light data in a DataTexture (width=maxLights, height=4 rows,
 * RGBAFormat, FloatType). Supports up to `maxLights` (default 256, configurable).
 *
 * DataTexture layout:
 * | Row | R      | G         | B      | A        |
 * |-----|--------|-----------|--------|----------|
 * | 0   | posX   | posY      | colorR | colorG   |
 * | 1   | colorB | intensity | distance | decay  |
 * | 2   | dirX   | dirY      | angle  | penumbra |
 * | 3   | type   | enabled   | 0      | 0        |
 *
 * The shader reads via `textureLoad(lightsTexture, ivec2(lightIndex, row))`.
 *
 * @example
 * ```typescript
 * const store = new LightStore({ maxLights: 64 })
 * store.sync(flatland.lights)  // CPU → DataTexture each frame
 * ```
 */
export class LightStore {
  /** Maximum number of lights this store can handle */
  readonly maxLights: number

  // DataTexture light storage
  private _lightsData: Float32Array
  private _lightsTexture: DataTexture
  private _lightsTextureNode: Node<'vec4'>
  private _countNode: UniformNode<'float', number>

  constructor(options?: { maxLights?: number }) {
    this.maxLights = options?.maxLights ?? 256

    // DataTexture: width=maxLights, height=4 rows, RGBA float
    const dataSize = this.maxLights * 4 * 4 // 4 rows x 4 channels x maxLights
    this._lightsData = new Float32Array(dataSize)
    this._lightsTexture = new DataTexture(
      this._lightsData,
      this.maxLights,
      4,
      RGBAFormat,
      FloatType
    )
    this._lightsTexture.minFilter = NearestFilter
    this._lightsTexture.magFilter = NearestFilter
    this._lightsTexture.needsUpdate = true

    // Stable TSL node reference for the lights DataTexture
    this._lightsTextureNode = sampleTexture(this._lightsTexture)

    this._countNode = uniform(0)
  }

  /** Get the lights DataTexture (for use by GPU systems like RadianceCascades) */
  get lightsTexture(): DataTexture {
    return this._lightsTexture
  }

  /** Get the TSL node for the lights DataTexture */
  get lightsTextureNode(): Node<'vec4'> {
    return this._lightsTextureNode
  }

  /** Get the current light count uniform node */
  get countNode(): UniformNode<'float', number> {
    return this._countNode
  }

  /**
   * Sync Light2D array into DataTexture.
   * Call once per frame. Copies current Light2D properties into the
   * DataTexture backing array. No shader recompilation.
   */
  sync(lights: readonly Light2D[]): void {
    const count = Math.min(lights.length, this.maxLights)
    this._countNode.value = count

    const data = this._lightsData
    const lineSize = this.maxLights * 4 // stride per row (4 channels x width)

    for (let i = 0; i < count; i++) {
      const light = lights[i]!
      const offset = i * 4

      // Row 0: posX, posY, colorR, colorG
      data[offset + 0] = light.position.x
      data[offset + 1] = light.position.y
      data[offset + 2] = light.color.r
      data[offset + 3] = light.color.g

      // Row 1: colorB, intensity, distance, decay
      data[lineSize + offset + 0] = light.color.b
      data[lineSize + offset + 1] = light.intensity
      data[lineSize + offset + 2] = light.distance
      data[lineSize + offset + 3] = light.decay

      // Row 2: dirX, dirY, angle, penumbra
      data[2 * lineSize + offset + 0] = light.direction.x
      data[2 * lineSize + offset + 1] = light.direction.y
      data[2 * lineSize + offset + 2] = light.angle
      data[2 * lineSize + offset + 3] = light.penumbra

      // Row 3: type, enabled, 0, 0
      let lightType = LIGHT_TYPE_POINT
      switch (light.lightType) {
        case 'point':
          lightType = LIGHT_TYPE_POINT
          break
        case 'spot':
          lightType = LIGHT_TYPE_SPOT
          break
        case 'directional':
          lightType = LIGHT_TYPE_DIRECTIONAL
          break
        case 'ambient':
          lightType = LIGHT_TYPE_AMBIENT
          break
      }
      data[3 * lineSize + offset + 0] = lightType
      data[3 * lineSize + offset + 1] = light.enabled ? 1 : 0
      data[3 * lineSize + offset + 2] = 0
      data[3 * lineSize + offset + 3] = 0
    }

    // Zero out unused slots (enabled=0)
    for (let i = count; i < this.maxLights; i++) {
      const offset = i * 4
      // Row 1: intensity = 0
      data[lineSize + offset + 1] = 0
      // Row 3: enabled = 0
      data[3 * lineSize + offset + 1] = 0
    }

    this._lightsTexture.needsUpdate = true
  }

  /**
   * Read light data from the DataTexture in TSL.
   * Returns row0..row3 vec4 values for a given light index.
   */
  readLightData(lightIndex: Node<'float'> | Node<'int'>): {
    row0: Node<'vec4'>
    row1: Node<'vec4'>
    row2: Node<'vec4'>
    row3: Node<'vec4'>
  } {
    const i = int(lightIndex)
    const row0 = textureLoad(this._lightsTexture, ivec2(i, int(0)))
    const row1 = textureLoad(this._lightsTexture, ivec2(i, int(1)))
    const row2 = textureLoad(this._lightsTexture, ivec2(i, int(2)))
    const row3 = textureLoad(this._lightsTexture, ivec2(i, int(3)))
    return { row0, row1, row2, row3 }
  }

  /** Dispose of GPU resources. */
  dispose(): void {
    this._lightsTexture.dispose()
  }
}
