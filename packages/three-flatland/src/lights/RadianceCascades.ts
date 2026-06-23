import {
  RenderTarget,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  ClampToEdgeWrapping,
  RepeatWrapping,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
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
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  int,
  ivec2,
  Fn,
  Loop,
  If,
  Break,
  texture as sampleTexture,
  textureLoad,
  cos,
  sin,
  floor,
  mod,
  min,
  mix,
  smoothstep,
} from 'three/tsl'
import { worldToUV, uvToWorld } from './coordUtils'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'

/**
 * Radiance Cascades renderer for Flatland.
 *
 * Attribution:
 * - The cascade layout, interval scaling, and child-ray merge model follow
 *   Alexander Sannikov's Radiance Cascades technique for 2D global
 *   illumination, as described in the public RC paper/tutorial material.
 * - Filtering, broad irradiance reuse, and blue-noise jitter are local TSL
 *   implementation details for this renderer. No upstream shader code or
 *   external blue-noise texture asset is copied here.
 */

const TAU = Math.PI * 2
const EPS = 0.5
const BLUE_NOISE_SIZE = 32

const _quadMesh = new QuadMesh()
let _rendererState: ReturnType<typeof RendererUtils.resetRendererState>
let _sharedBlueNoiseTexture: DataTexture | null = null

export function createBlueNoiseTexture(size: number = BLUE_NOISE_SIZE): DataTexture {
  const total = size * size
  const active = new Uint8Array(total)
  const ranks = new Uint8Array(total)
  const energy = new Float32Array(total)
  let seed = 0x6d2b79f5

  const rand = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed)
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296
  }

  const torusDistanceSq = (a: number, b: number): number => {
    const ax = a % size
    const ay = Math.floor(a / size)
    const bx = b % size
    const by = Math.floor(b / size)
    const dx = Math.min(Math.abs(ax - bx), size - Math.abs(ax - bx))
    const dy = Math.min(Math.abs(ay - by), size - Math.abs(ay - by))
    return dx * dx + dy * dy
  }

  const maxDistanceSq = Math.floor((size / 2) ** 2 * 2)
  const kernel = new Float32Array(maxDistanceSq + 1)
  const sigma = size / 12
  for (let i = 0; i <= maxDistanceSq; i++) {
    kernel[i] = Math.exp(-i / (2 * sigma * sigma))
  }

  const addEnergy = (index: number, sign: 1 | -1): void => {
    for (let i = 0; i < total; i++) {
      energy[i] = energy[i]! + sign * kernel[torusDistanceSq(index, i)]!
    }
  }

  const findTightestCluster = (): number => {
    let bestIndex = -1
    let bestEnergy = Number.NEGATIVE_INFINITY
    for (let i = 0; i < total; i++) {
      if (!active[i]) continue
      if (energy[i]! > bestEnergy) {
        bestEnergy = energy[i]!
        bestIndex = i
      }
    }
    return bestIndex
  }

  const findLargestVoid = (): number => {
    let bestIndex = -1
    let bestEnergy = Number.POSITIVE_INFINITY
    for (let i = 0; i < total; i++) {
      if (active[i]) continue
      if (energy[i]! < bestEnergy) {
        bestEnergy = energy[i]!
        bestIndex = i
      }
    }
    return bestIndex
  }

  const seedCount = Math.floor(total / 2)
  for (let i = 0; i < seedCount; i++) {
    let index = Math.floor(rand() * total)
    while (active[index]) index = (index + 1) % total
    active[index] = 1
    addEnergy(index, 1)
  }

  // Void-and-cluster relaxation: repeatedly moves the densest filled sample
  // into the largest void. This produces a high-frequency ranked mask rather
  // than the low-frequency blotches of white noise.
  for (let i = 0; i < total * 4; i++) {
    const cluster = findTightestCluster()
    if (cluster < 0) break
    active[cluster] = 0
    addEnergy(cluster, -1)

    const voidIndex = findLargestVoid()
    if (voidIndex < 0) break
    active[voidIndex] = 1
    addEnergy(voidIndex, 1)
  }

  const rankingMask = new Uint8Array(active)
  const rankingEnergy = new Float32Array(energy)
  const assignActive = (index: number, value: 0 | 1): void => {
    rankingMask[index] = value
    for (let i = 0; i < total; i++) {
      rankingEnergy[i] = rankingEnergy[i]! + (value ? 1 : -1) * kernel[torusDistanceSq(index, i)]!
    }
  }
  const findRankingCluster = (): number => {
    let bestIndex = -1
    let bestEnergy = Number.NEGATIVE_INFINITY
    for (let i = 0; i < total; i++) {
      if (!rankingMask[i]) continue
      if (rankingEnergy[i]! > bestEnergy) {
        bestEnergy = rankingEnergy[i]!
        bestIndex = i
      }
    }
    return bestIndex
  }
  const findRankingVoid = (): number => {
    let bestIndex = -1
    let bestEnergy = Number.POSITIVE_INFINITY
    for (let i = 0; i < total; i++) {
      if (rankingMask[i]) continue
      if (rankingEnergy[i]! < bestEnergy) {
        bestEnergy = rankingEnergy[i]!
        bestIndex = i
      }
    }
    return bestIndex
  }

  for (let rank = seedCount - 1; rank >= 0; rank--) {
    const cluster = findRankingCluster()
    ranks[cluster] = Math.round((rank / Math.max(1, total - 1)) * 255)
    assignActive(cluster, 0)
  }

  rankingMask.set(active)
  rankingEnergy.set(energy)
  for (let rank = seedCount; rank < total; rank++) {
    const voidIndex = findRankingVoid()
    ranks[voidIndex] = Math.round((rank / Math.max(1, total - 1)) * 255)
    assignActive(voidIndex, 1)
  }

  const data = new Uint8Array(total * 4)
  for (let i = 0; i < total; i++) {
    const value = ranks[i]!
    const offset = i * 4
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 255
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
  return texture
}

