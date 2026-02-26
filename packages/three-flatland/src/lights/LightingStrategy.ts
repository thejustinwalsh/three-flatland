import { Vector2 } from 'three'
import type { OrthographicCamera, Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import type { ColorTransformFn } from '../materials/Sprite2DMaterial'
import type { LightingSystem } from './LightingSystem'
import type { SDFGenerator } from './SDFGenerator'
import type { Light2D } from './Light2D'
import { ForwardPlusLighting, TILE_SIZE } from './ForwardPlusLighting'
import { RadianceCascades } from './RadianceCascades'
import type { RadianceCascadesConfig } from './RadianceCascades'

/**
 * Context provided to lighting strategies during init and update.
 */
export interface LightingStrategyContext {
  renderer: WebGPURenderer
  lighting: LightingSystem
  camera: OrthographicCamera
  sdfGenerator: SDFGenerator | null
  lights: readonly Light2D[]
  worldSize: Vector2
  worldOffset: Vector2
}

/**
 * Abstract interface for lighting strategies.
 *
 * Strategies encapsulate the lighting mode selection and can be hot-swapped
 * at runtime via Flatland.setLightingStrategy().
 *
 * Three built-in strategies:
 * - SimpleLightingStrategy: no shadows, just attenuation
 * - DirectLightingStrategy: SDF shadows + optional Forward+ tiling
 * - RadianceLightingStrategy: SDF + Radiance Cascades GI
 */
export interface LightingStrategy {
  /** Human-readable name for debugging */
  readonly name: string

  /** Whether this strategy requires the shadow/SDF pipeline */
  readonly needsShadows: boolean

  /** Initialize strategy-specific GPU resources (called lazily on first render) */
  init(ctx: LightingStrategyContext): void

  /** Per-frame GPU passes (tiling, radiance, etc.) */
  update(ctx: LightingStrategyContext): void

  /** Handle resize */
  resize(width: number, height: number): void

  /** Create a ColorTransformFn for a lit sprite */
  createColorTransform(
    lighting: LightingSystem,
    options?: { texture?: Texture; autoNormals?: boolean; rimEnabled?: boolean }
  ): ColorTransformFn

  /** Dispose GPU resources owned by this strategy */
  dispose(): void
}

/**
 * Simple lighting: no SDF, no shadows, just per-fragment light attenuation.
 *
 * Use when you want basic lighting without any shadow overhead.
 */
export class SimpleLightingStrategy implements LightingStrategy {
  readonly name = 'simple'
  readonly needsShadows = false

  init(_ctx: LightingStrategyContext): void {}
  update(_ctx: LightingStrategyContext): void {}
  resize(_width: number, _height: number): void {}

  createColorTransform(
    lighting: LightingSystem,
    options?: { texture?: Texture; autoNormals?: boolean; rimEnabled?: boolean }
  ): ColorTransformFn {
    return lighting.createColorTransform({ ...options, shadows: false })
  }

  dispose(): void {}
}

/**
 * Direct lighting: SDF sphere-traced shadows with optional Forward+ tiling.
 *
 * When tiling is enabled, uses per-tile light lists for O(lights_in_tile)
 * per fragment instead of O(all_lights).
 */
export class DirectLightingStrategy implements LightingStrategy {
  readonly name = 'direct'
  readonly needsShadows = true

  private _tiling: boolean
  private _forwardPlus: ForwardPlusLighting | null = null

  constructor(options?: { tiling?: boolean }) {
    this._tiling = options?.tiling ?? false
  }

  /** Whether Forward+ tiling is enabled */
  get tiling(): boolean {
    return this._tiling
  }

  /** The ForwardPlusLighting instance (null if tiling disabled or not yet initialized) */
  get forwardPlusLighting(): ForwardPlusLighting | null {
    return this._forwardPlus
  }

  init(ctx: LightingStrategyContext): void {
    if (this._tiling && !this._forwardPlus) {
      const size = ctx.renderer.getSize(new Vector2())
      this._forwardPlus = new ForwardPlusLighting()
      this._forwardPlus.init(size.x, size.y)
    }
  }

  update(ctx: LightingStrategyContext): void {
    if (this._tiling && this._forwardPlus) {
      this._forwardPlus.setWorldBounds(ctx.worldSize, ctx.worldOffset)
      this._forwardPlus.update(ctx.lights as Light2D[])
    }
  }

  resize(width: number, height: number): void {
    this._forwardPlus?.resize(width, height)
  }

  createColorTransform(
    lighting: LightingSystem,
    options?: { texture?: Texture; autoNormals?: boolean; rimEnabled?: boolean }
  ): ColorTransformFn {
    if (this._tiling && this._forwardPlus) {
      const fp = this._forwardPlus
      return lighting.createTiledColorTransform(
        fp.createTileLookup(),
        fp.tileCountXNode,
        fp.screenSizeNode,
        TILE_SIZE,
        { ...options, shadows: lighting.shadows }
      )
    }
    return lighting.createColorTransform({ ...options, shadows: lighting.shadows })
  }

  dispose(): void {
    this._forwardPlus?.dispose()
    this._forwardPlus = null
  }
}

/**
 * Radiance Cascades GI: SDF + hierarchical radiance cascades for global illumination.
 *
 * Provides both direct shadows (from SDF) and indirect lighting (from cascade merging).
 * Configurable via RadianceCascadesConfig.
 */
export class RadianceLightingStrategy implements LightingStrategy {
  readonly name = 'radiance'
  readonly needsShadows = true

  private _rc: RadianceCascades | null = null
  private _rcConfig: Partial<RadianceCascadesConfig>

  constructor(config?: Partial<RadianceCascadesConfig>) {
    this._rcConfig = config ?? {}
  }

  /** The RadianceCascades instance (null if not yet initialized) */
  get radianceCascades(): RadianceCascades | null {
    return this._rc
  }

  init(ctx: LightingStrategyContext): void {
    if (this._rc) return

    const cameraWidth = ctx.camera.right - ctx.camera.left
    const cameraHeight = ctx.camera.top - ctx.camera.bottom

    this._rc = new RadianceCascades(this._rcConfig)
    this._rc.init(cameraWidth, cameraHeight, ctx.lighting.lightsTexture, ctx.lighting.countNode)

    const radianceTex = this._rc.radianceTexture
    if (radianceTex) {
      ctx.lighting.setRadianceTexture(radianceTex)
    }
  }

  update(ctx: LightingStrategyContext): void {
    if (!this._rc || !ctx.sdfGenerator) return

    this._rc.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    this._rc.generate(ctx.renderer, ctx.sdfGenerator.sdfTexture)

    // DEBUG: render specific cascade texture to screen (change index to step through)
    // Cascade 3 = highest (boundary), 2, 1, 0 = lowest → final averaging
    // const DEBUG_CASCADE_INDEX = 3 // <-- change this to debug each cascade
    // const cascadeTextures = this._rc.cascadeTextures
    // const radianceTex = cascadeTextures[DEBUG_CASCADE_INDEX] ?? this._rc.finalRadianceTexture
    const radianceTex = this._rc.finalRadianceTexture
    if (radianceTex) {
      ctx.lighting.setRadianceTexture(radianceTex)
    }
  }

  resize(width: number, height: number): void {
    this._rc?.resize(width, height)
  }

  createColorTransform(
    lighting: LightingSystem,
    options?: { texture?: Texture; autoNormals?: boolean; rimEnabled?: boolean }
  ): ColorTransformFn {
    return lighting.createColorTransform({ ...options, shadows: false, radiance: true })
  }

  dispose(): void {
    this._rc?.dispose()
    this._rc = null
  }
}
