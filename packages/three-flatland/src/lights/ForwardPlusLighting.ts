import { DataTexture, FloatType, RGBAFormat, NearestFilter, Vector2, Vector3 } from 'three'
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

/**
 * Fixed side-length of the tile-index DataTexture. Allocated once at
 * construction and NEVER resized — the previous tall-narrow layout
 * (`width = blocksPerTile`, `height = tileCount`) hit WebGPU's 8192
 * 2D-texture dimension limit at fullscreen (e.g. 1440p / 16-px tiles
 * ≈ 10k–14k rows), causing the GPU texture to allocate at a clipped
 * size and the shader to read zeros — visible as "lights disappear on
 * fullscreen, only ambient survives."
 *
 * 512 × 512 × RGBA32F = 4 MB GPU + CPU. Capacity is
 * `512² / blocksPerTile = 65,536` tiles — enough for 5K CSS canvas
 * (5120×2880 → 57,600 tiles) at TILE_SIZE=16.
 */
export const TILE_TEXTURE_DIM = 512

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
  readonly ambientNode = uniform(new Vector3(0, 0, 0))

  constructor() {
    // Pre-allocate the tile texture at its maximum size. Never resized —
    // runtime `init()`/`resize()` updates only tile-count uniforms and
    // CPU-side bookkeeping arrays. Avoids the three.js-WebGPU resize
    // pitfall (replacing DataTexture.image orphans the backend's Source
    // cache) and sidesteps the WebGPU 8192 2D-texture dim limit that the
    // previous `height = tileCount` layout hit at fullscreen.
    const totalTexels = TILE_TEXTURE_DIM * TILE_TEXTURE_DIM
    this._tileData = new Float32Array(totalTexels * 4)
    this._tileTexture = new DataTexture(
      this._tileData,
      TILE_TEXTURE_DIM,
      TILE_TEXTURE_DIM,
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

    // Capacity check — if the viewport implies more tiles than the
    // fixed-size tile texture can hold, the last (out-of-capacity) tiles
    // will alias back into the texture via the linear-index mod. Warn so
    // callers know to bump TILE_TEXTURE_DIM or TILE_SIZE.
    const blocksPerTile = MAX_LIGHTS_PER_TILE / 4
    const maxTiles = Math.floor((TILE_TEXTURE_DIM * TILE_TEXTURE_DIM) / blocksPerTile)
    if (this._tileCount > maxTiles) {
      console.warn(
        `[ForwardPlusLighting] ${this._tileCount} tiles exceeds texture capacity ${maxTiles}. ` +
          `Increase TILE_TEXTURE_DIM or TILE_SIZE. Excess tiles will alias.`
      )
    }

    // Grow-only CPU bookkeeping. These don't bind to the GPU so resize
    // is free — just allocate larger arrays when the tile count grows.
    // Never shrink (avoids churn when the window resizes down-then-up).
    if (this._lightCounts.length < this._tileCount) {
      this._lightCounts = new Uint32Array(this._tileCount)
      this._tileScores = new Float32Array(this._tileCount * MAX_LIGHTS_PER_TILE)
    }

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

    // Buffers are over-allocated vs. the current tile count — zero only
    // the portion we'll write to so per-frame cost doesn't scale with the
    // max-capacity tile texture (4MB).
    const blocksPerTile = MAX_LIGHTS_PER_TILE / 4
    const usedTileFloats = this._tileCount * blocksPerTile * 4
    this._tileData.fill(0, 0, usedTileFloats)

    const lightCounts = this._lightCounts
    const tileScores = this._tileScores
    lightCounts.fill(0, 0, this._tileCount)
    tileScores.fill(0, 0, this._tileCount * MAX_LIGHTS_PER_TILE)

    // Accumulate ambient lights into a single uniform — they affect every
    // pixel equally so they don't need Forward+ tile slots.
    let ambR = 0, ambG = 0, ambB = 0
    for (const light of lights) {
      if (!light.enabled || light.lightType !== 'ambient') continue
      ambR += light.color.r * light.intensity
      ambG += light.color.g * light.intensity
      ambB += light.color.b * light.intensity
    }
    this.ambientNode.value.set(ambR, ambG, ambB)

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
    const blocksPerTile = int(MAX_LIGHTS_PER_TILE / 4)
    const texWidth = int(TILE_TEXTURE_DIM)
    // Each tile occupies `blocksPerTile` consecutive RGBA texels in a
    // flat linear order. Convert `(tileIndex, blockOffset)` → linear
    // texel index → 2D `(x, y)` in the fixed TILE_TEXTURE_DIM² texture.
    return (tileIndex: ReturnType<typeof int>, slotIndex: ReturnType<typeof int>) => {
      const blockOffset = slotIndex.div(int(4))
      const elementOffset = slotIndex.mod(int(4))
      const linearTexel = tileIndex.mul(blocksPerTile).add(blockOffset)
      const x = linearTexel.mod(texWidth)
      const y = linearTexel.div(texWidth)
      return int(textureLoad(tileTexture, ivec2(x, y)).element(elementOffset))
    }
  }

  dispose(): void {
    this._tileTexture.dispose()
    unregisterDebugArray('forwardPlus.lightCounts')
    unregisterDebugArray('forwardPlus.tileScores')
    unregisterDebugTexture('forwardPlus.tiles')
  }
}