export function getSharedBlueNoiseTexture(): DataTexture {
  if (!_sharedBlueNoiseTexture) {
    _sharedBlueNoiseTexture = createBlueNoiseTexture()
  }
  return _sharedBlueNoiseTexture
}

export interface RadianceCascadesConfig {
  cascadeCount: number
  baseRayCount: number
  /** Base interval in world units. 0 = auto-calculate from world size. */
  baseInterval: number
  /** Cascade texture resolution. 0 = auto-calculate from world size. */
  cascadeResolution: number
  /** Scene-radiance texture downsample factor relative to cascade resolution. */
  sceneRadianceDownsampleFactor: number
  /** Maximum cascade texture resolution used by auto sizing. 0 = unlimited. */
  maxAutoCascadeResolution: number
  /** Stable per-probe angular jitter. Breaks up hard direction sectors. */
  angularJitter: boolean
  /** Maximum bounded SDF raymarch steps per cascade ray. */
  raymarchSteps: number
  /** Blue-noise angular jitter strength. 0 disables the blue-noise contribution. */
  blueNoiseStrength: number
  /** Fraction of each cascade interval overlapped with the previous interval to hide seams. */
  intervalOverlap: number
  /** SDF-aware final filter radius in final-irradiance texels. 0 disables filtering. */
  filterRadius: number
  /** Blend from raw final irradiance to filtered irradiance. */
  filterStrength: number
  /** Include diagonal taps in the SDF-aware final filter for a full 3x3 kernel. */
  filterDiagonals: boolean
  /** Stable blue-noise modulation for the final filter radius. 0 disables it. */
  filterJitterStrength: number
  /** Broad approximate GI radius. Preserves the original mipBlur tuning name. */
  mipBlur: number
  /** Blend from accurate RC irradiance toward SDF-gated broad approximate GI. */
  mipStrength: number
  /** First broad approximate GI downsample factor relative to final irradiance. */
  wideDownsampleFactor: number
  /** Number of low-res broad approximate GI levels to generate when enabled. */
  wideLevels: number
}

const DEFAULT_CONFIG: RadianceCascadesConfig = {
  cascadeCount: 4,
  baseRayCount: 4,
  baseInterval: 0,
  cascadeResolution: 0,
  sceneRadianceDownsampleFactor: 1,
  maxAutoCascadeResolution: 1024,
  angularJitter: true,
  raymarchSteps: 32,
  blueNoiseStrength: 0.45,
  intervalOverlap: 0.1,
  filterRadius: 1.25,
  filterStrength: 0.8,
  filterDiagonals: true,
  filterJitterStrength: 0.35,
  mipBlur: 0,
  mipStrength: 0,
  wideDownsampleFactor: 2,
  wideLevels: 1,
}

export type RadianceCascadesQuality = 'fast' | 'balanced' | 'quality'

export const RADIANCE_CASCADES_PRESETS: Record<
  RadianceCascadesQuality,
  Partial<RadianceCascadesConfig>
> = {
  fast: {
    cascadeCount: 3,
    baseRayCount: 4,
    sceneRadianceDownsampleFactor: 4,
    maxAutoCascadeResolution: 512,
    angularJitter: true,
    raymarchSteps: 24,
    blueNoiseStrength: 0.35,
    intervalOverlap: 0.05,
    filterRadius: 1.15,
    filterStrength: 0.7,
    filterDiagonals: false,
    filterJitterStrength: 0,
    mipBlur: 0,
    mipStrength: 0,
    wideDownsampleFactor: 4,
    wideLevels: 1,
  },
  balanced: {
    cascadeCount: 4,
    baseRayCount: 16,
    sceneRadianceDownsampleFactor: 2,
    maxAutoCascadeResolution: 1024,
    angularJitter: true,
    raymarchSteps: 32,
    blueNoiseStrength: 0.45,
    intervalOverlap: 0.1,
    filterRadius: 1.25,
    filterStrength: 0.8,
    filterDiagonals: true,
    filterJitterStrength: 0.35,
    mipBlur: 0.5,
    mipStrength: 0.25,
    wideDownsampleFactor: 2,
    wideLevels: 1,
  },
  quality: {
    cascadeCount: 4,
    baseRayCount: 16,
    sceneRadianceDownsampleFactor: 1,
    maxAutoCascadeResolution: 2048,
    angularJitter: true,
    raymarchSteps: 48,
    blueNoiseStrength: 0.45,
    intervalOverlap: 0.12,
    filterRadius: 1.4,
    filterStrength: 0.85,
    filterDiagonals: true,
    filterJitterStrength: 0.25,
    mipBlur: 0.6,
    mipStrength: 0.25,
    wideDownsampleFactor: 2,
    wideLevels: 2,
  },
}

