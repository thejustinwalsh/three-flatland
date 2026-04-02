import { DataTexture, FloatType, RGBAFormat, NearestFilter, Vector2 } from 'three'
import { uniform, int, ivec2, textureLoad } from 'three/tsl'
import type { Light2D } from './Light2D'

export const TILE_SIZE = 16
export const MAX_LIGHTS_PER_TILE = 16

export class ForwardPlusLighting {
  private _tileCountX = 0
  private _tileCountY = 0
  private _tileCount = 0

  private _tileData: Float32Array
  private _tileTexture: DataTexture

  private _screenSize = new Vector2()
  private _worldSize = new Vector2()
  private _worldOffset = new Vector2()

  readonly tileCountXNode = uniform(1)
  readonly screenSizeNode = uniform(new Vector2(1, 1))
  readonly worldSizeNode = uniform(new Vector2(1, 1))
  readonly worldOffsetNode = uniform(new Vector2(0, 0))

  constructor() {
    // Eagerly allocate a 1-tile placeholder so createTileLookup() can
    // capture a stable texture reference at node-build time.
    const blocksPerTile = MAX_LIGHTS_PER_TILE / 4
    this._tileData = new Float32Array(blocksPerTile * 4)
    this._tileTexture = new DataTexture(
      this._tileData,
      blocksPerTile,
      1,
      RGBAFormat,
      FloatType
    )
    this._tileTexture.minFilter = NearestFilter
    this._tileTexture.magFilter = NearestFilter
    this._tileTexture.needsUpdate = true
  }

  get tileTexture(): DataTexture {
    return this._tileTexture
  }

  get tileCountX(): number {
    return this._tileCountX
  }

  init(screenWidth: number, screenHeight: number): void {
    this._screenSize.set(screenWidth, screenHeight)
    this._tileCountX = Math.ceil(screenWidth / TILE_SIZE)
    this._tileCountY = Math.ceil(screenHeight / TILE_SIZE)
    this._tileCount = this._tileCountX * this._tileCountY

    this.tileCountXNode.value = this._tileCountX
    this.screenSizeNode.value.set(screenWidth, screenHeight)

    const blocksPerTile = MAX_LIGHTS_PER_TILE / 4
    this._tileData = new Float32Array(this._tileCount * blocksPerTile * 4)

    // Resize existing texture — stable reference for TSL textureLoad
    this._tileTexture.image = {
      data: this._tileData,
      width: blocksPerTile,
      height: this._tileCount,
    }
    this._tileTexture.needsUpdate = true
  }

  resize(screenWidth: number, screenHeight: number): void {
    const newTileCountX = Math.ceil(screenWidth / TILE_SIZE)
    const newTileCountY = Math.ceil(screenHeight / TILE_SIZE)

    if (newTileCountX !== this._tileCountX || newTileCountY !== this._tileCountY) {
      this.init(screenWidth, screenHeight)
    }
  }

  setWorldBounds(worldSize: Vector2, worldOffset: Vector2): void {
    this._worldSize.copy(worldSize)
    this._worldOffset.copy(worldOffset)
    this.worldSizeNode.value.copy(worldSize)
    this.worldOffsetNode.value.copy(worldOffset)
  }

  update(lights: Light2D[]): void {
    if (this._tileCount === 0) return

    this._tileData.fill(0)

    const lightCounts = new Uint8Array(this._tileCount)
    const screenW = this._screenSize.x
    const screenH = this._screenSize.y
    const _worldToScreenX = screenW / this._worldSize.x
    const _worldToScreenY = screenH / this._worldSize.y

    // BRUTE FORCE: assign every non-ambient light to every tile
    for (let lightIdx = 0; lightIdx < lights.length; lightIdx++) {
      const light = lights[lightIdx]!
      if (!light.enabled) continue
      if (light.lightType === 'ambient') continue

      for (let tileIdx = 0; tileIdx < this._tileCount; tileIdx++) {
        const count = lightCounts[tileIdx]!
        if (count >= MAX_LIGHTS_PER_TILE) continue

        const blockIdx = Math.floor(count / 4)
        const elementIdx = count % 4
        const texelIdx = (tileIdx * 4 + blockIdx) * 4 + elementIdx
        this._tileData[texelIdx] = lightIdx + 1
        lightCounts[tileIdx] = count + 1
      }
    }

    this._tileTexture.needsUpdate = true
  }

  createTileLookup() {
    const tileTexture = this._tileTexture
    return (tileIndex: ReturnType<typeof int>, slotIndex: ReturnType<typeof int>) => {
      const blockOffset = slotIndex.div(int(4))
      const elementOffset = slotIndex.mod(int(4))
      return int(textureLoad(tileTexture, ivec2(blockOffset, tileIndex)).element(elementOffset))
    }
  }

  dispose(): void {
    this._tileTexture.dispose()
  }
}
