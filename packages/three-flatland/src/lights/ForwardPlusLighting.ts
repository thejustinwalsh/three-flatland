import { DataTexture, FloatType, RGBAFormat, NearestFilter, Vector2 } from 'three'
import { uniform, int, ivec2, textureLoad } from 'three/tsl'
import type { Light2D } from './Light2D'
import {
  registerDebugArray,
  registerDebugTexture,
  touchDebugArray,
  touchDebugTexture,
  unregisterDebugArray,
  unregisterDebugTexture,
} from '../debug/debug-sink'

export const TILE_SIZE = 16
export const MAX_LIGHTS_PER_TILE = 16

export class ForwardPlusLighting {
  private _tileCountX = 0
  private _tileCountY = 0
  private _tileCount = 0

  private _tileData: Float32Array
  private _tileTexture: DataTexture
  /**
   * Per-tile light count (`length = _tileCount`). Promoted to a
   * persistent member so (a) no per-frame allocation, and (b) the
   * devtools registry can hold a stable reference to visualise which
   * tiles are saturated / empty.
   */
  private _lightCounts: Uint32Array = new Uint32Array(0)
  /**
   * Per-slot reservoir scores (`length = _tileCount * MAX_LIGHTS_PER_TILE`).
   * Same rationale — also exposed for debugging (per-tile quality).
   */
  private _tileScores: Float32Array = new Float32Array(0)

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
    this._lightCounts = new Uint32Array(this._tileCount)
    this._tileScores = new Float32Array(this._tileCount * MAX_LIGHTS_PER_TILE)

    // Resize existing texture — stable reference for TSL textureLoad
    this._tileTexture.image = {
      data: this._tileData,
      width: blocksPerTile,
      height: this._tileCount,
    }
    this._tileTexture.needsUpdate = true

    // (Re-)publish debug views. `registerDebugArray` is a no-op when
    // devtools isn't bundled (build-time gated), so this costs nothing
    // in production.
    registerDebugArray('forwardPlus.lightCounts', this._lightCounts, 'uint', {
      label: 'Lights per tile',
    })
    registerDebugArray('forwardPlus.tileScores', this._tileScores, 'float', {
      label: 'Reservoir scores',
    })
    registerDebugTexture('forwardPlus.tiles', this._tileTexture, 'rgba32f', {
      label: 'Tile index DataTexture',
    })
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

    // Persistent buffers, zeroed in place — no per-frame allocation.
    const lightCounts = this._lightCounts
    const tileScores = this._tileScores
    lightCounts.fill(0)
    tileScores.fill(0)

    const tileCountX = this._tileCountX
    const tileCountY = this._tileCountY
    const worldSizeX = this._worldSize.x
    const worldSizeY = this._worldSize.y
    const worldOffsetX = this._worldOffset.x
    const worldOffsetY = this._worldOffset.y
    const tileWorldWidth = worldSizeX / tileCountX
    const tileWorldHeight = worldSizeY / tileCountY

    for (let lightIdx = 0; lightIdx < lights.length; lightIdx++) {
      const light = lights[lightIdx]!
      if (!light.enabled) continue
      if (light.lightType === 'ambient') continue

      const isDirectional = light.lightType === 'directional'
      const lx = light.position.x
      const ly = light.position.y
      const intensity = light.intensity
      const cutoff = light.distance
      const cutoffSq = cutoff > 0 ? cutoff * cutoff : 0
      const decay = light.decay

      for (let ty = 0; ty < tileCountY; ty++) {
        const tileMinY = ty * tileWorldHeight + worldOffsetY
        const tileMaxY = tileMinY + tileWorldHeight
        const closestY = ly < tileMinY ? tileMinY : ly > tileMaxY ? tileMaxY : ly
        const dyAABB = ly - closestY
        for (let tx = 0; tx < tileCountX; tx++) {
          let score: number
          if (isDirectional) {
            score = intensity
          } else {
            const tileMinX = tx * tileWorldWidth + worldOffsetX
            const tileMaxX = tileMinX + tileWorldWidth
            const closestX =
              lx < tileMinX ? tileMinX : lx > tileMaxX ? tileMaxX : lx
            const dxAABB = lx - closestX
            const distSq = dxAABB * dxAABB + dyAABB * dyAABB
            if (cutoffSq > 0 && distSq >= cutoffSq) continue
            const dist = Math.sqrt(distSq)
            const base = intensity / Math.max(Math.pow(dist, decay), 1)
            const falloff = cutoff > 0 ? 1 - dist / cutoff : 1
            score = base * falloff
          }
          if (score <= 0) continue

          const tileIdx = ty * tileCountX + tx
          const count = lightCounts[tileIdx]!
          const scoreBase = tileIdx * MAX_LIGHTS_PER_TILE
          const texelBase = tileIdx * 4 * 4 // blocksPerTile * 4

          if (count < MAX_LIGHTS_PER_TILE) {
            const blockIdx = count >> 2
            const elementIdx = count & 3
            this._tileData[texelBase + blockIdx * 4 + elementIdx] = lightIdx + 1
            tileScores[scoreBase + count] = score
            lightCounts[tileIdx] = count + 1
            continue
          }

          // Tile full — scan for the weakest occupant and evict only if the
          // incoming light is strictly brighter at the tile center. Prevents
          // thrash at equal scores.
          let minSlot = 0
          let minScore = tileScores[scoreBase]!
          for (let s = 1; s < MAX_LIGHTS_PER_TILE; s++) {
            const v = tileScores[scoreBase + s]!
            if (v < minScore) {
              minScore = v
              minSlot = s
            }
          }
          if (score > minScore) {
            const blockIdx = minSlot >> 2
            const elementIdx = minSlot & 3
            this._tileData[texelBase + blockIdx * 4 + elementIdx] = lightIdx + 1
            tileScores[scoreBase + minSlot] = score
          }
        }
      }
    }

    this._tileTexture.needsUpdate = true

    // Notify devtools the arrays changed this frame (no-op in prod).
    touchDebugArray('forwardPlus.lightCounts')
    touchDebugArray('forwardPlus.tileScores')
    touchDebugTexture('forwardPlus.tiles')
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
    unregisterDebugArray('forwardPlus.lightCounts')
    unregisterDebugArray('forwardPlus.tileScores')
    unregisterDebugTexture('forwardPlus.tiles')
  }
}