export function createRadianceCascadesConfig(
  quality: RadianceCascadesQuality = 'balanced',
  overrides: Partial<RadianceCascadesConfig> = {}
): Partial<RadianceCascadesConfig> {
  return { ...RADIANCE_CASCADES_PRESETS[quality], ...overrides }
}

/**
 * Radiance Cascades GI system.
 *
 * Implements the Radiance Cascades algorithm for 2D global illumination:
 * - Direction-first probe layout for efficient bilinear interpolation
 * - SDF sphere-traced raymarching within bounded intervals
 * - Hierarchical cascade merging (high cascades fill gaps in low cascades)
 *
 * Pipeline per frame:
 * 1. Render scene radiance (lights as soft circles)
 * 2. For cascade = N-1 down to 0: raymarch + merge with cascade N+1
 * 3. Average all directions from cascade 0 into final irradiance texture
 */
export class RadianceCascades {
  private _config: RadianceCascadesConfig
  private _cascadeRTs: RenderTarget[] = []
  private _sceneRadianceRT: RenderTarget | null = null
  private _rawFinalRadianceRT: RenderTarget
  private _wideRadianceRT: RenderTarget
  private _wideBlurRT: RenderTarget
  private _wideRadianceRT2: RenderTarget
  private _wideBlurRT2: RenderTarget
  private _finalRadianceRT: RenderTarget

  private _cascadeMaterials: NodeMaterial[] = []
  private _sceneRadianceMaterial: NodeMaterial | null = null
  private _finalRadianceMaterial: NodeMaterial | null = null
  private _wideDownsampleMaterial: NodeMaterial | null = null
  private _wideDownsampleMaterial2: NodeMaterial | null = null
  private _wideBlurHMaterial: NodeMaterial | null = null
  private _wideBlurVMaterial: NodeMaterial | null = null
  private _wideBlurHMaterial2: NodeMaterial | null = null
  private _wideBlurVMaterial2: NodeMaterial | null = null
  private _filterRadianceMaterial: NodeMaterial | null = null
  private _blueNoiseTexture: DataTexture

  private _worldSize = new Vector2(1, 1)
  private _worldOffset = new Vector2(0, 0)
  private _worldSizeNode = uniform(new Vector2(1, 1))
  private _worldOffsetNode = uniform(new Vector2(0, 0))
  private _intervalOffsetNodes: UniformNode<'float', number>[] = []
  private _intervalRangeNodes: UniformNode<'float', number>[] = []
  private _minStepNodes: UniformNode<'float', number>[] = []
  private _finalTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode2 = uniform(new Vector2(1, 1))
  private _blueNoiseStrengthNode = uniform(0.45)
  private _filterRadiusNode = uniform(1.25)
  private _filterStrengthNode = uniform(0.8)
  private _filterJitterStrengthNode = uniform(0.35)
  private _mipBlurNode = uniform(0)
  private _mipStrengthNode = uniform(0)

  private _sdfTexture: Texture | null = null
  private _lightsTexture: DataTexture | null = null
  private _lightCountNode: Node<'float'> = uniform(0)

  /** Effective base interval (auto-calculated if config.baseInterval is 0) */
  private _effectiveBaseInterval: number = 16
  private _autoBaseInterval: boolean
  private _autoCascadeResolution: boolean

  constructor(config?: Partial<RadianceCascadesConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config }
    this._autoBaseInterval = this._config.baseInterval <= 0
    this._autoCascadeResolution = this._config.cascadeResolution <= 0

    // Eagerly allocate the final radiance RT so .finalRadianceTexture is non-null
    // from construction. The .texture reference stays stable across setSize() calls,
    // allowing TSL sampleTexture() to capture it at node-build time.
    // If cascadeResolution is explicit, use the correct size immediately;
    // otherwise use a reasonable default that init() will resize.
    const baseAngular = Math.sqrt(this._config.baseRayCount)
    const res = this._config.cascadeResolution > 0 ? this._config.cascadeResolution : 128
    const probeCount = res / baseAngular

    const finalOptions = {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    }

    this._rawFinalRadianceRT = new RenderTarget(probeCount, probeCount, finalOptions)
    this._wideRadianceRT = new RenderTarget(probeCount, probeCount, finalOptions)
    this._wideBlurRT = new RenderTarget(probeCount, probeCount, finalOptions)
    this._wideRadianceRT2 = new RenderTarget(probeCount, probeCount, finalOptions)
    this._wideBlurRT2 = new RenderTarget(probeCount, probeCount, finalOptions)
    this._finalRadianceRT = new RenderTarget(probeCount, probeCount, finalOptions)
    this._blueNoiseTexture = getSharedBlueNoiseTexture()
    this.sceneRadianceDownsampleFactor = this._config.sceneRadianceDownsampleFactor
    this.raymarchSteps = this._config.raymarchSteps
    this.filterRadius = this._config.filterRadius
    this.filterStrength = this._config.filterStrength
    this.filterJitterStrength = this._config.filterJitterStrength
    this.blueNoiseStrength = this._config.blueNoiseStrength
    this.mipBlur = this._config.mipBlur
    this.mipStrength = this._config.mipStrength
    this.wideDownsampleFactor = this._config.wideDownsampleFactor
    this.wideLevels = this._config.wideLevels

