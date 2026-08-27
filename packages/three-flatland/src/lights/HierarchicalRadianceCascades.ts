import {
  ClampToEdgeWrapping,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  Vector2,
  type Texture,
} from 'three'
import { NodeMaterial, QuadMesh, RendererUtils, type WebGPURenderer } from 'three/webgpu'
import {
  beginDebugPass,
  endDebugPass,
  registerDebugTexture,
  unregisterDebugTexture,
} from '../debug/debug-sink'
import {
  Break,
  Fn,
  If,
  Loop,
  atan,
  cos,
  float,
  floor,
  int,
  ivec2,
  min,
  mix,
  mod,
  sin,
  smoothstep,
  texture as sampleTexture,
  textureLoad,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import {
  RadianceCascades,
  getSharedBlueNoiseTexture,
  RADIANCE_CASCADES_PRESETS,
  type RadianceCascadesConfig,
  type RadianceCascadesQuality,
} from './RadianceCascades'
import { worldToUV, uvToWorld } from './coordUtils'

/**
 * Hierarchical and Holographic Radiance Cascades renderer for Flatland.
 *
 * Attribution:
 * - Holographic mode follows the transfer/radiance hierarchy from Rouli
 *   Freeman, Alexander Sannikov, and Adrian Margel, "Holographic Radiance
 *   Cascades for 2D Global Illumination" (arXiv:2505.02041, 2025).
 * - The conventional RC reference/oracle path follows Alexander Sannikov's
 *   Radiance Cascades technique and this package's `RadianceCascades`
 *   implementation.
 * - The older interval-composition mode is an experimental local approximation
 *   under A/B test against RC. It is not claimed as paper-correct Holographic
 *   RC until it passes the recorded parity gates.
 *
 * This is an independent TypeScript/TSL implementation; no paper or demo
 * shader code is copied into the repo.
 */

const TAU = Math.PI * 2
const EPS = 0.5
const BLUE_NOISE_SIZE = 32
const _quadMesh = new QuadMesh()
let _rendererState: ReturnType<typeof RendererUtils.resetRendererState>

export type HierarchicalRadianceCascadesQuality = RadianceCascadesQuality

export type HierarchicalRadianceCascadesMode = 'hierarchical' | 'holographic'

export interface HolographicRadianceCascadesLevelInfo {
  /** HRC cascade level `n` from the paper. */
  level: number
  /** Final irradiance/probe columns represented by this HRC hierarchy. */
  outputWidth: number
  /** Final irradiance/probe rows represented by this HRC hierarchy. */
  outputHeight: number
  /** Padded quadrant grid dimension used to pack all four rotated quadrants into one atlas shape. */
  outputMaxDimension: number
  /** Number of packed logical Holographic segments: four rotations times two parity offsets. */
  segmentCount: number
  /** Probe columns after decimating only along the quadrant-facing axis. */
  probeWidth: number
  /** Probe rows per logical segment. */
  probeHeight: number
  /** Number of transfer directions `k = 0..2^n`. */
  transferDirectionCount: number
  /** Number of radiance cones `i = 0..2^n-1`. */
  radianceDirectionCount: number
  /** Transfer values for one quadrant at this level. */
  transferValueCount: number
  /** Radiance values for one quadrant at this level. */
  radianceValueCount: number
  /** Packed transfer atlas width for all `k` directions in one quadrant row. */
  transferAtlasWidth: number
  /** Packed transfer atlas height with four quadrants stacked vertically. */
  transferAtlasHeight: number
  /** Packed radiance atlas width for all `i` cones in one quadrant row. `0` for terminal `R_N`. */
  radianceAtlasWidth: number
  /** Packed radiance atlas height with four quadrants stacked vertically. `0` for terminal `R_N`. */
  radianceAtlasHeight: number
}

export interface HierarchicalRadianceCascadesConfig extends RadianceCascadesConfig {
  /** Short base intervals composed into longer transfer instead of raymarching every interval directly. */
  shortIntervalCount: number
  /** Number of interval-composition levels after the base short-interval atlas. */
  compositionLevels: number
  /** HRC composition family: experimental interval composition or Holographic transfer/radiance recursion. */
  compositionMode: HierarchicalRadianceCascadesMode
  /**
   * Multiplier for Holographic final/reconstruction resolution relative to the
   * legacy RC probe-grid final resolution. `1` preserves the current compact
   * output; `4` makes a 16-ray cascade render at cascade/display resolution.
   */
  holographicFinalResolutionScale: number
}

const DEFAULT_HRC_CONFIG: HierarchicalRadianceCascadesConfig = {
  cascadeCount: 4,
  baseRayCount: 16,
  baseInterval: 0,
  cascadeResolution: 0,
  sceneRadianceDownsampleFactor: 2,
  maxAutoCascadeResolution: 512,
  angularJitter: true,
  raymarchSteps: 32,
  blueNoiseStrength: 0.45,
  intervalOverlap: 0.1,
  filterRadius: 1.25,
  filterStrength: 0.8,
  filterDiagonals: true,
  filterJitterStrength: 0.35,
  mipBlur: 0,
  mipStrength: 0.25,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  shortIntervalCount: 4,
  compositionLevels: 2,
  compositionMode: 'hierarchical',
  holographicFinalResolutionScale: 1,
}

export const HIERARCHICAL_RADIANCE_CASCADES_PRESETS: Record<
  HierarchicalRadianceCascadesQuality,
  Partial<HierarchicalRadianceCascadesConfig>
> = {
  fast: {
    ...RADIANCE_CASCADES_PRESETS.fast,
    maxAutoCascadeResolution: 256,
    shortIntervalCount: 4,
    compositionLevels: 2,
    compositionMode: 'hierarchical',
    holographicFinalResolutionScale: 1,
  },
  balanced: {
    ...RADIANCE_CASCADES_PRESETS.balanced,
    maxAutoCascadeResolution: 512,
    mipBlur: 0,
    mipStrength: 0.25,
    shortIntervalCount: 4,
    compositionLevels: 2,
    compositionMode: 'hierarchical',
    holographicFinalResolutionScale: 1,
  },
  quality: {
    ...RADIANCE_CASCADES_PRESETS.quality,
    maxAutoCascadeResolution: 1024,
    shortIntervalCount: 8,
    compositionLevels: 3,
    compositionMode: 'hierarchical',
    holographicFinalResolutionScale: 1,
  },
}

export function createHierarchicalRadianceCascadesConfig(
  quality: HierarchicalRadianceCascadesQuality = 'balanced',
  overrides: Partial<HierarchicalRadianceCascadesConfig> = {}
): Partial<HierarchicalRadianceCascadesConfig> {
  return { ...HIERARCHICAL_RADIANCE_CASCADES_PRESETS[quality], ...overrides }
}

/**
 * Configuration boundary for the interval-composition HRC renderer.
 *
 * This class is intentionally separate from `RadianceCascades`. It is not a
 * subclass with different defaults: HRC will build a short-interval atlas and
 * compose transfer through levels instead of raymarching each cascade interval
 * directly. The runtime passes land behind this boundary.
 */
export class HierarchicalRadianceCascades {
  readonly algorithm = 'interval-composition'
  private _config: HierarchicalRadianceCascadesConfig
  private _referenceHierarchy: RadianceCascades
  private _shortIntervalAtlasRT: RenderTarget
  private _compositionRTs: [RenderTarget, RenderTarget]
  private _holographicTransferRTs: RenderTarget[] = []
  private _holographicRadianceRTs: RenderTarget[] = []
  private _holographicDirectTransferMaterials = new Map<number, NodeMaterial>()
  private _holographicRecursiveTransferMaterials = new Map<number, NodeMaterial>()
  private _holographicRadianceMaterials = new Map<number, NodeMaterial>()
  private _sceneRadianceRT: RenderTarget | null = null
  private _rawFinalRadianceRT: RenderTarget
  private _wideRadianceRT: RenderTarget
  private _wideBlurRT: RenderTarget
  private _wideRadianceRT2: RenderTarget
  private _wideBlurRT2: RenderTarget
  private _finalRadianceRT: RenderTarget
  private _sceneRadianceMaterial: NodeMaterial | null = null
  private _shortIntervalMaterial: NodeMaterial | null = null
  private _compositionMaterials = new Map<number, NodeMaterial>()
  private _finalRadianceMaterial: NodeMaterial | null = null
  private _finalRadianceSourceTexture: Texture | null = null
  private _filterRadianceMaterial: NodeMaterial | null = null
  private _wideDownsampleMaterial: NodeMaterial | null = null
  private _wideDownsampleMaterial2: NodeMaterial | null = null
  private _wideBlurHMaterial: NodeMaterial | null = null
  private _wideBlurVMaterial: NodeMaterial | null = null
  private _wideBlurHMaterial2: NodeMaterial | null = null
  private _wideBlurVMaterial2: NodeMaterial | null = null
  private _worldSize = new Vector2(1, 1)
  private _worldOffset = new Vector2(0, 0)
  private _worldSizeNode = uniform(new Vector2(1, 1))
  private _worldOffsetNode = uniform(new Vector2(0, 0))
  private _shortIntervalLengthNode = uniform(1)
  private _finalTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode2 = uniform(new Vector2(1, 1))
  private _blueNoiseStrengthNode = uniform(0.45)
  private _filterRadiusNode = uniform(1.25)
  private _filterStrengthNode = uniform(0.8)
  private _filterJitterStrengthNode = uniform(0.35)
  private _mipBlurNode = uniform(0)
  private _mipStrengthNode = uniform(0)
  private _blueNoiseTexture: DataTexture
  private _effectiveBaseInterval = 16
  private _autoBaseInterval: boolean
  private _autoCascadeResolution: boolean
  private _lightsTexture: DataTexture | null = null
  private _lightCountNode: Node<'float'> = uniform(0)
  private _sdfTexture: Texture | null = null
  private _lastComposedTexture: Texture | null = null
  private _lastComposedSpan = 1

  constructor(config: Partial<HierarchicalRadianceCascadesConfig> = {}) {
    this._config = {
      ...DEFAULT_HRC_CONFIG,
      ...HIERARCHICAL_RADIANCE_CASCADES_PRESETS.balanced,
      ...config,
    }
    this._referenceHierarchy = new RadianceCascades(this._config)
    this._autoBaseInterval = this._config.baseInterval <= 0
    this._autoCascadeResolution = this._config.cascadeResolution <= 0
    this.shortIntervalCount = this._config.shortIntervalCount
    this.compositionLevels = this._config.compositionLevels
    this.compositionMode = this._config.compositionMode

    const initialCascadeResolution = this._config.cascadeResolution > 0 ? this._config.cascadeResolution : 128
    const initialAtlasResolution = this._shortIntervalAtlasResolution(initialCascadeResolution)
    const initialFinalResolution = this._finalRadianceResolution(initialCascadeResolution)
    this._shortIntervalAtlasRT = this._createRenderTarget(initialAtlasResolution, initialAtlasResolution)
    this._compositionRTs = [
      this._createRenderTarget(initialAtlasResolution, initialAtlasResolution),
      this._createRenderTarget(initialAtlasResolution, initialAtlasResolution),
    ]
    this._rebuildHolographicRenderTargets(initialCascadeResolution)
    this._rawFinalRadianceRT = this._createRenderTarget(initialFinalResolution, initialFinalResolution)
    this._wideRadianceRT = this._createRenderTarget(initialFinalResolution, initialFinalResolution)
    this._wideBlurRT = this._createRenderTarget(initialFinalResolution, initialFinalResolution)
    this._wideRadianceRT2 = this._createRenderTarget(initialFinalResolution, initialFinalResolution)
    this._wideBlurRT2 = this._createRenderTarget(initialFinalResolution, initialFinalResolution)
    this._finalRadianceRT = this._createRenderTarget(initialFinalResolution, initialFinalResolution)
    this._blueNoiseTexture = getSharedBlueNoiseTexture()
    this.blueNoiseStrength = this._config.blueNoiseStrength
    this.raymarchSteps = this._config.raymarchSteps
    this.sceneRadianceDownsampleFactor = this._config.sceneRadianceDownsampleFactor
    this.filterRadius = this._config.filterRadius
    this.filterStrength = this._config.filterStrength
    this.filterJitterStrength = this._config.filterJitterStrength
    this.mipBlur = this._config.mipBlur
    this.mipStrength = this._config.mipStrength
    this.wideDownsampleFactor = this._config.wideDownsampleFactor
    this.wideLevels = this._config.wideLevels

    registerDebugTexture('hrc.shortIntervals', this._shortIntervalAtlasRT, 'rgba16f', {
      display: 'colors',
      label: 'HRC short interval atlas',
    })
    registerDebugTexture('hrc.composedIntervals', this._compositionRTs[0], 'rgba16f', {
      display: 'colors',
      label: 'HRC composed interval atlas',
    })
    registerDebugTexture('hrc.finalIrradiance', this._finalRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'HRC final irradiance',
    })
    registerDebugTexture('hrc.rawFinalIrradiance', this._rawFinalRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'HRC raw final irradiance',
    })
    registerDebugTexture('hrc.wideIrradiance', this._wideRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'HRC wide filtered irradiance 1/2',
    })
    registerDebugTexture('hrc.wideIrradiance2', this._wideRadianceRT2, 'rgba16f', {
      display: 'colors',
      label: 'HRC wide filtered irradiance 1/4',
    })
  }

  get config(): HierarchicalRadianceCascadesConfig {
    return this._config
  }

  get shortIntervalAtlasTexture(): Texture {
    return this._shortIntervalAtlasRT.texture
  }

  get composedIntervalTexture(): Texture | null {
    return this._lastComposedTexture
  }

  get finalRadianceTexture(): Texture {
    return this._finalRadianceRT.texture
  }

  get finalRadianceReadoutMode(): 'interval-atlas' | 'holographic-r0' {
    return this._usesHolographicFinalReadout() ? 'holographic-r0' : 'interval-atlas'
  }

  get shortIntervalAtlasSize(): number {
    return this._shortIntervalAtlasRT.width
  }

  get shortIntervalGridSize(): number {
    return Math.ceil(Math.sqrt(this._config.shortIntervalCount))
  }

  get effectiveBaseInterval(): number {
    return this._effectiveBaseInterval
  }

  get holographicLevelCount(): number {
    return this._holographicLevelCount()
  }

  get holographicLevelInfo(): HolographicRadianceCascadesLevelInfo[] {
    return this._holographicLevelInfo()
  }

  get estimatedHolographicTransferValueCount(): number {
    return this._holographicLevelInfo().reduce((sum, level) => sum + level.transferValueCount, 0) * 8
  }

  get estimatedHolographicRadianceValueCount(): number {
    return this._holographicLevelInfo().reduce((sum, level) => sum + level.radianceValueCount, 0) * 8
  }

  get holographicTransferAtlasTextures(): Texture[] {
    return this._holographicTransferRTs.map((target) => target.texture)
  }

  get holographicRadianceAtlasTextures(): Texture[] {
    return this._holographicRadianceRTs.map((target) => target.texture)
  }

  get shortIntervalCount(): number {
    return this._config.shortIntervalCount
  }

  set shortIntervalCount(value: number) {
    const count = Math.max(1, Math.min(64, Math.round(value)))
    if (count === this._config.shortIntervalCount) return
    const oldAtlasResolution = this._shortIntervalAtlasResolution()
    this._config.shortIntervalCount = count
    this._updateBaseInterval()
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeCompositionMaterials()
    const atlasResolution = this._shortIntervalAtlasResolution()
    if (this._shortIntervalAtlasRT && atlasResolution !== oldAtlasResolution) {
      this._shortIntervalAtlasRT.setSize(atlasResolution, atlasResolution)
      this._compositionRTs?.[0]?.setSize(atlasResolution, atlasResolution)
      this._compositionRTs?.[1]?.setSize(atlasResolution, atlasResolution)
    }
  }

  get compositionLevels(): number {
    return this._config.compositionLevels
  }

  set compositionLevels(value: number) {
    this._config.compositionLevels = Math.max(1, Math.min(8, Math.round(value)))
  }

  get compositionMode(): HierarchicalRadianceCascadesMode {
    return this._config.compositionMode
  }

  set compositionMode(value: HierarchicalRadianceCascadesMode) {
    const mode = value === 'holographic' ? 'holographic' : 'hierarchical'
    if (mode === this._config.compositionMode) return
    this._config.compositionMode = mode
    if (mode === 'holographic') {
      const final = this._holographicFinalRadianceDimensions()
      this._rebuildHolographicRenderTargets()
      this._rawFinalRadianceRT.setSize(final.width, final.height)
      this._finalRadianceRT.setSize(final.width, final.height)
      this._finalTexelSizeNode.value.set(1 / final.width, 1 / final.height)
      this._resizeWideRadianceTargets()
    } else {
      const finalResolution = this._finalRadianceResolution()
      this._rawFinalRadianceRT.setSize(finalResolution, finalResolution)
      this._finalRadianceRT.setSize(finalResolution, finalResolution)
      this._finalTexelSizeNode.value.set(1 / finalResolution, 1 / finalResolution)
      this._resizeWideRadianceTargets()
    }
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  get holographicFinalResolutionScale(): number {
    return this._config.holographicFinalResolutionScale
  }

  set holographicFinalResolutionScale(value: number) {
    const scale = Math.max(1, Math.min(4, Math.round(value)))
    if (scale === this._config.holographicFinalResolutionScale) return
    this._config.holographicFinalResolutionScale = scale
    if (this._config.compositionMode !== 'holographic') return

    const final = this._holographicFinalRadianceDimensions()
    this._rebuildHolographicRenderTargets()
    this._rawFinalRadianceRT.setSize(final.width, final.height)
    this._finalRadianceRT.setSize(final.width, final.height)
    this._finalTexelSizeNode.value.set(1 / final.width, 1 / final.height)
    this._resizeWideRadianceTargets()
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  get raymarchSteps(): number {
    return this._config.raymarchSteps
  }

  set raymarchSteps(value: number) {
    const steps = Math.max(8, Math.min(96, Math.round(value)))
    if (steps === this._config.raymarchSteps) return
    this._config.raymarchSteps = steps
    this._referenceHierarchy.raymarchSteps = steps
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
  }

  get blueNoiseStrength(): number {
    return this._config.blueNoiseStrength
  }

  set blueNoiseStrength(value: number) {
    const strength = Math.max(0, Math.min(1, value))
    this._config.blueNoiseStrength = strength
    this._referenceHierarchy.blueNoiseStrength = strength
    this._blueNoiseStrengthNode.value = strength
  }

  get intervalOverlap(): number {
    return this._config.intervalOverlap
  }

  set intervalOverlap(value: number) {
    const overlap = Math.max(0, Math.min(0.5, value))
    this._config.intervalOverlap = overlap
    this._referenceHierarchy.intervalOverlap = overlap
  }

  get sceneRadianceDownsampleFactor(): number {
    return this._config.sceneRadianceDownsampleFactor
  }

  set sceneRadianceDownsampleFactor(value: number) {
    const factor = Math.max(1, Math.min(4, Math.round(value)))
    if (factor === this._config.sceneRadianceDownsampleFactor) return
    this._config.sceneRadianceDownsampleFactor = factor
    this._referenceHierarchy.sceneRadianceDownsampleFactor = factor
    if (this._sceneRadianceRT) {
      this._resizeSceneRadianceTarget()
      this._shortIntervalMaterial?.dispose()
      this._shortIntervalMaterial = null
      this._disposeHolographicDirectTransferMaterials()
      this._disposeHolographicRecursiveTransferMaterials()
      this._disposeHolographicRadianceMaterials()
    }
  }

  get filterRadius(): number {
    return this._config.filterRadius
  }

  set filterRadius(value: number) {
    const wasLocalEnabled = this._usesLocalFilter()
    const radius = Math.max(0, value)
    this._config.filterRadius = radius
    this._referenceHierarchy.filterRadius = radius
    this._filterRadiusNode.value = radius
    if (wasLocalEnabled !== this._usesLocalFilter()) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get filterStrength(): number {
    return this._config.filterStrength
  }

  set filterStrength(value: number) {
    const wasLocalEnabled = this._usesLocalFilter()
    const strength = Math.max(0, Math.min(1, value))
    this._config.filterStrength = strength
    this._referenceHierarchy.filterStrength = strength
    this._filterStrengthNode.value = strength
    if (wasLocalEnabled !== this._usesLocalFilter()) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get filterDiagonals(): boolean {
    return this._config.filterDiagonals
  }

  set filterDiagonals(value: boolean) {
    const enabled = Boolean(value)
    if (enabled === this._config.filterDiagonals) return
    this._config.filterDiagonals = enabled
    this._referenceHierarchy.filterDiagonals = enabled
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
  }

  get filterJitterStrength(): number {
    return this._config.filterJitterStrength
  }

  set filterJitterStrength(value: number) {
    const wasEnabled = this._config.filterJitterStrength > 0
    const strength = Math.max(0, Math.min(1, value))
    this._config.filterJitterStrength = strength
    this._referenceHierarchy.filterJitterStrength = strength
    this._filterJitterStrengthNode.value = strength
    if (wasEnabled !== strength > 0) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get mipBlur(): number {
    return this._config.mipBlur
  }

  set mipBlur(value: number) {
    const wasBlurEnabled = this._usesWideBlur()
    const wasSecondLevelEnabled = this._usesSecondWideLevel()
    const blur = Math.max(0, Math.min(1, value))
    this._config.mipBlur = blur
    this._referenceHierarchy.mipBlur = blur
    this._mipBlurNode.value = blur
    if (wasBlurEnabled !== this._usesWideBlur()) {
      this._disposeWideRadianceMaterials()
    }
    if (wasSecondLevelEnabled !== this._usesSecondWideLevel()) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get mipStrength(): number {
    return this._config.mipStrength
  }

  set mipStrength(value: number) {
    const wasEnabled = this._usesMipFilter()
    const strength = Math.max(0, Math.min(1, value))
    this._config.mipStrength = strength
    this._referenceHierarchy.mipStrength = strength
    this._mipStrengthNode.value = strength
    if (wasEnabled !== this._usesMipFilter()) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get wideDownsampleFactor(): number {
    return this._config.wideDownsampleFactor
  }

  set wideDownsampleFactor(value: number) {
    const factor = Math.max(2, Math.min(4, Math.round(value)))
    if (factor === this._config.wideDownsampleFactor) return
    this._config.wideDownsampleFactor = factor
    this._referenceHierarchy.wideDownsampleFactor = factor
    this._resizeWideRadianceTargets()
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
  }

  get wideLevels(): number {
    return this._config.wideLevels
  }

  set wideLevels(value: number) {
    const wasSecondLevelEnabled = this._usesSecondWideLevel()
    this._config.wideLevels = Math.max(1, Math.min(2, Math.round(value)))
    this._referenceHierarchy.wideLevels = this._config.wideLevels
    if (wasSecondLevelEnabled !== this._usesSecondWideLevel()) {
      this._disposeWideRadianceMaterials()
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  private _usesMipFilter(): boolean {
    return this._config.mipStrength > 0
  }

  get wideFilterEnabled(): boolean {
    return this._referenceHierarchy.wideFilterEnabled
  }

  private _usesWideBlur(): boolean {
    return this._usesMipFilter() && this._config.mipBlur > 0
  }

  get wideBlurEnabled(): boolean {
    return this._referenceHierarchy.wideBlurEnabled
  }

  get estimatedCompositionPassCount(): number {
    return Math.max(
      0,
      Math.min(this._config.compositionLevels, Math.ceil(Math.log2(this._config.shortIntervalCount)))
    )
  }

  get estimatedHolographicDirectTransferPassCount(): number {
    return this._config.compositionMode === 'holographic'
      ? Math.min(3, this._holographicTransferRTs.length)
      : 0
  }

  get estimatedHolographicRecursiveTransferPassCount(): number {
    return this._config.compositionMode === 'holographic'
      ? Math.max(0, this._holographicTransferRTs.length - 3)
      : 0
  }

  get estimatedHolographicRadiancePassCount(): number {
    return this._config.compositionMode === 'holographic' ? this._holographicRadianceRTs.length : 0
  }

  get estimatedPassCount(): number {
    let count =
      1 +
      this.estimatedHolographicDirectTransferPassCount +
      this.estimatedHolographicRecursiveTransferPassCount +
      this.estimatedHolographicRadiancePassCount +
      1
    if (this._config.compositionMode !== 'holographic') {
      count += 1 + this.estimatedCompositionPassCount
    }
    if (this._usesFilteredOutput()) {
      if (this._usesMipFilter()) {
        count += 1
        if (this._usesWideBlur()) count += 2
        if (this._usesSecondWideLevel()) count += 3
      }
      count += 1
    }
    return count
  }

  get estimatedRaymarchTexelCount(): number {
    if (this._config.compositionMode === 'holographic') return 0
    const resolution = this._config.cascadeResolution
    if (resolution <= 0) return 0
    return resolution * resolution * this._config.shortIntervalCount
  }

  get estimatedPhysicalRaymarchTexelCount(): number {
    if (this._config.compositionMode === 'holographic') return 0
    return this._shortIntervalAtlasRT.width * this._shortIntervalAtlasRT.height
  }

  get estimatedUnusedRaymarchTexelCount(): number {
    return Math.max(0, this.estimatedPhysicalRaymarchTexelCount - this.estimatedRaymarchTexelCount)
  }

  get estimatedRaymarchSampleCount(): number {
    return (
      this.estimatedRaymarchTexelCount * this._config.raymarchSteps +
      this.estimatedHolographicDirectTransferSampleCount
    )
  }

  get estimatedHolographicDirectTransferTexelCount(): number {
    if (this._config.compositionMode !== 'holographic') return 0
    return this._holographicLevelInfo()
      .slice(0, 3)
      .reduce((sum, level) => sum + level.transferValueCount * 8, 0)
  }

  get estimatedHolographicDirectTransferSampleCount(): number {
    return (
      this.estimatedHolographicDirectTransferTexelCount *
      this._holographicDirectTransferStepCount()
    )
  }

  get estimatedHolographicRecursiveTransferTexelCount(): number {
    if (this._config.compositionMode !== 'holographic') return 0
    return this._holographicLevelInfo()
      .slice(3)
      .reduce((sum, level) => sum + level.transferValueCount * 8, 0)
  }

  get estimatedHolographicRadianceTexelCount(): number {
    if (this._config.compositionMode !== 'holographic') return 0
    return this.estimatedHolographicRadianceValueCount
  }

  private _usesLocalFilter(): boolean {
    return this._config.filterRadius > 0 && this._config.filterStrength > 0
  }

  private _usesFilteredOutput(): boolean {
    return this._usesLocalFilter() || this._usesMipFilter()
  }

  private _usesSecondWideLevel(): boolean {
    return this._usesWideBlur() && this._config.wideLevels > 1
  }

  init(
    worldWidth: number,
    worldHeight: number,
    lightsTexture?: DataTexture,
    lightCountNode?: Node<'float'>
  ): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    if (lightsTexture) this._lightsTexture = lightsTexture
    if (lightCountNode) this._lightCountNode = lightCountNode

    const baseAngular = Math.sqrt(this._config.baseRayCount)
    if (this._autoCascadeResolution) {
      const maxDim = Math.max(worldWidth, worldHeight)
      const targetProbes = maxDim / 1.5
      const targetRes = targetProbes * baseAngular
      const autoRes = Math.pow(2, Math.ceil(Math.log2(targetRes)))
      this._config.cascadeResolution =
        this._config.maxAutoCascadeResolution > 0
          ? Math.min(autoRes, this._config.maxAutoCascadeResolution)
          : autoRes
    }

    this._syncReferenceHierarchyConfig()
    if (this._lightsTexture && this._lightCountNode) {
      this._referenceHierarchy.init(
        worldWidth,
        worldHeight,
        this._lightsTexture,
        this._lightCountNode
      )
    }

    this._updateBaseInterval()
    const atlasResolution = this._shortIntervalAtlasResolution()
    this._shortIntervalAtlasRT.setSize(atlasResolution, atlasResolution)
    this._compositionRTs[0].setSize(atlasResolution, atlasResolution)
    this._compositionRTs[1].setSize(atlasResolution, atlasResolution)
    const finalResolution = this._finalRadianceResolution()
    const holographicFinal = this._holographicFinalRadianceDimensions()
    this._rebuildHolographicRenderTargets()
    const finalWidth = this._config.compositionMode === 'holographic' ? holographicFinal.width : finalResolution
    const finalHeight = this._config.compositionMode === 'holographic' ? holographicFinal.height : finalResolution
    this._rawFinalRadianceRT.setSize(finalWidth, finalHeight)
    this._finalRadianceRT.setSize(finalWidth, finalHeight)
    this._finalTexelSizeNode.value.set(1 / finalWidth, 1 / finalHeight)
    this._resizeWideRadianceTargets()
    this._resizeSceneRadianceTarget()
    this._disposeMaterials()
  }

  resize(worldWidth: number, worldHeight: number): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._referenceHierarchy.resize(worldWidth, worldHeight)
    this._updateBaseInterval()
    if (this._config.compositionMode === 'holographic') {
      const final = this._holographicFinalRadianceDimensions()
      this._rebuildHolographicRenderTargets()
      this._rawFinalRadianceRT.setSize(final.width, final.height)
      this._finalRadianceRT.setSize(final.width, final.height)
      this._finalTexelSizeNode.value.set(1 / final.width, 1 / final.height)
      this._resizeWideRadianceTargets()
      this._finalRadianceMaterial?.dispose()
      this._finalRadianceMaterial = null
      this._finalRadianceSourceTexture = null
    }
  }

  setWorldBounds(worldSize: Vector2, worldOffset: Vector2): void {
    this._worldSize.copy(worldSize)
    this._worldOffset.copy(worldOffset)
    this._worldSizeNode.value.copy(worldSize)
    this._worldOffsetNode.value.copy(worldOffset)
    this._referenceHierarchy.setWorldBounds(worldSize, worldOffset)
    this._updateBaseInterval()
    if (this._config.compositionMode === 'holographic') {
      const final = this._holographicFinalRadianceDimensions()
      if (this._rawFinalRadianceRT.width !== final.width || this._rawFinalRadianceRT.height !== final.height) {
        this._rebuildHolographicRenderTargets()
        this._rawFinalRadianceRT.setSize(final.width, final.height)
        this._finalRadianceRT.setSize(final.width, final.height)
        this._finalTexelSizeNode.value.set(1 / final.width, 1 / final.height)
        this._resizeWideRadianceTargets()
        this._finalRadianceMaterial?.dispose()
        this._finalRadianceMaterial = null
        this._finalRadianceSourceTexture = null
      }
    }
  }

  setSdfTexture(texture: Texture): void {
    if (this._sdfTexture === texture) return
    this._sdfTexture = texture
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeCompositionMaterials()
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
  }

  generate(renderer: WebGPURenderer, sdfTexture: Texture): void {
    this.setSdfTexture(sdfTexture)
    if (!this._sceneRadianceRT) this._resizeSceneRadianceTarget()

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState)
    try {
      this._renderSceneRadiance(renderer)
      if (this._config.compositionMode === 'holographic') {
        this._renderHolographicDirectTransfers(renderer)
        this._renderHolographicRecursiveTransfers(renderer)
        this._renderHolographicRadiance(renderer)
      } else {
        this._renderShortIntervals(renderer)
        this._renderComposition(renderer)
      }
      const usesFilteredOutput = this._usesFilteredOutput()
      this._renderFinalRadiance(
        renderer,
        usesFilteredOutput ? this._rawFinalRadianceRT : this._finalRadianceRT
      )
      if (usesFilteredOutput) {
        if (this._usesMipFilter()) {
          this._renderWideRadiance(renderer)
        }
        this._renderFilteredRadiance(renderer)
      }
    } finally {
      RendererUtils.restoreRendererState(renderer, _rendererState)
    }
  }

  dispose(): void {
    unregisterDebugTexture('hrc.shortIntervals')
    unregisterDebugTexture('hrc.composedIntervals')
    unregisterDebugTexture('hrc.finalIrradiance')
    unregisterDebugTexture('hrc.rawFinalIrradiance')
    unregisterDebugTexture('hrc.wideIrradiance')
    unregisterDebugTexture('hrc.wideIrradiance2')
    unregisterDebugTexture('hrc.sceneRadiance')
    this._shortIntervalAtlasRT.dispose()
    this._compositionRTs[0].dispose()
    this._compositionRTs[1].dispose()
    this._disposeHolographicRenderTargets()
    this._sceneRadianceRT?.dispose()
    this._rawFinalRadianceRT.dispose()
    this._wideRadianceRT.dispose()
    this._wideBlurRT.dispose()
    this._wideRadianceRT2.dispose()
    this._wideBlurRT2.dispose()
    this._finalRadianceRT.dispose()
    this._referenceHierarchy.dispose()
    this._disposeMaterials()
  }

  private _syncReferenceHierarchyConfig(): void {
    const referenceConfig = this._referenceHierarchy.config
    referenceConfig.cascadeCount = this._config.cascadeCount
    referenceConfig.baseRayCount = this._config.baseRayCount
    referenceConfig.baseInterval = this._config.baseInterval
    referenceConfig.cascadeResolution = this._config.cascadeResolution
    referenceConfig.sceneRadianceDownsampleFactor = this._config.sceneRadianceDownsampleFactor
    referenceConfig.maxAutoCascadeResolution = this._config.maxAutoCascadeResolution
    referenceConfig.angularJitter = this._config.angularJitter
    referenceConfig.raymarchSteps = this._config.raymarchSteps
    referenceConfig.blueNoiseStrength = this._config.blueNoiseStrength
    referenceConfig.intervalOverlap = this._config.intervalOverlap
    referenceConfig.filterRadius = this._config.filterRadius
    referenceConfig.filterStrength = this._config.filterStrength
    referenceConfig.filterDiagonals = this._config.filterDiagonals
    referenceConfig.filterJitterStrength = this._config.filterJitterStrength
    referenceConfig.mipBlur = this._config.mipBlur
    referenceConfig.mipStrength = this._config.mipStrength
    referenceConfig.wideDownsampleFactor = this._config.wideDownsampleFactor
    referenceConfig.wideLevels = this._config.wideLevels
  }

  private _shortIntervalAtlasResolution(resolution = this._config.cascadeResolution): number {
    const baseResolution = resolution > 0 ? resolution : 128
    return baseResolution * this.shortIntervalGridSize
  }

  private _finalRadianceResolution(resolution = this._config.cascadeResolution): number {
    const baseResolution = resolution > 0 ? resolution : 128
    const baseAngular = Math.sqrt(this._config.baseRayCount)
    return Math.max(1, Math.ceil(baseResolution / baseAngular))
  }

  private _holographicFinalRadianceDimensions(resolution = this._config.cascadeResolution): {
    width: number
    height: number
  } {
    const scale = Math.max(1, Math.min(4, Math.round(this._config.holographicFinalResolutionScale)))
    const baseResolution = resolution > 0 ? resolution : 128
    const maxResolution = Math.min(baseResolution, this._finalRadianceResolution(resolution) * scale)
    return {
      width: maxResolution,
      height: maxResolution,
    }
  }

  private _holographicLevelCount(): number {
    const output = this._holographicFinalRadianceDimensions()
    return Math.max(1, Math.ceil(Math.log2(Math.max(1, output.width, output.height))))
  }

  private _holographicLevelInfo(): HolographicRadianceCascadesLevelInfo[] {
    return this._holographicLevelInfoForResolution(this._config.cascadeResolution)
  }

  private _rebuildHolographicRenderTargets(resolution = this._config.cascadeResolution): void {
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
    this._disposeHolographicRenderTargets()
    const levels = this._holographicLevelInfoForResolution(resolution)
    this._holographicTransferRTs = levels.map((level) =>
      this._createRenderTarget(level.transferAtlasWidth, level.transferAtlasHeight)
    )
    this._holographicRadianceRTs = levels
      .filter((level) => level.radianceValueCount > 0)
      .map((level) => this._createRenderTarget(level.radianceAtlasWidth, level.radianceAtlasHeight))
  }

  private _disposeHolographicRenderTargets(): void {
    for (const target of this._holographicTransferRTs) target.dispose()
    for (const target of this._holographicRadianceRTs) target.dispose()
    this._holographicTransferRTs = []
    this._holographicRadianceRTs = []
  }

  private _holographicLevelInfoForResolution(
    resolution: number
  ): HolographicRadianceCascadesLevelInfo[] {
    const baseResolution = resolution > 0 ? resolution : 128
    const baseAngular = Math.sqrt(this._config.baseRayCount)
    const output = this._holographicFinalRadianceDimensions(resolution)
    const outputMaxDimension = Math.max(output.width, output.height)
    const segmentCount = 8
    const baseGridSize = Math.max(1, Math.ceil(outputMaxDimension / 2))
    const terminalLevel = Math.max(1, Math.ceil(Math.log2(Math.max(1, baseGridSize))))
    const levels: HolographicRadianceCascadesLevelInfo[] = []
    for (let level = 0; level <= terminalLevel; level++) {
      const stride = 2 ** level
      const directionCount = stride * 2
      const probeWidth = Math.ceil(baseGridSize / stride)
      const probeHeight = baseGridSize
      const transferDirectionCount = directionCount + 1
      const radianceDirectionCount = level < terminalLevel ? directionCount : 0
      const transferAtlasWidth = probeWidth * transferDirectionCount
      const transferAtlasHeight = probeHeight * segmentCount
      const radianceAtlasWidth = probeWidth * radianceDirectionCount
      const radianceAtlasHeight = radianceDirectionCount > 0 ? probeHeight * segmentCount : 0
      levels.push({
        level,
        outputWidth: output.width,
        outputHeight: output.height,
        outputMaxDimension,
        segmentCount,
        probeWidth,
        probeHeight,
        transferDirectionCount,
        radianceDirectionCount,
        transferValueCount: probeWidth * probeHeight * transferDirectionCount,
        radianceValueCount: probeWidth * probeHeight * radianceDirectionCount,
        transferAtlasWidth,
        transferAtlasHeight,
        radianceAtlasWidth,
        radianceAtlasHeight,
      })
    }
    return levels
  }

  private _holographicDirectTransferStepCount(): number {
    return Math.max(4, Math.min(16, Math.ceil(this._config.raymarchSteps / 4)))
  }

  private _sceneRadianceResolution(): number {
    return Math.max(
      1,
      Math.ceil(this._config.cascadeResolution / this._config.sceneRadianceDownsampleFactor)
    )
  }

  private _createRenderTarget(width: number, height: number): RenderTarget {
    return new RenderTarget(width, height, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    })
  }

  private _resizeSceneRadianceTarget(): void {
    if (!this._sceneRadianceRT) {
      this._sceneRadianceRT = this._createRenderTarget(
        this._sceneRadianceResolution(),
        this._sceneRadianceResolution()
      )
      registerDebugTexture('hrc.sceneRadiance', this._sceneRadianceRT, 'rgba16f', {
        display: 'colors',
        label: 'HRC scene radiance',
      })
      return
    }
    const res = this._sceneRadianceResolution()
    this._sceneRadianceRT.setSize(res, res)
  }

  private _resizeWideRadianceTargets(): void {
    const factor = this._config.wideDownsampleFactor
    const wideWidth = Math.max(1, Math.ceil(this._rawFinalRadianceRT.width / factor))
    const wideHeight = Math.max(1, Math.ceil(this._rawFinalRadianceRT.height / factor))
    const wideWidth2 = Math.max(1, Math.ceil(wideWidth / factor))
    const wideHeight2 = Math.max(1, Math.ceil(wideHeight / factor))
    this._wideRadianceRT.setSize(wideWidth, wideHeight)
    this._wideBlurRT.setSize(wideWidth, wideHeight)
    this._wideRadianceRT2.setSize(wideWidth2, wideHeight2)
    this._wideBlurRT2.setSize(wideWidth2, wideHeight2)
    this._wideTexelSizeNode.value.set(1 / wideWidth, 1 / wideHeight)
    this._wideTexelSizeNode2.value.set(1 / wideWidth2, 1 / wideHeight2)
  }

  private _disposeWideRadianceMaterials(): void {
    this._wideDownsampleMaterial?.dispose()
    this._wideDownsampleMaterial = null
    this._wideDownsampleMaterial2?.dispose()
    this._wideDownsampleMaterial2 = null
    this._wideBlurHMaterial?.dispose()
    this._wideBlurHMaterial = null
    this._wideBlurVMaterial?.dispose()
    this._wideBlurVMaterial = null
    this._wideBlurHMaterial2?.dispose()
    this._wideBlurHMaterial2 = null
    this._wideBlurVMaterial2?.dispose()
    this._wideBlurVMaterial2 = null
  }

  private _updateBaseInterval(): void {
    if (this._autoBaseInterval) {
      const diagonal = Math.hypot(this._worldSize.x, this._worldSize.y)
      this._effectiveBaseInterval = diagonal / Math.max(1, this._config.shortIntervalCount)
    } else {
      this._effectiveBaseInterval = this._config.baseInterval
    }
    this._shortIntervalLengthNode.value = this._effectiveBaseInterval
  }

  private _renderSceneRadiance(renderer: WebGPURenderer): void {
    if (!this._sceneRadianceRT || !this._lightsTexture || !this._lightCountNode) return
    this._ensureSceneRadianceMaterial()
    if (!this._sceneRadianceMaterial) return

    beginDebugPass('hrc.scene', renderer)
    _quadMesh.material = this._sceneRadianceMaterial
    renderer.setRenderTarget(this._sceneRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  private _ensureSceneRadianceMaterial(): void {
    if (this._sceneRadianceMaterial) return
    if (!this._lightsTexture || !this._lightCountNode) return

    const lightsTexture = this._lightsTexture
    const lightCount = this._lightCountNode
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode

    this._sceneRadianceMaterial = new NodeMaterial()
    this._sceneRadianceMaterial.fragmentNode = Fn(() => {
      const fragUV = uv()
      const worldPos = uvToWorld(fragUV, worldSize, worldOffset)
      const totalRadiance = vec3(0, 0, 0).toVar()

      Loop(
        { start: 0, end: lightCount, type: 'float', condition: '<' },
        ({ i }: { i: Node<'float'> }) => {
          const row0 = textureLoad(lightsTexture, ivec2(int(i), int(0)))
          const row1 = textureLoad(lightsTexture, ivec2(int(i), int(1)))
          const row2 = textureLoad(lightsTexture, ivec2(int(i), int(2)))
          const row3 = textureLoad(lightsTexture, ivec2(int(i), int(3)))

          const lightPos = vec2(row0.r, row0.g)
          const lightColor = vec3(row0.b, row0.a, row1.r)
          const lightIntensity = row1.g
          const lightDistance = row1.b
          const lightDecay = row1.a
          const lightDir = vec2(row2.r, row2.g)
          const lightAngle = row2.b
          const lightPenumbra = row2.a
          const lightType = row3.r
          const lightEnabled = row3.g

          If(lightEnabled.greaterThan(float(0.5)), () => {
            const isAmbient = lightType.greaterThan(float(2.5))
            If(isAmbient, () => {
              totalRadiance.addAssign(lightColor.mul(lightIntensity))
            })

            const isPositional = lightType.lessThan(float(1.5))
            If(isPositional, () => {
              const toLight = lightPos.sub(worldPos)
              const dist = toLight.length()
              const lightRadius = lightDistance.max(float(1))

              If(dist.lessThan(lightRadius), () => {
                const normDist = dist.div(lightRadius).clamp(0, 1)
                const falloff = float(1).sub(normDist.pow(lightDecay)).clamp(0, 1)
                const attenuation = falloff.toVar()
                const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5)))

                If(isSpot, () => {
                  const toSurfaceNorm = worldPos.sub(lightPos).normalize()
                  const spotCos = toSurfaceNorm.dot(lightDir)
                  const innerCos = lightAngle.cos()
                  const outerCos = lightAngle.add(lightPenumbra).cos()
                  const cone = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)
                  attenuation.mulAssign(cone)
                })

                totalRadiance.addAssign(lightColor.mul(lightIntensity).mul(attenuation))
              })
            })
          })
        }
      )

      return vec4(totalRadiance, float(1))
    })() as Node<'vec4'>
  }

  private _renderHolographicDirectTransfers(renderer: WebGPURenderer): void {
    if (!this._sdfTexture || !this._sceneRadianceRT) return

    const maxDirectLevel = Math.min(2, this._holographicTransferRTs.length - 1)
    for (let level = 0; level <= maxDirectLevel; level++) {
      const material = this._ensureHolographicDirectTransferMaterial(level)
      if (!material) continue

      beginDebugPass(`hrc.holographicT${level}`, renderer)
      _quadMesh.material = material
      renderer.setRenderTarget(this._holographicTransferRTs[level]!)
      _quadMesh.render(renderer)
      endDebugPass(renderer)
    }
  }

  private _ensureHolographicDirectTransferMaterial(level: number): NodeMaterial | null {
    const existing = this._holographicDirectTransferMaterials.get(level)
    if (existing) return existing
    if (!this._sdfTexture || !this._sceneRadianceRT) return null

    const levelInfo = this._holographicLevelInfo()[level]
    if (!levelInfo) return null

    const sdfTexture = this._sdfTexture
    const sceneRadianceTexture = this._sceneRadianceRT.texture
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode
    const output = this._holographicFinalRadianceDimensions()
    const outputWidth = output.width
    const outputHeight = output.height
    const stride = 2 ** level
    const probeWidth = levelInfo.probeWidth
    const probeHeight = levelInfo.probeHeight
    const transferAtlasWidth = levelInfo.transferAtlasWidth
    const transferAtlasHeight = levelInfo.transferAtlasHeight
    const raymarchSteps = this._holographicDirectTransferStepCount()

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const atlasCoord = uv().mul(vec2(float(transferAtlasWidth), float(transferAtlasHeight)))
      const segmentIndex = floor(atlasCoord.y.div(float(probeHeight)))
      const rotation = floor(segmentIndex.div(float(2)))
      const segmentPhase = mod(segmentIndex, float(2))
      const localY = mod(atlasCoord.y, float(probeHeight))
      const directionIndex = floor(atlasCoord.x.div(float(probeWidth)))
      const probeX = mod(atlasCoord.x, float(probeWidth))
      const parallel = probeX.mul(float(stride))
      const perpendicular = localY
      const lateralOffset = directionIndex.sub(float(stride))
      const fullParallel = parallel.mul(float(2))
      const fullPerpendicular = perpendicular.mul(float(2)).add(segmentPhase)
      const fullLateralOffset = lateralOffset.mul(float(2))
      const fullStride = float(stride * 2)
      const validGrid = fullParallel
        .lessThan(float(outputWidth))
        .and(fullPerpendicular.lessThan(float(outputHeight)))
        .toVar()

      const startGrid = vec2(fullParallel, fullPerpendicular).toVar()
      const offsetGrid = vec2(fullStride, fullLateralOffset).toVar()

      If(rotation.greaterThan(float(0.5)).and(rotation.lessThan(float(1.5))), () => {
        validGrid.assign(fullParallel.lessThan(float(outputHeight)).and(fullPerpendicular.lessThan(float(outputWidth))))
        startGrid.assign(vec2(float(outputWidth).sub(fullPerpendicular), fullParallel))
        offsetGrid.assign(vec2(fullLateralOffset.mul(float(-1)), fullStride))
      })

      If(rotation.greaterThan(float(1.5)).and(rotation.lessThan(float(2.5))), () => {
        validGrid.assign(fullParallel.lessThan(float(outputWidth)).and(fullPerpendicular.lessThan(float(outputHeight))))
        startGrid.assign(vec2(float(outputWidth).sub(fullParallel), fullPerpendicular))
        offsetGrid.assign(vec2(fullStride.mul(float(-1)), fullLateralOffset.mul(float(-1))))
      })

      If(rotation.greaterThan(float(2.5)), () => {
        validGrid.assign(fullParallel.lessThan(float(outputHeight)).and(fullPerpendicular.lessThan(float(outputWidth))))
        startGrid.assign(vec2(fullPerpendicular, float(outputHeight).sub(fullParallel)))
        offsetGrid.assign(vec2(fullLateralOffset, fullStride.mul(float(-1))))
      })

      const outputSize = vec2(float(outputWidth), float(outputHeight))
      const startUV = startGrid.div(outputSize)
      const endUV = startGrid.add(offsetGrid).div(outputSize)
      const startWorld = uvToWorld(startUV, worldSize, worldOffset)
      const endWorld = uvToWorld(endUV, worldSize, worldOffset)
      const segment = endWorld.sub(startWorld)
      const segmentLength = segment.length().max(float(0.001))
      const rayDir = segment.div(segmentLength)
      const minStep = segmentLength.div(float(raymarchSteps)).max(float(0.001))
      const radiance = vec3(0).toVar()
      const transmittance = float(1).toVar()
      const t = float(0).toVar()

      Loop(raymarchSteps, () => {
        const sampleWorld = startWorld.add(rayDir.mul(t))
        const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)
        const outOfBounds = sampleUV.x
          .lessThan(0)
          .or(sampleUV.x.greaterThan(1))
          .or(sampleUV.y.lessThan(0))
          .or(sampleUV.y.greaterThan(1))

        If(outOfBounds, () => {
          transmittance.assign(float(0))
          Break()
        })

        const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
        const sdfDist = sampleTexture(sdfTexture, sdfUV).r
        If(sdfDist.lessThan(float(EPS)), () => {
          transmittance.assign(float(0))
          Break()
        })

        const stepLen = min(sdfDist.max(minStep), segmentLength.sub(t))
        const sceneRad = sampleTexture(sceneRadianceTexture, sampleUV)
        radiance.addAssign(sceneRad.rgb.mul(transmittance).mul(stepLen))
        t.addAssign(stepLen)

        If(t.greaterThanEqual(segmentLength), () => {
          Break()
        })
      })

      return vec4(radiance, transmittance).mul(validGrid.select(float(1), float(0)))
    })() as Node<'vec4'>

    this._holographicDirectTransferMaterials.set(level, material)
    return material
  }

  private _renderHolographicRecursiveTransfers(renderer: WebGPURenderer): void {
    for (let level = 3; level < this._holographicTransferRTs.length; level++) {
      const material = this._ensureHolographicRecursiveTransferMaterial(level)
      if (!material) continue

      beginDebugPass(`hrc.holographicT${level}`, renderer)
      _quadMesh.material = material
      renderer.setRenderTarget(this._holographicTransferRTs[level]!)
      _quadMesh.render(renderer)
      endDebugPass(renderer)
    }
  }

  private _ensureHolographicRecursiveTransferMaterial(level: number): NodeMaterial | null {
    const existing = this._holographicRecursiveTransferMaterials.get(level)
    if (existing) return existing

    const levelInfo = this._holographicLevelInfo()[level]
    const previousInfo = this._holographicLevelInfo()[level - 1]
    const previousTarget = this._holographicTransferRTs[level - 1]
    if (!levelInfo || !previousInfo || !previousTarget) return null

    const sourceTexture = previousTarget.texture
    const stride = 2 ** level
    const previousStride = 2 ** (level - 1)
    const probeWidth = levelInfo.probeWidth
    const probeHeight = levelInfo.probeHeight
    const transferAtlasWidth = levelInfo.transferAtlasWidth
    const transferAtlasHeight = levelInfo.transferAtlasHeight
    const previousProbeWidth = previousInfo.probeWidth
    const previousProbeHeight = previousInfo.probeHeight
    const previousAtlasWidth = previousInfo.transferAtlasWidth
    const previousAtlasHeight = previousInfo.transferAtlasHeight

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const atlasCoord = uv().mul(vec2(float(transferAtlasWidth), float(transferAtlasHeight)))
      const segmentIndex = floor(atlasCoord.y.div(float(probeHeight)))
      const rotation = floor(segmentIndex.div(float(2)))
      const localY = mod(atlasCoord.y, float(probeHeight))
      const directionIndex = floor(atlasCoord.x.div(float(probeWidth)))
      const probeX = mod(atlasCoord.x, float(probeWidth))
      const parallel = probeX.mul(float(stride))

      const samplePrevious = (sampleParallel: Node<'float'>, sampleY: Node<'float'>, sampleDirection: Node<'float'>) => {
        const sourceProbeX = floor(sampleParallel.div(float(previousStride)))
        const usesHorizontalPrimary = rotation
          .lessThan(float(0.5))
          .or(rotation.greaterThan(float(1.5)).and(rotation.lessThan(float(2.5))))
        const primaryLimit = usesHorizontalPrimary.select(
          float(Math.ceil(previousInfo.outputWidth / 2)),
          float(Math.ceil(previousInfo.outputHeight / 2))
        )
        const perpendicularLimit = usesHorizontalPrimary.select(
          float(Math.ceil(previousInfo.outputHeight / 2)),
          float(Math.ceil(previousInfo.outputWidth / 2))
        )
        const valid = sourceProbeX
          .greaterThanEqual(float(0))
          .and(sourceProbeX.lessThan(float(previousProbeWidth)))
          .and(sampleParallel.greaterThanEqual(float(0)))
          .and(sampleParallel.lessThan(primaryLimit))
          .and(sampleY.greaterThanEqual(float(0)))
          .and(sampleY.lessThan(float(previousProbeHeight)))
          .and(sampleY.lessThan(perpendicularLimit))
          .and(sampleDirection.greaterThanEqual(float(0)))
          .and(sampleDirection.lessThan(float(previousInfo.transferDirectionCount)))
        const coord = vec2(
          sampleDirection.mul(float(previousProbeWidth)).add(sourceProbeX).add(float(0.5)),
          segmentIndex.mul(float(previousProbeHeight)).add(sampleY).add(float(0.5))
        )
        const sampled = sampleTexture(sourceTexture, coord.div(vec2(float(previousAtlasWidth), float(previousAtlasHeight))))
        return sampled.mul(valid.select(float(1), float(0)))
      }

      const mergeTransfer = (nearTransfer: Node<'vec4'>, farTransfer: Node<'vec4'>) => {
        return vec4(
          nearTransfer.rgb.add(nearTransfer.a.mul(farTransfer.rgb)),
          nearTransfer.a.mul(farTransfer.a)
        )
      }

      const output = vec4(0, 0, 0, 0).toVar()
      const evenDirection = mod(directionIndex, float(2)).lessThan(float(0.5))

      If(evenDirection, () => {
        const sourceDirection = directionIndex.div(float(2))
        const lateral = sourceDirection.mul(float(2)).sub(float(previousStride))
        const nearTransfer = samplePrevious(parallel, localY, sourceDirection)
        const farTransfer = samplePrevious(
          parallel.add(float(previousStride)),
          localY.add(lateral),
          sourceDirection
        )
        output.assign(mergeTransfer(nearTransfer, farTransfer))
      })

      If(evenDirection.not(), () => {
        const lowDirection = directionIndex.sub(float(1)).div(float(2))
        const highDirection = directionIndex.add(float(1)).div(float(2))
        const lowLateral = lowDirection.mul(float(2)).sub(float(previousStride))
        const highLateral = highDirection.mul(float(2)).sub(float(previousStride))
        const lowNear = samplePrevious(parallel, localY, lowDirection)
        const lowFar = samplePrevious(
          parallel.add(float(previousStride)),
          localY.add(lowLateral),
          highDirection
        )
        const highNear = samplePrevious(parallel, localY, highDirection)
        const highFar = samplePrevious(
          parallel.add(float(previousStride)),
          localY.add(highLateral),
          lowDirection
        )
        const lowMerge = mergeTransfer(lowNear, lowFar)
        const highMerge = mergeTransfer(highNear, highFar)
        output.assign(lowMerge.add(highMerge).mul(float(0.5)))
      })

      return output
    })() as Node<'vec4'>

    this._holographicRecursiveTransferMaterials.set(level, material)
    return material
  }

  private _renderHolographicRadiance(renderer: WebGPURenderer): void {
    for (let level = this._holographicRadianceRTs.length - 1; level >= 0; level--) {
      const material = this._ensureHolographicRadianceMaterial(level)
      if (!material) continue

      beginDebugPass(`hrc.holographicR${level}`, renderer)
      _quadMesh.material = material
      renderer.setRenderTarget(this._holographicRadianceRTs[level]!)
      _quadMesh.render(renderer)
      endDebugPass(renderer)
    }
  }

  private _ensureHolographicRadianceMaterial(level: number): NodeMaterial | null {
    const existing = this._holographicRadianceMaterials.get(level)
    if (existing) return existing

    const levelInfo = this._holographicLevelInfo()[level]
    const nextInfo = this._holographicLevelInfo()[level + 1]
    const transferTarget = this._holographicTransferRTs[level]
    const nextTransferTarget = this._holographicTransferRTs[level + 1]
    const nextRadianceTarget = this._holographicRadianceRTs[level + 1]
    if (!levelInfo || !nextInfo || !transferTarget || !nextTransferTarget) return null

    const transferTexture = transferTarget.texture
    const nextTransferTexture = nextTransferTarget.texture
    const nextRadianceTexture = nextRadianceTarget?.texture ?? null
    const stride = 2 ** level
    const nextStride = 2 ** (level + 1)
    const probeWidth = levelInfo.probeWidth
    const probeHeight = levelInfo.probeHeight
    const radianceAtlasWidth = levelInfo.radianceAtlasWidth
    const radianceAtlasHeight = levelInfo.radianceAtlasHeight
    const transferAtlasWidth = levelInfo.transferAtlasWidth
    const transferAtlasHeight = levelInfo.transferAtlasHeight
    const nextTransferAtlasWidth = nextInfo.transferAtlasWidth
    const nextTransferAtlasHeight = nextInfo.transferAtlasHeight
    const nextRadianceAtlasWidth = nextInfo.radianceAtlasWidth
    const nextRadianceAtlasHeight = nextInfo.radianceAtlasHeight

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const atlasCoord = uv().mul(vec2(float(radianceAtlasWidth), float(radianceAtlasHeight)))
      const segmentIndex = floor(atlasCoord.y.div(float(probeHeight)))
      const rotation = floor(segmentIndex.div(float(2)))
      const localY = mod(atlasCoord.y, float(probeHeight))
      const directionIndex = floor(atlasCoord.x.div(float(probeWidth)))
      const probeX = mod(atlasCoord.x, float(probeWidth))
      const parallel = probeX.mul(float(stride))
      const probeParityOdd = mod(probeX, float(2)).greaterThan(float(0.5))

      const coneArc = (childDirection: Node<'float'>) => {
        const angle0 = atan(childDirection.mul(float(2)).sub(float(nextStride)), float(nextStride))
        const angle1 = atan(childDirection.add(float(1)).mul(float(2)).sub(float(nextStride)), float(nextStride))
        return angle1.sub(angle0).max(float(0))
      }

      const sampleTransfer = (
        texture: Texture,
        info: HolographicRadianceCascadesLevelInfo,
        sampleParallel: Node<'float'>,
        sampleY: Node<'float'>,
        sampleDirection: Node<'float'>
      ) => {
        const sampleStride = 2 ** info.level
        const sourceProbeX = floor(sampleParallel.div(float(sampleStride)))
        const usesHorizontalPrimary = rotation
          .lessThan(float(0.5))
          .or(rotation.greaterThan(float(1.5)).and(rotation.lessThan(float(2.5))))
        const primaryLimit = usesHorizontalPrimary.select(
          float(Math.ceil(info.outputWidth / 2)),
          float(Math.ceil(info.outputHeight / 2))
        )
        const perpendicularLimit = usesHorizontalPrimary.select(
          float(Math.ceil(info.outputHeight / 2)),
          float(Math.ceil(info.outputWidth / 2))
        )
        const valid = sourceProbeX
          .greaterThanEqual(float(0))
          .and(sourceProbeX.lessThan(float(info.probeWidth)))
          .and(sampleParallel.greaterThanEqual(float(0)))
          .and(sampleParallel.lessThan(primaryLimit))
          .and(sampleY.greaterThanEqual(float(0)))
          .and(sampleY.lessThan(float(info.probeHeight)))
          .and(sampleY.lessThan(perpendicularLimit))
          .and(sampleDirection.greaterThanEqual(float(0)))
          .and(sampleDirection.lessThan(float(info.transferDirectionCount)))
        const coord = vec2(
          sampleDirection.mul(float(info.probeWidth)).add(sourceProbeX).add(float(0.5)),
          segmentIndex.mul(float(info.probeHeight)).add(sampleY).add(float(0.5))
        )
        const sampled = sampleTexture(texture, coord.div(vec2(float(info.transferAtlasWidth), float(info.transferAtlasHeight))))
        return sampled.mul(valid.select(float(1), float(0)))
      }

      const sampleNextRadiance = (
        sampleParallel: Node<'float'>,
        sampleY: Node<'float'>,
        sampleDirection: Node<'float'>
      ) => {
        if (!nextRadianceTexture || nextInfo.radianceDirectionCount <= 0) {
          return vec4(0, 0, 0, 1)
        }

        const sourceProbeX = floor(sampleParallel.div(float(nextStride)))
        const usesHorizontalPrimary = rotation
          .lessThan(float(0.5))
          .or(rotation.greaterThan(float(1.5)).and(rotation.lessThan(float(2.5))))
        const primaryLimit = usesHorizontalPrimary.select(
          float(Math.ceil(nextInfo.outputWidth / 2)),
          float(Math.ceil(nextInfo.outputHeight / 2))
        )
        const perpendicularLimit = usesHorizontalPrimary.select(
          float(Math.ceil(nextInfo.outputHeight / 2)),
          float(Math.ceil(nextInfo.outputWidth / 2))
        )
        const valid = sourceProbeX
          .greaterThanEqual(float(0))
          .and(sourceProbeX.lessThan(float(nextInfo.probeWidth)))
          .and(sampleParallel.greaterThanEqual(float(0)))
          .and(sampleParallel.lessThan(primaryLimit))
          .and(sampleY.greaterThanEqual(float(0)))
          .and(sampleY.lessThan(float(nextInfo.probeHeight)))
          .and(sampleY.lessThan(perpendicularLimit))
          .and(sampleDirection.greaterThanEqual(float(0)))
          .and(sampleDirection.lessThan(float(nextInfo.radianceDirectionCount)))
        const coord = vec2(
          sampleDirection.mul(float(nextInfo.probeWidth)).add(sourceProbeX).add(float(0.5)),
          segmentIndex.mul(float(nextInfo.probeHeight)).add(sampleY).add(float(0.5))
        )
        const sampled = sampleTexture(nextRadianceTexture, coord.div(vec2(float(nextRadianceAtlasWidth), float(nextRadianceAtlasHeight))))
        return sampled.mul(valid.select(float(1), float(0)))
      }

      const mergeFluence = (arc: Node<'float'>, transfer: Node<'vec4'>, farFluence: Node<'vec4'>) => {
        return vec4(
          transfer.rgb.mul(arc).add(transfer.a.mul(farFluence.rgb)),
          float(1)
        )
      }

      const contributionOdd = (edgeDirection: Node<'float'>, childDirection: Node<'float'>) => {
        const lateral = edgeDirection.mul(float(2)).sub(float(stride))
        const transfer = sampleTransfer(transferTexture, levelInfo, parallel, localY, edgeDirection)
        const farRadiance = sampleNextRadiance(
          parallel.add(float(stride)),
          localY.add(lateral),
          childDirection
        )
        return mergeFluence(coneArc(childDirection), transfer, farRadiance)
      }

      const contributionEven = (edgeDirection: Node<'float'>, childDirection: Node<'float'>) => {
        const directChild = sampleNextRadiance(parallel, localY, childDirection)
        const lateral = edgeDirection.mul(float(2)).sub(float(stride))
        const transfer = sampleTransfer(
          nextTransferTexture,
          nextInfo,
          parallel,
          localY,
          edgeDirection.mul(float(2))
        )
        const tracedChild = sampleNextRadiance(
          parallel.add(float(stride * 2)),
          localY.add(lateral.mul(float(2))),
          childDirection
        )
        const traced = mergeFluence(coneArc(childDirection), transfer, tracedChild)
        return directChild.add(traced).mul(float(0.5))
      }

      const lowEdge = directionIndex
      const highEdge = directionIndex.add(float(1))
      const lowChild = directionIndex.mul(float(2))
      const highChild = lowChild.add(float(1))
      const output = vec4(0, 0, 0, 1).toVar()

      If(probeParityOdd, () => {
        const low = contributionOdd(lowEdge, lowChild)
        const high = contributionOdd(highEdge, highChild)
        output.assign(vec4(low.rgb.add(high.rgb), float(1)))
      })

      If(probeParityOdd.not(), () => {
        const low = contributionEven(lowEdge, lowChild)
        const high = contributionEven(highEdge, highChild)
        output.assign(vec4(low.rgb.add(high.rgb), float(1)))
      })

      return output
    })() as Node<'vec4'>

    this._holographicRadianceMaterials.set(level, material)
    return material
  }

  private _renderShortIntervals(renderer: WebGPURenderer): void {
    this._ensureShortIntervalMaterial()
    if (!this._shortIntervalMaterial) return

    beginDebugPass('hrc.shortIntervals', renderer)
    _quadMesh.material = this._shortIntervalMaterial
    renderer.setRenderTarget(this._shortIntervalAtlasRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  private _ensureShortIntervalMaterial(): void {
    if (this._shortIntervalMaterial) return
    if (!this._sdfTexture || !this._sceneRadianceRT) return

    const config = this._config
    const sdfTexture = this._sdfTexture
    const sceneRadianceTexture = this._sceneRadianceRT.texture
    const blueNoiseTexture = this._blueNoiseTexture
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode
    const intervalLength = this._shortIntervalLengthNode
    const blueNoiseStrength = this._blueNoiseStrengthNode
    const baseAngular = Math.sqrt(config.baseRayCount)
    const angularSq = baseAngular * baseAngular
    const res = config.cascadeResolution
    const probeGroupSize = res / baseAngular
    const atlasRes = this._shortIntervalAtlasResolution()
    const gridSize = this.shortIntervalGridSize
    const raymarchSteps = config.raymarchSteps

    this._shortIntervalMaterial = new NodeMaterial()
    this._shortIntervalMaterial.fragmentNode = Fn(() => {
      const atlasCoord = uv().mul(float(atlasRes))
      const tileXY = floor(atlasCoord.div(float(res)))
      const tileLocal = mod(atlasCoord, float(res))
      const intervalIndex = tileXY.x.add(tileXY.y.mul(float(gridSize)))

      const output = vec4(0, 0, 0, 1).toVar()
      If(intervalIndex.lessThan(float(config.shortIntervalCount)), () => {
        const rayXY = floor(tileLocal.div(float(probeGroupSize)))
        const probeXY = mod(tileLocal, float(probeGroupSize))
        const rayIndex = rayXY.x.add(rayXY.y.mul(float(baseAngular)))
        const probeUV = probeXY.add(float(0.5)).div(float(probeGroupSize))
        const probeWorldPos = uvToWorld(probeUV, worldSize, worldOffset)

        const jitter = config.angularJitter
          ? sampleTexture(blueNoiseTexture, atlasCoord.div(float(32)))
              .r.sub(float(0.5))
              .mul(float(2))
              .mul(blueNoiseStrength)
          : float(0)
        const theta = rayIndex.add(float(0.5).add(jitter)).mul(float(TAU / angularSq))
        const rayDir = vec2(cos(theta), sin(theta))

        const start = intervalIndex.mul(intervalLength)
        const end = start.add(intervalLength)
        const minStep = intervalLength.div(float(raymarchSteps)).max(float(0.001))
        const radiance = vec3(0).toVar()
        const transmittance = float(1).toVar()
        const t = start.toVar()

        Loop(raymarchSteps, () => {
          const sampleWorld = probeWorldPos.add(rayDir.mul(t))
          const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)
          const outOfBounds = sampleUV.x
            .lessThan(0)
            .or(sampleUV.x.greaterThan(1))
            .or(sampleUV.y.lessThan(0))
            .or(sampleUV.y.greaterThan(1))

          If(outOfBounds, () => {
            transmittance.assign(float(0))
            Break()
          })

          const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
          const sdfDist = sampleTexture(sdfTexture, sdfUV).r
          If(sdfDist.lessThan(float(EPS)), () => {
            transmittance.assign(float(0))
            Break()
          })

          const stepLen = min(sdfDist.max(minStep), end.sub(t))
          const sceneRad = sampleTexture(sceneRadianceTexture, sampleUV)
          radiance.addAssign(sceneRad.rgb.mul(transmittance).mul(stepLen))
          t.addAssign(stepLen)

          If(t.greaterThanEqual(end), () => {
            Break()
          })
        })

        output.assign(vec4(radiance, transmittance))
      })

      return output
    })() as Node<'vec4'>
  }

  private _renderComposition(renderer: WebGPURenderer): void {
    let source = this._shortIntervalAtlasRT.texture
    let span = 1
    let targetIndex = 0
    let passes = 0
    const maxPasses = Math.max(
      0,
      Math.min(this._config.compositionLevels, Math.ceil(Math.log2(this._config.shortIntervalCount)))
    )

    while (passes < maxPasses && span < this._config.shortIntervalCount) {
      const target = this._compositionRTs[targetIndex]!
      const material = this._ensureCompositionMaterial(span, source)
      beginDebugPass(`hrc.compose${passes}`, renderer)
      _quadMesh.material = material
      renderer.setRenderTarget(target)
      _quadMesh.render(renderer)
      endDebugPass(renderer)
      source = target.texture
      span *= 2
      targetIndex = 1 - targetIndex
      passes++
    }

    this._lastComposedTexture = source
    this._lastComposedSpan = span
  }

  private _ensureCompositionMaterial(span: number, sourceTexture: Texture): NodeMaterial {
    const cacheKey = span
    const existing = this._compositionMaterials.get(cacheKey)
    if (existing) return existing

    const config = this._config
    const baseAngular = Math.sqrt(config.baseRayCount)
    const res = config.cascadeResolution
    const probeGroupSize = res / baseAngular
    const atlasRes = this._shortIntervalAtlasResolution()
    const gridSize = this.shortIntervalGridSize

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const atlasCoord = uv().mul(float(atlasRes))
      const tileXY = floor(atlasCoord.div(float(res)))
      const tileLocal = mod(atlasCoord, float(res))
      const intervalIndex = tileXY.x.add(tileXY.y.mul(float(gridSize)))
      const output = vec4(0, 0, 0, 1).toVar()

      If(intervalIndex.lessThan(float(config.shortIntervalCount)), () => {
        const a = sampleTexture(sourceTexture, uv())
        output.assign(a)

        const nextInterval = intervalIndex.add(float(span))
        If(a.a.greaterThan(float(0)).and(nextInterval.lessThan(float(config.shortIntervalCount))), () => {
          const rayXY = floor(tileLocal.div(float(probeGroupSize)))
          const probeXY = mod(tileLocal, float(probeGroupSize))
          // Short-interval tiles store absolute ranges from the same probe.
          // Compose tile i with tile i + span at identical probe/ray coords.
          const nextTileXY = vec2(
            mod(nextInterval, float(gridSize)),
            floor(nextInterval.div(float(gridSize)))
          )
          const nextCoord = nextTileXY
            .mul(float(res))
            .add(rayXY.mul(float(probeGroupSize)))
            .add(probeXY)
          const nextUV = nextCoord.div(float(atlasRes))
          const b = sampleTexture(sourceTexture, nextUV)
          output.assign(vec4(a.rgb.add(a.a.mul(b.rgb)), a.a.mul(b.a)))
        })
      })

      return output
    })() as Node<'vec4'>

    this._compositionMaterials.set(cacheKey, material)
    return material
  }

  private _renderFinalRadiance(renderer: WebGPURenderer, target: RenderTarget): void {
    const sourceTexture = this._usesHolographicFinalReadout()
      ? this._holographicRadianceRTs[0]!.texture
      : this._lastComposedTexture ?? this._shortIntervalAtlasRT.texture
    if (this._finalRadianceSourceTexture !== sourceTexture) {
      this._finalRadianceSourceTexture = sourceTexture
      this._finalRadianceMaterial?.dispose()
      this._finalRadianceMaterial = null
    }
    this._ensureFinalRadianceMaterial()
    if (!this._finalRadianceMaterial) return

    beginDebugPass('hrc.final', renderer)
    _quadMesh.material = this._finalRadianceMaterial
    renderer.setRenderTarget(target)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  private _ensureFinalRadianceMaterial(): void {
    if (this._finalRadianceMaterial) return

    const sourceTexture = this._finalRadianceSourceTexture ?? this._shortIntervalAtlasRT.texture
    const usesHolographicReadout = this._usesHolographicFinalReadout()
    if (usesHolographicReadout) {
      this._ensureHolographicFinalRadianceMaterial(sourceTexture)
      return
    }

    const config = this._config
    const baseAngular = Math.sqrt(config.baseRayCount)
    const angularSq = baseAngular * baseAngular
    const res = config.cascadeResolution
    const probeGroupSize = res / baseAngular
    const atlasRes = this._shortIntervalAtlasResolution()

    this._finalRadianceMaterial = new NodeMaterial()
    this._finalRadianceMaterial.fragmentNode = Fn(() => {
      const probeXY = uv().mul(float(probeGroupSize))
      const irradiance = vec3(0).toVar()

      for (let dirY = 0; dirY < baseAngular; dirY++) {
        for (let dirX = 0; dirX < baseAngular; dirX++) {
          const lookupCoord = vec2(
            float(dirX * probeGroupSize).add(probeXY.x),
            float(dirY * probeGroupSize).add(probeXY.y)
          )
          const lookupUV = lookupCoord.div(float(atlasRes))
          irradiance.addAssign(sampleTexture(sourceTexture, lookupUV).rgb)
        }
      }

      return vec4(irradiance.div(float(angularSq)), float(1))
    })() as Node<'vec4'>
  }

  private _usesHolographicFinalReadout(): boolean {
    return this._config.compositionMode === 'holographic' && this._holographicRadianceRTs.length > 0
  }

  private _ensureHolographicFinalRadianceMaterial(sourceTexture: Texture): void {
    const output = this._holographicFinalRadianceDimensions()
    const outputWidth = output.width
    const outputHeight = output.height
    const r0Info = this._holographicLevelInfo()[0]
    if (!r0Info) return
    if (!this._sdfTexture) return
    if (!this._sceneRadianceRT) return

    const sdfTexture = this._sdfTexture
    const sceneRadianceTexture = this._sceneRadianceRT.texture
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode
    const radianceAtlasWidth = r0Info.radianceAtlasWidth
    const radianceAtlasHeight = r0Info.radianceAtlasHeight
    const probeHeight = r0Info.probeHeight
    const finalTraceSteps = Math.max(4, Math.min(16, Math.ceil(this._config.raymarchSteps / 4)))

    this._finalRadianceMaterial = new NodeMaterial()
    this._finalRadianceMaterial.fragmentNode = Fn(() => {
      const outputSize = vec2(float(outputWidth), float(outputHeight))
      const probeCoord = floor(uv().mul(outputSize))
      const centerUV = probeCoord.add(float(0.5)).div(outputSize)
      const centerSDFUV = vec2(centerUV.x, float(1).sub(centerUV.y))
      const centerSDF = sampleTexture(sdfTexture, centerSDFUV).r

      const sampleR0 = (
        cell: Node<'vec2'>,
        direction: Node<'float'>
      ) => {
        const valid = cell.x
          .greaterThanEqual(float(0))
          .and(cell.x.lessThan(float(probeHeight)))
          .and(cell.y.greaterThanEqual(float(0)))
          .and(cell.y.lessThan(float(radianceAtlasHeight)))
          .and(direction.greaterThanEqual(float(0)))
          .and(direction.lessThan(float(r0Info.radianceDirectionCount)))
        const coord = vec2(
          direction.mul(float(r0Info.probeWidth)).add(cell.x).add(float(0.5)),
          cell.y.add(float(0.5))
        )
        const sample = sampleTexture(
          sourceTexture,
          coord.div(vec2(float(radianceAtlasWidth), float(radianceAtlasHeight)))
        )
        return sample.rgb.mul(valid.select(float(1), float(0)))
      }

      const sampleRotation = (
        rotation: number,
        parallel: Node<'float'>,
        perpendicular: Node<'float'>
      ) => {
        const shiftedParallel = parallel.add(float(1))
        const xEven = mod(shiftedParallel, float(2)).lessThan(float(0.5))
        const yEven = mod(perpendicular, float(2)).lessThan(float(0.5))
        const mismatch = xEven.and(yEven.not()).or(xEven.not().and(yEven))
        const halfX = floor(shiftedParallel.div(float(2)))
        const halfY = floor(perpendicular.div(float(2)))
        const offset = mismatch.select(
          yEven.select(float(probeHeight - 1), float(probeHeight)),
          float(0)
        )
        const baseCell = vec2(
          halfX,
          halfY.add(offset).add(float(2 * probeHeight * rotation))
        )
        const traceSegmentIndex = float(2 * rotation).add(mismatch.select(float(1), float(0)))
        const segmentPhase = mod(traceSegmentIndex, float(2))
        const localCellY = baseCell.y.sub(traceSegmentIndex.mul(float(probeHeight)))
        const valid = shiftedParallel
          .lessThan(float(r0Info.outputMaxDimension))
          .and(parallel.greaterThanEqual(float(0)))
          .and(perpendicular.greaterThanEqual(float(0)))
          .and(perpendicular.lessThan(float(r0Info.outputMaxDimension)))

        const mapHalfGrid = (halfCell: Node<'vec2'>) => {
          const fullParallel = halfCell.x.mul(float(2))
          const fullPerpendicular = halfCell.y.mul(float(2)).add(segmentPhase)
          const grid = vec2(fullParallel, fullPerpendicular).toVar()

          If(traceSegmentIndex.greaterThan(float(1.5)).and(traceSegmentIndex.lessThan(float(3.5))), () => {
            grid.assign(vec2(float(outputWidth).sub(fullPerpendicular), fullParallel))
          })

          If(traceSegmentIndex.greaterThan(float(3.5)).and(traceSegmentIndex.lessThan(float(5.5))), () => {
            grid.assign(vec2(float(outputWidth).sub(fullParallel), fullPerpendicular))
          })

          If(traceSegmentIndex.greaterThan(float(5.5)), () => {
            grid.assign(vec2(fullPerpendicular, float(outputHeight).sub(fullParallel)))
          })

          return grid
        }

        const traceFinal = (upper: boolean) => {
          const cellF = vec2(
            baseCell.x.add(xEven.select(float(0), float(0.5))),
            localCellY.add(xEven.select(float(0), float(0.5)))
          )
          const factor = xEven.select(float(2), float(1))
          const ySign = upper ? 1 : -1
          const targetHalf = floor(cellF.add(vec2(float(0.5), float(0.5 * ySign)).mul(factor)))
          const traceValid = targetHalf.x
            .greaterThanEqual(float(0))
            .and(targetHalf.x.lessThan(float(probeHeight)))
            .and(targetHalf.y.greaterThanEqual(float(0)))
            .and(targetHalf.y.lessThan(float(probeHeight)))
          const startHalf = vec2(cellF.x.sub(float(0.49)), cellF.y)
          const startGrid = mapHalfGrid(startHalf)
          const endGrid = mapHalfGrid(targetHalf)
          const outputSize = vec2(float(outputWidth), float(outputHeight))
          const startWorld = uvToWorld(startGrid.div(outputSize), worldSize, worldOffset)
          const endWorld = uvToWorld(endGrid.div(outputSize), worldSize, worldOffset)
          const segment = endWorld.sub(startWorld)
          const segmentLength = segment.length().max(float(0.001))
          const rayDir = segment.div(segmentLength)
          const minStep = segmentLength.div(float(finalTraceSteps)).max(float(0.001))
          const radiance = vec3(0).toVar()
          const transmittance = float(1).toVar()
          const t = float(0).toVar()

          Loop(finalTraceSteps, () => {
            const sampleWorld = startWorld.add(rayDir.mul(t))
            const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)
            const outOfBounds = sampleUV.x
              .lessThan(0)
              .or(sampleUV.x.greaterThan(1))
              .or(sampleUV.y.lessThan(0))
              .or(sampleUV.y.greaterThan(1))

            If(outOfBounds, () => {
              transmittance.assign(float(0))
              Break()
            })

            const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
            const sdfDist = sampleTexture(sdfTexture, sdfUV).r
            If(sdfDist.lessThan(float(EPS)), () => {
              transmittance.assign(float(0))
              Break()
            })

            const stepLen = min(sdfDist.max(minStep), segmentLength.sub(t))
            const sceneRad = sampleTexture(sceneRadianceTexture, sampleUV)
            radiance.addAssign(sceneRad.rgb.mul(transmittance).mul(stepLen))
            t.addAssign(stepLen)

            If(t.greaterThanEqual(segmentLength), () => {
              Break()
            })
          })

          return vec4(radiance.mul(float(Math.PI / 4)), transmittance).mul(traceValid.select(float(1), float(0)))
        }

        const lowerDirection = float(0)
        const upperDirection = float(1)
        const lowerOffset = vec2(float(1), xEven.select(float(-1), float(0)))
        const upperOffset = vec2(float(1), float(1))
        const lowerFar = sampleR0(baseCell.add(lowerOffset), lowerDirection)
        const upperFar = sampleR0(baseCell.add(upperOffset), upperDirection)
        const lowerTrace = traceFinal(false)
        const upperTrace = traceFinal(true)
        const lowerNext = lowerTrace.rgb.add(lowerTrace.a.mul(lowerFar))
        const upperNext = upperTrace.rgb.add(upperTrace.a.mul(upperFar))
        const lowerCurrent = sampleR0(baseCell, lowerDirection)
        const upperCurrent = sampleR0(baseCell, upperDirection)
        const lower = xEven.select(lowerCurrent.add(lowerNext).mul(float(0.5)), lowerNext)
        const upper = xEven.select(upperCurrent.add(upperNext).mul(float(0.5)), upperNext)

        return lower.add(upper).mul(valid.select(float(1), float(0)))
      }

      const sampleReadout = (coord: Node<'vec2'>) => {
        const x = coord.x
        const y = coord.y
        const fluence = sampleRotation(0, x, y)
          .add(sampleRotation(1, y, float(outputWidth - 1).sub(x)))
          .add(sampleRotation(2, float(outputWidth - 1).sub(x), y))
          .add(sampleRotation(3, float(outputHeight - 1).sub(y), x))
        return fluence.div(float(Math.PI))
      }

      const total = sampleReadout(probeCoord).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()

      const sampleNeighbor = (dx: number, dy: number): void => {
        const offset = vec2(dx, dy)
        const neighborCoord = probeCoord.add(offset)
        const validCoord = neighborCoord.x
          .greaterThanEqual(float(0))
          .and(neighborCoord.x.lessThan(float(outputWidth)))
          .and(neighborCoord.y.greaterThanEqual(float(0)))
          .and(neighborCoord.y.lessThan(float(outputHeight)))
        const neighborUV = neighborCoord.add(float(0.5)).div(outputSize)
        const midpointUV = probeCoord.add(offset.mul(float(0.5))).add(float(0.5)).div(outputSize)
        const neighborSDFUV = vec2(neighborUV.x, float(1).sub(neighborUV.y))
        const midpointSDFUV = vec2(midpointUV.x, float(1).sub(midpointUV.y))
        const neighborSDF = sampleTexture(sdfTexture, neighborSDFUV).r
        const midpointSDF = sampleTexture(sdfTexture, midpointSDFUV).r
        const visible = validCoord
          .and(centerSDF.greaterThan(float(EPS)))
          .and(neighborSDF.greaterThan(float(EPS)))
          .and(midpointSDF.greaterThan(float(EPS)))
        const weight = visible.select(float(1), float(0))
        total.addAssign(sampleReadout(neighborCoord).mul(weight))
        totalWeight.addAssign(weight)
      }

      sampleNeighbor(1, 0)
      sampleNeighbor(-1, 0)
      sampleNeighbor(0, 1)
      sampleNeighbor(0, -1)

      return vec4(total.div(totalWeight.max(float(1))), float(1))
    })() as Node<'vec4'>
  }

  private _renderWideRadiance(renderer: WebGPURenderer): void {
    this._ensureWideRadianceMaterials()
    if (!this._wideDownsampleMaterial) return
    if (this._usesWideBlur() && (!this._wideBlurHMaterial || !this._wideBlurVMaterial)) return
    if (
      this._usesSecondWideLevel() &&
      (!this._wideDownsampleMaterial2 || !this._wideBlurHMaterial2 || !this._wideBlurVMaterial2)
    )
      return

    beginDebugPass('hrc.wideDownsample', renderer)
    _quadMesh.material = this._wideDownsampleMaterial
    renderer.setRenderTarget(this._wideRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)

    if (!this._usesWideBlur()) return

    beginDebugPass('hrc.wideBlurH', renderer)
    _quadMesh.material = this._wideBlurHMaterial!
    renderer.setRenderTarget(this._wideBlurRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)

    beginDebugPass('hrc.wideBlurV', renderer)
    _quadMesh.material = this._wideBlurVMaterial!
    renderer.setRenderTarget(this._wideRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)

    if (this._usesSecondWideLevel()) {
      beginDebugPass('hrc.wideDownsample2', renderer)
      _quadMesh.material = this._wideDownsampleMaterial2!
      renderer.setRenderTarget(this._wideRadianceRT2)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      beginDebugPass('hrc.wideBlurH2', renderer)
      _quadMesh.material = this._wideBlurHMaterial2!
      renderer.setRenderTarget(this._wideBlurRT2)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      beginDebugPass('hrc.wideBlurV2', renderer)
      _quadMesh.material = this._wideBlurVMaterial2!
      renderer.setRenderTarget(this._wideRadianceRT2)
      _quadMesh.render(renderer)
      endDebugPass(renderer)
    }
  }

  private _ensureWideRadianceMaterials(): void {
    const needsWideBlur = this._usesWideBlur()
    const hasFirstLevel =
      this._wideDownsampleMaterial &&
      (!needsWideBlur || (this._wideBlurHMaterial && this._wideBlurVMaterial))
    const hasSecondLevel =
      this._wideDownsampleMaterial2 && this._wideBlurHMaterial2 && this._wideBlurVMaterial2
    if (hasFirstLevel && (!this._usesSecondWideLevel() || hasSecondLevel)) {
      return
    }
    if (!this._sdfTexture) return

    if (!hasFirstLevel) {
      this._wideDownsampleMaterial = this._createSdfAwareDownsampleMaterial(
        this._rawFinalRadianceRT.texture,
        this._finalTexelSizeNode
      )
      if (needsWideBlur) {
        this._wideBlurHMaterial = this._createWideBlurMaterial(
          this._wideRadianceRT.texture,
          this._wideTexelSizeNode,
          new Vector2(1, 0)
        )
        this._wideBlurVMaterial = this._createWideBlurMaterial(
          this._wideBlurRT.texture,
          this._wideTexelSizeNode,
          new Vector2(0, 1)
        )
      }
    }

    if (this._usesSecondWideLevel() && !hasSecondLevel) {
      this._wideDownsampleMaterial2 = this._createSdfAwareDownsampleMaterial(
        this._wideRadianceRT.texture,
        this._wideTexelSizeNode
      )
      this._wideBlurHMaterial2 = this._createWideBlurMaterial(
        this._wideRadianceRT2.texture,
        this._wideTexelSizeNode2,
        new Vector2(1, 0)
      )
      this._wideBlurVMaterial2 = this._createWideBlurMaterial(
        this._wideBlurRT2.texture,
        this._wideTexelSizeNode2,
        new Vector2(0, 1)
      )
    }
  }

  private _createSdfAwareDownsampleMaterial(
    sourceTexture: Texture,
    sourceTexelSize: UniformNode<'vec2', Vector2>
  ): NodeMaterial {
    const sdfTexture = this._sdfTexture!
    const texelSize = sourceTexelSize
    const radius = this._filterRadiusNode

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const centerUV = uv()
      const center = sampleTexture(sourceTexture, centerUV)
      const centerSDFUV = vec2(centerUV.x, float(1).sub(centerUV.y))
      const centerSDF = sampleTexture(sdfTexture, centerSDFUV).r
      const total = vec3(center.rgb).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()

      const sampleNeighbor = (dx: number, dy: number, baseWeight: number): void => {
        const offset = vec2(dx, dy).mul(texelSize).mul(radius)
        const neighborUV = centerUV.add(offset).clamp(0, 1)
        const midpointUV = centerUV.add(offset.mul(float(0.5))).clamp(0, 1)
        const neighborSDFUV = vec2(neighborUV.x, float(1).sub(neighborUV.y))
        const midpointSDFUV = vec2(midpointUV.x, float(1).sub(midpointUV.y))
        const neighborSDF = sampleTexture(sdfTexture, neighborSDFUV).r
        const midpointSDF = sampleTexture(sdfTexture, midpointSDFUV).r
        const visible = centerSDF
          .greaterThan(float(EPS))
          .and(neighborSDF.greaterThan(float(EPS)))
          .and(midpointSDF.greaterThan(float(EPS)))
        const weight = visible.select(float(baseWeight), float(0))
        const sample = sampleTexture(sourceTexture, neighborUV)
        total.addAssign(sample.rgb.mul(weight))
        totalWeight.addAssign(weight)
      }

      sampleNeighbor(1, 1, 1)
      sampleNeighbor(-1, 1, 1)
      sampleNeighbor(1, -1, 1)
      sampleNeighbor(-1, -1, 1)
      sampleNeighbor(1, 0, 2)
      sampleNeighbor(-1, 0, 2)
      sampleNeighbor(0, 1, 2)
      sampleNeighbor(0, -1, 2)

      return vec4(total.div(totalWeight.max(float(0.001))), center.a)
    })() as Node<'vec4'>

    return material
  }

  private _createWideBlurMaterial(
    sourceTexture: Texture,
    sourceTexelSize: UniformNode<'vec2', Vector2>,
    axis: Vector2
  ): NodeMaterial {
    const texelSize = sourceTexelSize
    const radius = this._mipBlurNode

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const centerUV = uv()
      const axisNode = vec2(axis.x, axis.y)
      const stepUV = axisNode.mul(texelSize).mul(float(1).add(radius.mul(float(4))))
      const c0 = sampleTexture(sourceTexture, centerUV)
      const c1a = sampleTexture(sourceTexture, centerUV.add(stepUV).clamp(0, 1))
      const c1b = sampleTexture(sourceTexture, centerUV.sub(stepUV).clamp(0, 1))
      const c2a = sampleTexture(sourceTexture, centerUV.add(stepUV.mul(float(2))).clamp(0, 1))
      const c2b = sampleTexture(sourceTexture, centerUV.sub(stepUV.mul(float(2))).clamp(0, 1))

      const color = c0.rgb
        .mul(float(6))
        .add(c1a.rgb.mul(float(4)))
        .add(c1b.rgb.mul(float(4)))
        .add(c2a.rgb)
        .add(c2b.rgb)
        .div(float(16))

      return vec4(color, c0.a)
    })() as Node<'vec4'>

    return material
  }

  private _renderFilteredRadiance(renderer: WebGPURenderer): void {
    this._ensureFilterRadianceMaterial()
    if (!this._filterRadianceMaterial) return

    beginDebugPass('hrc.filter', renderer)
    _quadMesh.material = this._filterRadianceMaterial
    renderer.setRenderTarget(this._finalRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  private _ensureFilterRadianceMaterial(): void {
    if (this._filterRadianceMaterial) return
    if (!this._sdfTexture) return

    const rawFinalTexture = this._rawFinalRadianceRT.texture
    const sdfTexture = this._sdfTexture
    const blueNoiseTexture = this._blueNoiseTexture
    const texelSize = this._finalTexelSizeNode
    const radius = this._filterRadiusNode
    const strength = this._filterStrengthNode
    const useLocalFilter = this._usesLocalFilter()
    const useWideFilter = this._usesMipFilter()
    const useSecondWideLevel = this._usesSecondWideLevel()
    const useFilterDiagonals = this._config.filterDiagonals
    const useFilterJitter = this._config.filterJitterStrength > 0
    const filterJitterStrength = this._filterJitterStrengthNode
    const mipStrength = this._mipStrengthNode
    const blueNoiseScale = Math.max(1, Math.ceil(this._rawFinalRadianceRT.width / BLUE_NOISE_SIZE))

    this._filterRadianceMaterial = new NodeMaterial()
    this._filterRadianceMaterial.fragmentNode = Fn(() => {
      const centerUV = uv()
      const center = sampleTexture(rawFinalTexture, centerUV)
      const centerSDFUV = vec2(centerUV.x, float(1).sub(centerUV.y))
      const centerSDF = sampleTexture(sdfTexture, centerSDFUV).r
      const total = vec3(center.rgb).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()
      const centerLuma = center.r.mul(float(0.2126)).add(center.g.mul(float(0.7152))).add(center.b.mul(float(0.0722)))
      const minVisibleLuma = float(centerLuma).toVar()
      const filterRadiusScale = useFilterJitter
        ? float(1).add(
            sampleTexture(blueNoiseTexture, centerUV.mul(float(blueNoiseScale)))
              .r.sub(float(0.5))
              .mul(filterJitterStrength)
              .mul(smoothstep(float(EPS * 4), float(EPS * 24), centerSDF))
          )
        : float(1)

      const sampleNeighbor = (dx: number, dy: number, baseWeight: number): void => {
        const offset = vec2(dx, dy).mul(texelSize).mul(radius).mul(filterRadiusScale)
        const neighborUV = centerUV.add(offset).clamp(0, 1)
        const midpointUV = centerUV.add(offset.mul(float(0.5))).clamp(0, 1)
        const neighborSDFUV = vec2(neighborUV.x, float(1).sub(neighborUV.y))
        const midpointSDFUV = vec2(midpointUV.x, float(1).sub(midpointUV.y))
        const neighborSDF = sampleTexture(sdfTexture, neighborSDFUV).r
        const midpointSDF = sampleTexture(sdfTexture, midpointSDFUV).r
        const visible = centerSDF
          .greaterThan(float(EPS))
          .and(neighborSDF.greaterThan(float(EPS)))
          .and(midpointSDF.greaterThan(float(EPS)))
        const weight = visible.select(float(baseWeight), float(0))
        const sample = sampleTexture(rawFinalTexture, neighborUV)
        total.addAssign(sample.rgb.mul(weight))
        totalWeight.addAssign(weight)
        const sampleLuma = sample.r.mul(float(0.2126)).add(sample.g.mul(float(0.7152))).add(sample.b.mul(float(0.0722)))
        minVisibleLuma.assign(min(minVisibleLuma, visible.select(sampleLuma, minVisibleLuma)))
      }

      if (useLocalFilter) {
        // HRC paper cleanup kernel: center weight 4, cardinal taps weight 1.
        sampleNeighbor(1, 0, 1)
        sampleNeighbor(-1, 0, 1)
        sampleNeighbor(0, 1, 1)
        sampleNeighbor(0, -1, 1)
        if (useFilterDiagonals) {
          sampleNeighbor(1, 1, 1)
          sampleNeighbor(-1, 1, 1)
          sampleNeighbor(1, -1, 1)
          sampleNeighbor(-1, -1, 1)
        }
      }

      const filtered = total.div(totalWeight.max(float(0.001)))
      const crossFiltered = useLocalFilter
        ? mix(center.rgb, filtered, strength.mul(radius.greaterThan(float(0)).select(1, 0)))
        : center.rgb
      const crossLuma = crossFiltered.r
        .mul(float(0.2126))
        .add(crossFiltered.g.mul(float(0.7152)))
        .add(crossFiltered.b.mul(float(0.0722)))
      const lumaScale = minVisibleLuma.div(crossLuma.max(float(0.001))).clamp(float(0.65), float(1))
      const edgeArea = float(1).sub(smoothstep(float(EPS * 4), float(EPS * 28), centerSDF))
      const shadowContrast = smoothstep(float(0.06), float(0.32), crossLuma.sub(minVisibleLuma).div(crossLuma.max(float(0.001))))
      const edgePreserved = crossFiltered.mul(mix(float(1), lumaScale, edgeArea.mul(shadowContrast).mul(float(0.45))))

      if (useWideFilter) {
        const wide1 = sampleTexture(this._wideRadianceRT.texture, centerUV)
        const mipFiltered = vec3(wide1.rgb).toVar()
        if (useSecondWideLevel) {
          const wide2 = sampleTexture(this._wideRadianceRT2.texture, centerUV)
          const veryOpenArea = smoothstep(float(EPS * 8), float(EPS * 48), centerSDF)
          mipFiltered.assign(mix(wide1.rgb, wide2.rgb, veryOpenArea.mul(this._mipBlurNode)))
        }
        const openArea = smoothstep(float(EPS * 2), float(EPS * 16), centerSDF)
        const edgeAwareMipStrength = mipStrength
          .mul(openArea)
          .mul(float(1).sub(edgeArea.mul(shadowContrast).mul(float(0.55))))
        return vec4(mix(edgePreserved, mipFiltered, edgeAwareMipStrength), center.a)
      }

      return vec4(edgePreserved, center.a)
    })() as Node<'vec4'>
  }

  private _disposeCompositionMaterials(): void {
    for (const material of this._compositionMaterials.values()) {
      material.dispose()
    }
    this._compositionMaterials.clear()
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
  }

  private _disposeHolographicDirectTransferMaterials(): void {
    for (const material of this._holographicDirectTransferMaterials.values()) {
      material.dispose()
    }
    this._holographicDirectTransferMaterials.clear()
  }

  private _disposeHolographicRecursiveTransferMaterials(): void {
    for (const material of this._holographicRecursiveTransferMaterials.values()) {
      material.dispose()
    }
    this._holographicRecursiveTransferMaterials.clear()
  }

  private _disposeHolographicRadianceMaterials(): void {
    for (const material of this._holographicRadianceMaterials.values()) {
      material.dispose()
    }
    this._holographicRadianceMaterials.clear()
  }

  private _disposeMaterials(): void {
    this._sceneRadianceMaterial?.dispose()
    this._sceneRadianceMaterial = null
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeCompositionMaterials()
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
    this._disposeWideRadianceMaterials()
  }
}