    registerDebugTexture('radiance.finalIrradiance', this._finalRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'GI final irradiance',
    })
    registerDebugTexture('radiance.rawFinalIrradiance', this._rawFinalRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'GI raw final irradiance',
    })
    registerDebugTexture('radiance.wideIrradiance', this._wideRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'GI wide filtered irradiance 1/2',
    })
    registerDebugTexture('radiance.wideIrradiance2', this._wideRadianceRT2, 'rgba16f', {
      display: 'colors',
      label: 'GI wide filtered irradiance 1/4',
    })
  }

  get config(): RadianceCascadesConfig {
    return this._config
  }

  set cascadeCount(value: number) {
    if (value !== this._config.cascadeCount) {
      this._config.cascadeCount = Math.max(2, Math.min(6, value))
      this._rebuildCascadeRTs()
    }
  }

  get cascadeCount(): number {
    return this._config.cascadeCount
  }

  get radianceTexture(): Texture | null {
    return this._finalRadianceRT?.texture ?? null
  }

  get sceneRadianceTexture(): Texture | null {
    return this._sceneRadianceRT?.texture ?? null
  }

  get cascadeTextures(): (Texture | null)[] {
    return this._cascadeRTs.map((rt) => rt?.texture ?? null)
  }

  get finalRadianceTexture(): Texture {
    return this._finalRadianceRT.texture
  }

  get blueNoiseStrength(): number {
    return this._config.blueNoiseStrength
  }

  set blueNoiseStrength(value: number) {
    const strength = Math.max(0, Math.min(1, value))
    this._config.blueNoiseStrength = strength
    this._blueNoiseStrengthNode.value = strength
  }

  get raymarchSteps(): number {
    return this._config.raymarchSteps
  }

  set raymarchSteps(value: number) {
    const steps = Math.max(8, Math.min(96, Math.round(value)))
    const changed = steps !== this._config.raymarchSteps
    this._config.raymarchSteps = steps
    this._updateIntervalUniforms()
    if (changed && this._cascadeRTs.length > 0) {
      for (const mat of this._cascadeMaterials) {
        mat.dispose()
      }
      this._cascadeMaterials = []
      this._createCascadeMaterials()
    }
  }

  get intervalOverlap(): number {
    return this._config.intervalOverlap
  }

  set intervalOverlap(value: number) {
    const overlap = Math.max(0, Math.min(0.45, value))
    this._config.intervalOverlap = overlap < 0.000001 ? 0 : overlap
    this._updateIntervalUniforms()
  }

  get filterRadius(): number {
    return this._config.filterRadius
  }

  set filterRadius(value: number) {
    const wasLocalEnabled = this._usesLocalFilter()
    const radius = Math.max(0, value)
    this._config.filterRadius = radius
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
    this._filterJitterStrengthNode.value = strength
    if (wasEnabled !== (strength > 0)) {
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
    this._mipBlurNode.value = blur
    this._syncRawFinalMipState()
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
    this._mipStrengthNode.value = strength
    this._syncRawFinalMipState()
    if (wasEnabled !== this._usesMipFilter()) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get wideLevels(): number {
    return this._config.wideLevels
  }

  set wideLevels(value: number) {
    const wasSecondLevelEnabled = this._usesSecondWideLevel()
    this._config.wideLevels = Math.max(1, Math.min(2, Math.round(value)))
    if (wasSecondLevelEnabled !== this._usesSecondWideLevel()) {
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
    this._resizeWideRadianceTargets()
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
  }

  get sceneRadianceDownsampleFactor(): number {
    return this._config.sceneRadianceDownsampleFactor
  }

  set sceneRadianceDownsampleFactor(value: number) {
    const factor = Math.max(1, Math.min(4, Math.round(value)))
    if (factor === this._config.sceneRadianceDownsampleFactor) return
    this._config.sceneRadianceDownsampleFactor = factor
    if (this._sceneRadianceRT) {
      this._resizeSceneRadianceTarget()
      this._createCascadeMaterials()
    }
  }

  private _usesMipFilter(): boolean {
    return this._config.mipStrength > 0
  }

  get wideFilterEnabled(): boolean {
    return this._usesMipFilter()
  }

  private _usesWideBlur(): boolean {
    return this._usesMipFilter() && this._config.mipBlur > 0
  }

  get wideBlurEnabled(): boolean {
    return this._usesWideBlur()
  }

  get estimatedPassCount(): number {
    let count = 1 + this._config.cascadeCount + 1
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
    const resolution = this._config.cascadeResolution
    if (resolution <= 0) return 0
    return resolution * resolution * this._config.cascadeCount
  }

  get estimatedRaymarchSampleCount(): number {
    return this.estimatedRaymarchTexelCount * this._config.raymarchSteps
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

  private _syncRawFinalMipState(): void {
    this._rawFinalRadianceRT.texture.generateMipmaps = false
    this._rawFinalRadianceRT.texture.minFilter = LinearFilter
  }

  init(
    worldWidth: number,
    worldHeight: number,
    lightsTexture: DataTexture,
    lightCountNode: Node<'float'>
  ): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._lightsTexture = lightsTexture
    this._lightCountNode = lightCountNode

    // Auto-calculate cascadeResolution from world size if not explicitly set.
    // Target ~1 probe per 1.5 world units, rounded up to next power of 2.
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

    this._updateIntervalUniforms()

    const res = this._config.cascadeResolution
    const probeCount = res / baseAngular

    const sceneRadianceRes = this._sceneRadianceResolution()
    this._sceneRadianceRT = new RenderTarget(sceneRadianceRes, sceneRadianceRes, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    })

    registerDebugTexture('radiance.sceneRadiance', this._sceneRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'GI scene radiance (light circles)',
    })

    // Resize the eagerly-allocated final RT to match computed probe dimensions.
    // The .texture reference stays stable — TSL nodes that captured it remain valid.
    this._rawFinalRadianceRT.setSize(probeCount, probeCount)
    this._finalRadianceRT.setSize(probeCount, probeCount)
    this._resizeWideRadianceTargets()
    this._finalTexelSizeNode.value.set(1 / probeCount, 1 / probeCount)

    this._rebuildCascadeRTs()
  }

  private _sceneRadianceResolution(): number {
    return Math.max(
      1,
      Math.ceil(this._config.cascadeResolution / this._config.sceneRadianceDownsampleFactor)
    )
  }

  private _resizeSceneRadianceTarget(): void {
    if (!this._sceneRadianceRT) return
    const sceneRadianceRes = this._sceneRadianceResolution()
    this._sceneRadianceRT.setSize(sceneRadianceRes, sceneRadianceRes)
    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []
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

  private _rebuildCascadeRTs(): void {
    for (let i = 0; i < this._cascadeRTs.length; i++) {
      unregisterDebugTexture(`radiance.cascade${i}`)
      this._cascadeRTs[i]!.dispose()
    }
    this._cascadeRTs = []

    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []

    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
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
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._ensureIntervalUniforms()
    this._updateIntervalUniforms()

    const res = this._config.cascadeResolution
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const rt = new RenderTarget(res, res, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      })
      this._cascadeRTs.push(rt)
      registerDebugTexture(`radiance.cascade${i}`, rt, 'rgba16f', {
        display: 'colors',
        label: `GI cascade ${i}`,
      })
    }

    this._createCascadeMaterials()
  }

  private _ensureIntervalUniforms(): void {
    while (this._intervalOffsetNodes.length < this._config.cascadeCount) {
      this._intervalOffsetNodes.push(uniform(0) as UniformNode<'float', number>)
      this._intervalRangeNodes.push(uniform(1) as UniformNode<'float', number>)
      this._minStepNodes.push(uniform(0.001) as UniformNode<'float', number>)
    }
    this._intervalOffsetNodes.length = this._config.cascadeCount
    this._intervalRangeNodes.length = this._config.cascadeCount
    this._minStepNodes.length = this._config.cascadeCount
  }

  private _updateIntervalUniforms(): void {
    this._ensureIntervalUniforms()

    if (this._autoBaseInterval) {
      const diagonal = Math.hypot(this._worldSize.x, this._worldSize.y)
      const geometricSum = (Math.pow(4, this._config.cascadeCount) - 1) / 3
      this._effectiveBaseInterval = diagonal / geometricSum
    } else {
      this._effectiveBaseInterval = this._config.baseInterval
    }

    let offset = 0
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const range = this._effectiveBaseInterval * Math.pow(4, i)
      const overlap = i === 0 ? 0 : range * this._config.intervalOverlap
      this._intervalOffsetNodes[i]!.value = Math.max(0, offset - overlap)
      this._intervalRangeNodes[i]!.value = range + overlap
      this._minStepNodes[i]!.value = Math.max(range / this._config.raymarchSteps, 0.001)
      offset += range
    }
  }

  resize(worldWidth: number, worldHeight: number): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._updateIntervalUniforms()
  }

  setWorldBounds(worldSize: Vector2, worldOffset: Vector2): void {
    this._worldSize.copy(worldSize)
    this._worldOffset.copy(worldOffset)
    this._worldSizeNode.value.copy(worldSize)
    this._worldOffsetNode.value.copy(worldOffset)
    this._updateIntervalUniforms()
  }

  setSdfTexture(texture: Texture): void {
    if (this._sdfTexture !== texture) {
      this._sdfTexture = texture
      this._disposeWideRadianceMaterials()
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
      this._createCascadeMaterials()
    }
  }

  generate(renderer: WebGPURenderer, sdfTexture: Texture): void {
    if (this._sdfTexture !== sdfTexture) {
      this._sdfTexture = sdfTexture
      this._disposeWideRadianceMaterials()
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
      this._createCascadeMaterials()
    }

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState)

    try {
      // Step 1: Render scene radiance (lights as soft emission density).
      this._renderSceneRadiance(renderer)

      // Step 2: Process cascades from highest to lowest. Each cascade stores
      // <radiance.rgb, transmittance.a>; lower cascades merge their near
      // interval with four higher-cascade sub-rays via Eq. 7 from the paper.
      for (let i = this._config.cascadeCount - 1; i >= 0; i--) {
        this._renderCascade(renderer, i)
      }

      // Step 3: Average all directions from cascade 0. When filtering is off,
      // write directly into the stable public texture and skip the copy/filter pass.
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

  // ============================================
  // SCENE RADIANCE (lights as soft circles)
  // ============================================

  private _renderSceneRadiance(renderer: WebGPURenderer): void {
    if (!this._sceneRadianceRT || !this._lightsTexture || !this._lightCountNode) return

    this._ensureSceneRadianceMaterial()
    if (!this._sceneRadianceMaterial) return

    beginDebugPass('radiance.scene', renderer)
    _quadMesh.material = this._sceneRadianceMaterial
    renderer.setRenderTarget(this._sceneRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  /**
   * Create the scene radiance material.
   * Renders each light as a soft circle of radiance.
   *
   * Bug 7 fix: Uses uvToWorld() consistently — no manual Y-flip.
   */
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

      // Store in linear space — no gamma conversion
      return vec4(totalRadiance, float(1))
    })() as Node<'vec4'>
  }

  // ============================================
  // CASCADE PASSES (raymarch + merge)
  // ============================================

  private _renderCascade(renderer: WebGPURenderer, cascadeIndex: number): void {
    const material = this._cascadeMaterials[cascadeIndex]
    if (!material) return

    beginDebugPass(`radiance.cascade${cascadeIndex}`, renderer)
    _quadMesh.material = material
    renderer.setRenderTarget(this._cascadeRTs[cascadeIndex]!)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  private _createCascadeMaterials(): void {
    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []

    if (!this._sdfTexture || !this._sceneRadianceRT) return
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const prevCascadeTex =
        i < this._config.cascadeCount - 1 ? (this._cascadeRTs[i + 1]?.texture ?? null) : null

      const material = this._createCascadeMaterial(i, prevCascadeTex)
      this._cascadeMaterials.push(material)
    }
  }

  /**
   * Create a material for a single cascade pass.
   *
   * Direction-first layout: the cascade texture is divided into angular×angular
   * direction blocks, each probeGroupSize×probeGroupSize pixels. A texel's
   * position determines which probe and which direction it represents.
   *
   * Fixes applied:
   * - Interval scaling uses pow(4, c) geometric series (branching factor 4)
   * - Highest cascade samples scene radiance at ray endpoint on miss (boundary condition)
   * - SDF scale uses average(worldW, worldH) for isotropic distance conversion
   * - Cascade merge averages 4 sub-rays from cascade N+1
   * - Uses worldToUV/uvToWorld consistently
   */
  private _createCascadeMaterial(
    cascadeIndex: number,
    prevCascadeTexture: Texture | null
  ): NodeMaterial {
    const config = this._config
    const sdfTexture = this._sdfTexture!
    const sceneRadianceTexture = this._sceneRadianceRT!.texture
    const blueNoiseTexture = this._blueNoiseTexture
    const blueNoiseStrength = this._blueNoiseStrengthNode
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode

    const baseAngular = Math.sqrt(config.baseRayCount)
    const angular = baseAngular * Math.pow(2, cascadeIndex)
    const angularSq = angular * angular

    const res = config.cascadeResolution
    const probeGroupSize = res / angular

    const intervalOffset = this._intervalOffsetNodes[cascadeIndex]!
    const intervalRange = this._intervalRangeNodes[cascadeIndex]!
    const minStep = this._minStepNodes[cascadeIndex]!
    const raymarchSteps = config.raymarchSteps

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const fragCoord = uv().mul(float(res))

      // Direction-first layout decomposition
      const rayXY = floor(fragCoord.div(float(probeGroupSize)))
      const probeXY = mod(fragCoord, float(probeGroupSize))
      const rayIndex = rayXY.x.add(rayXY.y.mul(float(angular)))

      const probeUV = probeXY.add(float(0.5)).div(float(probeGroupSize))
      const probeWorldPos = uvToWorld(probeUV, worldSize, worldOffset)

      // Ray direction from angular index. Stable per-probe jitter breaks
      // up hard angular sectors into filterable noise without temporal shimmer.
      const jitter = config.angularJitter
        ? sampleTexture(
            blueNoiseTexture,
            fragCoord.add(float(cascadeIndex * 17)).div(float(BLUE_NOISE_SIZE))
          )
            .r.sub(float(0.5))
            .mul(float(2))
            .mul(blueNoiseStrength)
        : float(0)
      const theta = rayIndex.add(float(0.5).add(jitter)).mul(float(TAU / angularSq))
      const rayDir = vec2(cos(theta), sin(theta))

      const intervalRadiance = vec3(0).toVar()
      const intervalTransmittance = float(1).toVar()
      const intervalEnd = intervalOffset.add(intervalRange)
      const t = intervalOffset.toVar()

      Loop(raymarchSteps, () => {
        const sampleWorld = probeWorldPos.add(rayDir.mul(t))
        const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)

        // Bounds check
        const outOfBounds = sampleUV.x
          .lessThan(0)
          .or(sampleUV.x.greaterThan(1))
          .or(sampleUV.y.lessThan(0))
          .or(sampleUV.y.greaterThan(1))

        If(outOfBounds, () => {
          intervalTransmittance.assign(float(0))
          Break()
        })

        const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
        const sdfSample = sampleTexture(sdfTexture, sdfUV)
        const sdfDist = sdfSample.r

        If(sdfDist.lessThan(float(EPS)), () => {
          intervalTransmittance.assign(float(0))
          Break()
        })

        const stepLen = min(sdfDist.max(minStep), intervalEnd.sub(t))
        const sceneRad = sampleTexture(sceneRadianceTexture, sampleUV)
        intervalRadiance.addAssign(sceneRad.rgb.mul(intervalTransmittance).mul(stepLen))

        t.addAssign(stepLen)

        If(t.greaterThanEqual(intervalEnd), () => {
          Break()
        })
      })

      const mergedRadiance = vec3(intervalRadiance).toVar()
      const mergedTransmittance = float(intervalTransmittance).toVar()

      if (prevCascadeTexture && cascadeIndex < config.cascadeCount - 1) {
        If(intervalTransmittance.greaterThan(float(0)), () => {
          const angularN1 = angular * 2
          const probeGroupSizeN1 = res / angularN1

          // Map probe position from this cascade to next cascade's probe space.
          // N+1 has half the probes per direction block (double angular resolution).
          const probeN1 = probeXY.mul(float(0.5)).clamp(float(0.5), float(probeGroupSizeN1 - 0.5))

          const farRadiance = vec3(0).toVar()
          const farTransmittance = float(0).toVar()

          for (let subRay = 0; subRay < 4; subRay++) {
            const subRayIndex = rayIndex.mul(float(4)).add(float(subRay))
            const rayN1XY = vec2(
              mod(subRayIndex, float(angularN1)),
              floor(subRayIndex.div(float(angularN1)))
            )

            // Compute full texel position, then convert to UV for bilinear sampling.
            // textureLoad and sampleTexture share the same coordinate origin for
            // render targets in WebGPU — no Y-flip needed.
            const texelPos = rayN1XY.mul(float(probeGroupSizeN1)).add(probeN1)
            const mergeUV = texelPos.div(float(res))
            const mergedSample = sampleTexture(prevCascadeTexture, mergeUV)
            farRadiance.addAssign(mergedSample.rgb)
            farTransmittance.addAssign(mergedSample.a)
          }

          farRadiance.mulAssign(float(0.25))
          farTransmittance.mulAssign(float(0.25))
          mergedRadiance.addAssign(mergedTransmittance.mul(farRadiance))
          mergedTransmittance.mulAssign(farTransmittance)
        })
      }

      return vec4(mergedRadiance, mergedTransmittance)
    })() as Node<'vec4'>

    return material
  }

  // ============================================
  // FINAL IRRADIANCE READOUT
  // ============================================

  private _renderFinalRadiance(renderer: WebGPURenderer, target: RenderTarget): void {
    if (!this._cascadeRTs[0]) return

    this._ensureFinalRadianceMaterial()
    if (!this._finalRadianceMaterial) return

    beginDebugPass('radiance.final', renderer)
    _quadMesh.material = this._finalRadianceMaterial
    renderer.setRenderTarget(target)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
  }

  /**
   * Create the final irradiance averaging material.
   *
   * Bug 3 fix: Averages ALL direction blocks from cascade 0.
   * (Previously only sampled top-left 25% = one direction.)
   *
   * For each probe position, loops over all angular²  directions and averages
   * the radiance. Output is a probeCount × probeCount texture addressed by
   * world UV [0,1] — same convention as the SDF and occlusion textures.
   */
  private _ensureFinalRadianceMaterial(): void {
    if (this._finalRadianceMaterial) return
    if (!this._cascadeRTs[0]) return

    const cascade0Texture = this._cascadeRTs[0].texture
    const config = this._config
    const baseAngular = Math.sqrt(config.baseRayCount)
    const angular = baseAngular // Cascade 0 angular
    const angularSq = angular * angular
    const res = config.cascadeResolution
    const probeGroupSize = res / angular

    this._finalRadianceMaterial = new NodeMaterial()
    this._finalRadianceMaterial.fragmentNode = Fn(() => {
      // Map final RT UV → probe position in cascade 0
      const probeXY = uv().mul(float(probeGroupSize))

      const irradiance = vec3(0).toVar()

      // Unrolled loop: average all direction blocks
      for (let dirY = 0; dirY < angular; dirY++) {
        for (let dirX = 0; dirX < angular; dirX++) {
          const lookupCoord = vec2(
            float(dirX * probeGroupSize).add(probeXY.x),
            float(dirY * probeGroupSize).add(probeXY.y)
          )
          const lookupUV = lookupCoord.div(float(res))
          const sample = sampleTexture(cascade0Texture, lookupUV)
          irradiance.addAssign(sample.rgb)
        }
      }

      irradiance.divAssign(float(angularSq))

      return vec4(irradiance, float(1))
    })() as Node<'vec4'>
  }

  private _renderFilteredRadiance(renderer: WebGPURenderer): void {
    this._ensureFilterRadianceMaterial()
    if (!this._filterRadianceMaterial) return

    beginDebugPass('radiance.filter', renderer)
    _quadMesh.material = this._filterRadianceMaterial
    renderer.setRenderTarget(this._finalRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)
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

    beginDebugPass('radiance.wideDownsample', renderer)
    _quadMesh.material = this._wideDownsampleMaterial
    renderer.setRenderTarget(this._wideRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)

    if (!this._usesWideBlur()) return

    beginDebugPass('radiance.wideBlurH', renderer)
    _quadMesh.material = this._wideBlurHMaterial!
    renderer.setRenderTarget(this._wideBlurRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)

    beginDebugPass('radiance.wideBlurV', renderer)
    _quadMesh.material = this._wideBlurVMaterial!
    renderer.setRenderTarget(this._wideRadianceRT)
    _quadMesh.render(renderer)
    endDebugPass(renderer)

    if (this._usesSecondWideLevel()) {
      const downsample2 = this._wideDownsampleMaterial2!
      const blurH2 = this._wideBlurHMaterial2!
      const blurV2 = this._wideBlurVMaterial2!

      beginDebugPass('radiance.wideDownsample2', renderer)
      _quadMesh.material = downsample2
      renderer.setRenderTarget(this._wideRadianceRT2)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      beginDebugPass('radiance.wideBlurH2', renderer)
      _quadMesh.material = blurH2
      renderer.setRenderTarget(this._wideBlurRT2)
      _quadMesh.render(renderer)
      endDebugPass(renderer)

      beginDebugPass('radiance.wideBlurV2', renderer)
      _quadMesh.material = blurV2
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

        // Keep the filter from bleeding across occluder silhouettes. The
        // midpoint test catches thin walls between two positive-SDF cells.
        const visible = centerSDF
          .greaterThan(float(EPS))
          .and(neighborSDF.greaterThan(float(EPS)))
          .and(midpointSDF.greaterThan(float(EPS)))
        const weight = visible.select(float(baseWeight), float(0))
        const sample = sampleTexture(rawFinalTexture, neighborUV)
        total.addAssign(sample.rgb.mul(weight))
        totalWeight.addAssign(weight)
      }

      if (useLocalFilter) {
        sampleNeighbor(1, 0, 2)
        sampleNeighbor(-1, 0, 2)
        sampleNeighbor(0, 1, 2)
        sampleNeighbor(0, -1, 2)
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
      if (useWideFilter) {
        // Optional broad approximate GI from the original mip/downsample plan.
        // The old version used direct light blobs as the input, which is where
        // it broke down. This version uses RC irradiance as the source and runs
        // explicit low-res passes instead of TSL `.blur()`, so the cost is
        // predictable and the blend stays visibility-aware.
        const wide1 = sampleTexture(this._wideRadianceRT.texture, centerUV)
        const mipFiltered = vec3(wide1.rgb).toVar()
        if (useSecondWideLevel) {
          const wide2 = sampleTexture(this._wideRadianceRT2.texture, centerUV)
          const veryOpenArea = smoothstep(float(EPS * 8), float(EPS * 48), centerSDF)
          mipFiltered.assign(mix(wide1.rgb, wide2.rgb, veryOpenArea.mul(this._mipBlurNode)))
        }
        const openArea = smoothstep(float(EPS * 2), float(EPS * 16), centerSDF)
        const mipMix = mipStrength.mul(openArea)
        const mixed = mix(crossFiltered, mipFiltered, mipMix)
        return vec4(mixed, center.a)
      }

      return vec4(crossFiltered, center.a)
    })() as Node<'vec4'>
  }

  // ============================================
  // CLEANUP
  // ============================================

  dispose(): void {
    for (let i = 0; i < this._cascadeRTs.length; i++) {
      unregisterDebugTexture(`radiance.cascade${i}`)
      this._cascadeRTs[i]!.dispose()
    }
    this._cascadeRTs = []

    unregisterDebugTexture('radiance.sceneRadiance')
    this._sceneRadianceRT?.dispose()
    this._sceneRadianceRT = null

    unregisterDebugTexture('radiance.rawFinalIrradiance')
    this._rawFinalRadianceRT.dispose()

    unregisterDebugTexture('radiance.wideIrradiance')
    this._wideRadianceRT.dispose()
    this._wideBlurRT.dispose()

    unregisterDebugTexture('radiance.wideIrradiance2')
    this._wideRadianceRT2.dispose()
    this._wideBlurRT2.dispose()

    unregisterDebugTexture('radiance.finalIrradiance')
    this._finalRadianceRT.dispose()

    for (const mat of this._cascadeMaterials) {
      mat.dispose()
    }
    this._cascadeMaterials = []

    this._sceneRadianceMaterial?.dispose()
    this._sceneRadianceMaterial = null

    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null

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

    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
  }
}
