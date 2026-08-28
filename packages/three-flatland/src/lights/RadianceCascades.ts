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
  Color,
  type OrthographicCamera,
  type Scene,
  type Texture,
} from 'three'
import { NodeMaterial, QuadMesh, RendererUtils, type WebGPURenderer } from 'three/webgpu'
import { beginDebugPass, endDebugPass, registerDebugTexture, unregisterDebugTexture } from '../debug/debug-sink'
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
import { rayBoundsInterval, traceDdaIntegerRadiance } from './ddaGrid'
import { EmissivePass } from './EmissivePass'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'

/**
 * Radiance Cascades renderer for Flatland.
 *
 * Attribution:
 * - The cascade layout, interval scaling, and child-ray merge model follow
 *   Alexander Sannikov's Radiance Cascades technique for 2D global
 *   illumination, as described in the public RC paper/tutorial material.
 * - Filtering and broad irradiance reuse are local TSL implementation details
 *   for this renderer. No upstream shader code is copied here.
 */

const TAU = Math.PI * 2
const BLUE_NOISE_SIZE = 32
// RC transports finite emissive regions, not mathematical delta lights. A
// source that is too small for P0/Q0/t0 violates the penumbra hypothesis and
// appears as axis-aligned spokes. HRC additionally enforces a logical-pixel
// footprint after DDA downsampling; this fraction remains the conventional RC
// fallback when no coarser transport grid is involved.
const AUTO_LIGHT_SOURCE_VIEW_FRACTION = 0.02
const AUTO_DDA_LIGHT_SOURCE_RADIUS_TEXELS = 4

export type RadianceCascadesTraversal = 'sdf' | 'dda-fixed'

function normalizeDdaPaletteBands(value: number): number {
  if (!Number.isFinite(value) || value < 2) return 0
  return Math.max(2, Math.min(64, Math.round(value)))
}

const _quadMesh = new QuadMesh()
const _emissiveClearColor = new Color()
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

type AnalyticLightTrace = {
  radiance: Node<'vec3'>
  distance: Node<'float'>
  hit: Node<'float'>
}

/**
 * Trace a finite segment against the localized point/spot emitters in the
 * light store. Emitters are opaque radiance sources: once a ray reaches one,
 * farther transport is blocked. This is the same fluence contract used by the
 * RC/HRC reference implementations and deliberately does not integrate a
 * light's already-attenuated influence field through empty space.
 */
export function traceAnalyticLightSources(
  lightsTexture: Texture,
  lightCount: Node<'float'>,
  rayStart: Node<'vec2'>,
  rayDirection: Node<'vec2'>,
  maxDistance: Node<'float'>,
  sourceRadius: Node<'float'>
): AnalyticLightTrace {
  const nearestDistance = maxDistance.add(float(1)).toVar()
  const nearestRadiance = vec3(0).toVar()
  const sourceHit = float(0).toVar()

  Loop({ start: 0, end: lightCount, type: 'float', condition: '<' }, ({ i }: { i: Node<'float'> }) => {
    const row0 = textureLoad(lightsTexture, ivec2(int(i), int(0)))
    const row1 = textureLoad(lightsTexture, ivec2(int(i), int(1)))
    const row2 = textureLoad(lightsTexture, ivec2(int(i), int(2)))
    const row3 = textureLoad(lightsTexture, ivec2(int(i), int(3)))

    const lightType = row3.r
    const enabled = row3.g.greaterThan(float(0.5))
    const positional = lightType.lessThan(float(1.5))
    const lightPosition = vec2(row0.r, row0.g)
    const toCenter = lightPosition.sub(rayStart)
    const projected = toCenter.dot(rayDirection)
    const closestDistanceSq = toCenter.dot(toCenter).sub(projected.mul(projected))
    const radiusSq = sourceRadius.mul(sourceRadius)
    const intersects = closestDistanceSq.lessThanEqual(radiusSq)
    const halfChord = radiusSq.sub(closestDistanceSq).max(float(0)).sqrt()
    // A ray grazing an emissive disk represents less of its projected area
    // than one through the centre. Treating every intersection as full energy
    // exposes RC/HRC's sparse base directions as fat spokes around small
    // sources. Amitabha similarly attenuates analytic-circle hits by their
    // penetration; the normalized half-chord is resolution-independent and
    // is the exact line-integral coverage of a uniform disk up to a constant.
    const sourceCoverage = halfChord.div(sourceRadius.max(float(1e-6))).clamp(0, 1)
    const entryDistance = projected.sub(halfChord).max(float(0))
    const exitsAhead = projected.add(halfChord).greaterThanEqual(float(0))
    const insideSegment = entryDistance.lessThanEqual(maxDistance)

    If(
      enabled
        .and(positional)
        .and(intersects)
        .and(exitsAhead)
        .and(insideSegment)
        .and(entryDistance.lessThan(nearestDistance)),
      () => {
        const lightColor = vec3(row0.b, row0.a, row1.r)
        const lightIntensity = row1.g
        const emission = lightColor.mul(lightIntensity).toVar()
        const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5)))

        If(isSpot, () => {
          const lightDirection = vec2(row2.r, row2.g)
          const outgoingDirection = rayDirection.mul(float(-1))
          const spotCos = outgoingDirection.dot(lightDirection)
          const innerCos = row2.b.cos()
          const outerCos = row2.b.add(row2.a).cos()
          const cone = spotCos
            .sub(outerCos)
            .div(innerCos.sub(outerCos).max(float(0.0001)))
            .clamp(0, 1)
          emission.mulAssign(cone)
        })

        nearestDistance.assign(entryDistance)
        nearestRadiance.assign(emission.mul(sourceCoverage))
        sourceHit.assign(float(1))
      }
    )
  })

  return {
    radiance: nearestRadiance,
    distance: nearestDistance,
    hit: sourceHit,
  }
}

export function collectAmbientRadiance(lightsTexture: Texture, lightCount: Node<'float'>): Node<'vec3'> {
  const ambient = vec3(0).toVar()
  Loop({ start: 0, end: lightCount, type: 'float', condition: '<' }, ({ i }: { i: Node<'float'> }) => {
    const row0 = textureLoad(lightsTexture, ivec2(int(i), int(0)))
    const row1 = textureLoad(lightsTexture, ivec2(int(i), int(1)))
    const row3 = textureLoad(lightsTexture, ivec2(int(i), int(3)))
    const enabled = row3.g.greaterThan(float(0.5))
    const isAmbient = row3.r.greaterThan(float(2.5))
    If(enabled.and(isAmbient), () => {
      ambient.addAssign(vec3(row0.b, row0.a, row1.r).mul(row1.g))
    })
  })
  return ambient
}

export interface RadianceCascadesConfig {
  /** Occlusion backend and storage representation used by each cascade. */
  traversal: RadianceCascadesTraversal
  cascadeCount: number
  baseRayCount: number
  /** Base interval in world units. 0 = auto-calculate from world size. */
  baseInterval: number
  /** Cascade texture resolution. 0 = auto-calculate from world size. */
  cascadeResolution: number
  /** Maximum cascade texture resolution used by auto sizing. 0 = unlimited. */
  maxAutoCascadeResolution: number
  /** Maximum bounded SDF raymarch steps per cascade ray. */
  raymarchSteps: number
  /** World-space SDF hit threshold. `0` derives half of the largest SDF texel footprint. */
  sdfHitEpsilon: number
  /** Fraction of each cascade interval overlapped with the previous interval to hide seams. */
  intervalOverlap: number
  /** SDF-aware final filter radius in final-irradiance texels. 0 disables filtering. */
  filterRadius: number
  /** Blend from raw final irradiance to filtered irradiance. */
  filterStrength: number
  /** Broad approximate GI radius. Preserves the original mipBlur tuning name. */
  mipBlur: number
  /** Blend from accurate RC irradiance toward SDF-gated broad approximate GI. */
  mipStrength: number
  /** First broad approximate GI downsample factor relative to final irradiance. */
  wideDownsampleFactor: number
  /** Number of low-res broad approximate GI levels to generate when enabled. */
  wideLevels: number
  /**
   * Radius of the opaque emissive disk used to represent point and spot lights,
   * in world units. `0` derives 2% of the smaller world/view dimension. RC/HRC
   * require a finite emitter; sources below the angular budget can form spokes.
   */
  lightSourceRadius: number
  /** Full-resolution scene texels represented by one logical DDA lighting pixel. */
  ddaPixelSize: number
  /** Fixed-point precision stored in each RGBA8 cascade channel. */
  ddaQuantizationBits: number
  /** Maximum linear radiance represented by a packed cascade RGB channel. */
  ddaRadianceRange: number
  /** Maximum normalized RGB delta allowed through the DDA GI filter. */
  ddaBleedThreshold: number
  /** Hue-preserving final-light posterization bands. `0` disables snapping. */
  ddaPaletteBands: number
  /** Linear-light exposure applied before palette snapping and removed afterward. */
  ddaPaletteExposure: number
  /** Include unshadowed ambient Light2D energy in the resolved transport texture. */
  includeAmbient: boolean
}

const DEFAULT_CONFIG: RadianceCascadesConfig = {
  traversal: 'sdf',
  cascadeCount: 4,
  baseRayCount: 16,
  baseInterval: 0,
  cascadeResolution: 0,
  maxAutoCascadeResolution: 512,
  raymarchSteps: 24,
  sdfHitEpsilon: 0,
  intervalOverlap: 0.1,
  filterRadius: 1,
  filterStrength: 1,
  mipBlur: 0,
  mipStrength: 0,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  lightSourceRadius: 0,
  ddaPixelSize: 4,
  ddaQuantizationBits: 8,
  ddaRadianceRange: 1,
  ddaBleedThreshold: 0.65,
  ddaPaletteBands: 0,
  ddaPaletteExposure: 16,
  includeAmbient: true,
}

/** Canonical mobile/stylized settings for integer-grid, packed RC. */
export const DDA_FIXED_RADIANCE_CASCADES_CONFIG: Readonly<Partial<RadianceCascadesConfig>> = {
  traversal: 'dda-fixed',
  cascadeCount: 4,
  baseRayCount: 16,
  maxAutoCascadeResolution: 512,
  filterRadius: 1,
  filterStrength: 1,
  mipBlur: 0.25,
  mipStrength: 0.15,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  ddaPixelSize: 4,
  ddaQuantizationBits: 8,
  ddaRadianceRange: 1,
  ddaBleedThreshold: 0.65,
  ddaPaletteBands: 0,
  ddaPaletteExposure: 16,
  includeAmbient: false,
}

export type RadianceCascadesQuality = 'fast' | 'balanced' | 'quality'

export const RADIANCE_CASCADES_PRESETS: Record<RadianceCascadesQuality, Partial<RadianceCascadesConfig>> = {
  fast: {
    cascadeCount: 3,
    baseRayCount: 4,
    maxAutoCascadeResolution: 512,
    raymarchSteps: 24,
    intervalOverlap: 0.05,
    filterRadius: 1.15,
    filterStrength: 0.7,
    mipBlur: 0,
    mipStrength: 0,
    wideDownsampleFactor: 4,
    wideLevels: 1,
  },
  balanced: {
    cascadeCount: 4,
    baseRayCount: 16,
    maxAutoCascadeResolution: 512,
    raymarchSteps: 24,
    intervalOverlap: 0.1,
    filterRadius: 1,
    filterStrength: 1,
    mipBlur: 0,
    mipStrength: 0,
    wideDownsampleFactor: 2,
    wideLevels: 1,
  },
  quality: {
    cascadeCount: 4,
    baseRayCount: 16,
    maxAutoCascadeResolution: 2048,
    raymarchSteps: 48,
    intervalOverlap: 0.12,
    filterRadius: 1.4,
    filterStrength: 0.85,
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
 * 1. For cascade = N-1 down to 0: raymarch + merge with cascade N+1
 * 2. Average all directions from cascade 0 into final irradiance texture
 */
export class RadianceCascades {
  private _config: RadianceCascadesConfig
  private _cascadeRTs: RenderTarget[] = []
  private _rawFinalRadianceRT: RenderTarget
  private _wideRadianceRT: RenderTarget
  private _wideBlurRT: RenderTarget
  private _wideRadianceRT2: RenderTarget
  private _wideBlurRT2: RenderTarget
  private _finalRadianceRT: RenderTarget
  private _emissiveRadianceRT: RenderTarget
  private _emissivePass = new EmissivePass()

  private _cascadeMaterials: NodeMaterial[] = []
  private _finalRadianceMaterial: NodeMaterial | null = null
  private _wideDownsampleMaterial: NodeMaterial | null = null
  private _wideDownsampleMaterial2: NodeMaterial | null = null
  private _wideBlurHMaterial: NodeMaterial | null = null
  private _wideBlurVMaterial: NodeMaterial | null = null
  private _wideBlurHMaterial2: NodeMaterial | null = null
  private _wideBlurVMaterial2: NodeMaterial | null = null
  private _filterRadianceMaterial: NodeMaterial | null = null
  private _generating = false

  private _worldSize = new Vector2(1, 1)
  private _worldOffset = new Vector2(0, 0)
  /** Physical processing surface. DDA derives its logical grid from this, never from world units. */
  private _processingSize = new Vector2(1, 1)
  private _hasExplicitProcessingSize = false
  private _worldSizeNode = uniform(new Vector2(1, 1))
  private _worldOffsetNode = uniform(new Vector2(0, 0))
  private _intervalOffsetNodes: UniformNode<'float', number>[] = []
  private _intervalRangeNodes: UniformNode<'float', number>[] = []
  private _finalTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode2 = uniform(new Vector2(1, 1))
  private _filterRadiusNode = uniform(1.25)
  private _filterStrengthNode = uniform(0.8)
  private _mipBlurNode = uniform(0)
  private _mipStrengthNode = uniform(0)
  private _sdfHitEpsilonNode = uniform(0.5)
  private _occlusionTextureSizeNode = uniform(new Vector2(1, 1))
  private _ddaQuantizationLevelsNode = uniform(255)
  private _ddaRadianceRangeNode = uniform(1)
  private _ddaBleedThresholdNode = uniform(0.65)
  private _ddaPaletteBandsNode = uniform(32)
  private _ddaPaletteExposureNode = uniform(16)

  private _sdfTexture: Texture | null = null
  private _occlusionTexture: Texture | null = null
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
      minFilter: this._config.traversal === 'dda-fixed' ? NearestFilter : LinearFilter,
      magFilter: this._config.traversal === 'dda-fixed' ? NearestFilter : LinearFilter,
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
    this._emissiveRadianceRT = new RenderTarget(probeCount, probeCount, {
      ...finalOptions,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    })
    this.raymarchSteps = this._config.raymarchSteps
    this.filterRadius = this._config.filterRadius
    this.filterStrength = this._config.filterStrength
    this.mipBlur = this._config.mipBlur
    this.mipStrength = this._config.mipStrength
    this.wideDownsampleFactor = this._config.wideDownsampleFactor
    this.wideLevels = this._config.wideLevels
    this.lightSourceRadius = this._config.lightSourceRadius
    this.ddaPixelSize = this._config.ddaPixelSize
    this.ddaQuantizationBits = this._config.ddaQuantizationBits
    this.ddaRadianceRange = this._config.ddaRadianceRange
    this.ddaBleedThreshold = this._config.ddaBleedThreshold
    this.ddaPaletteBands = this._config.ddaPaletteBands
    this.ddaPaletteExposure = this._config.ddaPaletteExposure

    registerDebugTexture('radiance.finalIrradiance', this._finalRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'GI final irradiance',
    })
    registerDebugTexture('radiance.emissiveSource', this._emissiveRadianceRT, 'rgba16f', {
      display: 'colors',
      label: 'Emissive sprite source pixels',
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

  get cascadeTextures(): (Texture | null)[] {
    return this._cascadeRTs.map((rt) => rt?.texture ?? null)
  }

  get finalRadianceTexture(): Texture {
    return this._finalRadianceRT.texture
  }

  get raymarchSteps(): number {
    return this._config.raymarchSteps
  }

  get traversal(): RadianceCascadesTraversal {
    return this._config.traversal
  }

  get requiresSdf(): boolean {
    return this._config.traversal === 'sdf'
  }

  get ddaPixelSize(): number {
    return this._config.ddaPixelSize
  }

  set ddaPixelSize(value: number) {
    const pixelSize = Math.max(1, Math.min(32, Math.round(value)))
    if (pixelSize === this._config.ddaPixelSize) return
    this._config.ddaPixelSize = pixelSize
    if (this._cascadeRTs.length > 0) {
      this._resizeFinalRadianceTargets()
      this._rebuildCascadeRTs()
    }
  }

  get ddaQuantizationBits(): number {
    return this._config.ddaQuantizationBits
  }

  set ddaQuantizationBits(value: number) {
    const bits = Math.max(2, Math.min(8, Math.round(value)))
    this._config.ddaQuantizationBits = bits
    this._ddaQuantizationLevelsNode.value = 2 ** bits - 1
  }

  get ddaRadianceRange(): number {
    return this._config.ddaRadianceRange
  }

  set ddaRadianceRange(value: number) {
    const range = Math.max(0.25, Math.min(16, value))
    this._config.ddaRadianceRange = range
    this._ddaRadianceRangeNode.value = range
  }

  get ddaBleedThreshold(): number {
    return this._config.ddaBleedThreshold
  }

  set ddaBleedThreshold(value: number) {
    const threshold = Math.max(0, Math.min(2, value))
    this._config.ddaBleedThreshold = threshold
    this._ddaBleedThresholdNode.value = threshold
  }

  get ddaPaletteBands(): number {
    return this._config.ddaPaletteBands
  }

  set ddaPaletteBands(value: number) {
    const wasEnabled = this._usesPaletteFilter()
    const bands = normalizeDdaPaletteBands(value)
    this._config.ddaPaletteBands = bands
    this._ddaPaletteBandsNode.value = bands
    if (wasEnabled !== this._usesPaletteFilter()) {
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
    }
  }

  get ddaPaletteExposure(): number {
    return this._config.ddaPaletteExposure
  }

  set ddaPaletteExposure(value: number) {
    const exposure = Math.max(0.25, Math.min(64, value))
    this._config.ddaPaletteExposure = exposure
    this._ddaPaletteExposureNode.value = exposure
  }

  get sdfHitEpsilon(): number {
    return this._config.sdfHitEpsilon
  }

  set sdfHitEpsilon(value: number) {
    this._config.sdfHitEpsilon = Math.max(0, value)
    this._updateSdfHitEpsilon()
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

  get lightSourceRadius(): number {
    return this._config.lightSourceRadius
  }

  set lightSourceRadius(value: number) {
    const radius = Math.max(0, value)
    if (radius === this._config.lightSourceRadius) return
    this._config.lightSourceRadius = radius
    if (this._cascadeRTs.length > 0) this._createCascadeMaterials()
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
  }

  private _usesMipFilter(): boolean {
    return this._config.mipStrength > 0
  }

  private _usesDdaFixed(): boolean {
    return this._config.traversal === 'dda-fixed'
  }

  private _usesPaletteFilter(): boolean {
    return this._usesDdaFixed() && this._config.ddaPaletteBands >= 2
  }

  /**
   * Physical direction-atlas dimensions plus the visible logical lighting grid.
   *
   * DDA always traverses one cell at a time on `outputWidth × outputHeight`.
   * The probe grid is padded only so every cascade direction block has an
   * integral extent; the final resolve crops that padding instead of stretching
   * it over the viewport.
   */
  private _transportDimensions(): {
    width: number
    height: number
    probeWidth: number
    probeHeight: number
    outputWidth: number
    outputHeight: number
  } {
    const baseResolution = this._config.cascadeResolution > 0 ? this._config.cascadeResolution : 128
    const baseAngular = Math.sqrt(this._config.baseRayCount)
    if (!this._usesDdaFixed()) {
      const probeSize = baseResolution / baseAngular
      return {
        width: baseResolution,
        height: baseResolution,
        probeWidth: probeSize,
        probeHeight: probeSize,
        outputWidth: probeSize,
        outputHeight: probeSize,
      }
    }
    const coarsestStride = 2 ** (this._config.cascadeCount - 1)
    const outputWidth = Math.max(1, Math.ceil(this._processingSize.x / this._config.ddaPixelSize))
    const outputHeight = Math.max(1, Math.ceil(this._processingSize.y / this._config.ddaPixelSize))
    const probeWidth = Math.ceil(outputWidth / coarsestStride) * coarsestStride
    const probeHeight = Math.ceil(outputHeight / coarsestStride) * coarsestStride
    return {
      width: probeWidth * baseAngular,
      height: probeHeight * baseAngular,
      probeWidth,
      probeHeight,
      outputWidth,
      outputHeight,
    }
  }

  private _ddaMaxSteps(cascadeIndex: number): number {
    const { outputWidth: gridWidth, outputHeight: gridHeight } = this._transportDimensions()
    const minCellWorldSize = Math.max(1e-6, Math.min(this._worldSize.x / gridWidth, this._worldSize.y / gridHeight))
    const intervalRange =
      this._intervalRangeNodes[cascadeIndex]?.value ?? this._effectiveBaseInterval * Math.pow(4, cascadeIndex)
    return Math.min(gridWidth + gridHeight + 1, Math.ceil((intervalRange / minCellWorldSize) * Math.SQRT2) + 3)
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
    const dimensions = this._transportDimensions()
    return dimensions.width * dimensions.height * this._config.cascadeCount
  }

  get estimatedRaymarchSampleCount(): number {
    if (!this._usesDdaFixed()) return this.estimatedRaymarchTexelCount * this._config.raymarchSteps
    const dimensions = this._transportDimensions()
    let samples = 0
    for (let cascade = 0; cascade < this._config.cascadeCount; cascade++) {
      samples += dimensions.width * dimensions.height * this._ddaMaxSteps(cascade)
    }
    return samples
  }

  get cascadeStorageBytesPerTexel(): number {
    return this._usesDdaFixed() ? 4 : 8
  }

  get estimatedCascadeStorageBytes(): number {
    return this.estimatedRaymarchTexelCount * this.cascadeStorageBytesPerTexel
  }

  private _usesLocalFilter(): boolean {
    return this._config.filterRadius > 0 && this._config.filterStrength > 0
  }

  private _usesFilteredOutput(): boolean {
    return this._usesLocalFilter() || this._usesMipFilter() || this._usesPaletteFilter()
  }

  private _usesSecondWideLevel(): boolean {
    return this._usesWideBlur() && this._config.wideLevels > 1
  }

  private _syncRawFinalMipState(): void {
    this._rawFinalRadianceRT.texture.generateMipmaps = false
    this._rawFinalRadianceRT.texture.minFilter = this._usesDdaFixed() ? NearestFilter : LinearFilter
  }

  private _resizeFinalRadianceTargets(): void {
    const { outputWidth, outputHeight } = this._transportDimensions()
    this._rawFinalRadianceRT.setSize(outputWidth, outputHeight)
    this._finalRadianceRT.setSize(outputWidth, outputHeight)
    this._emissiveRadianceRT.setSize(outputWidth, outputHeight)
    this._finalTexelSizeNode.value.set(1 / outputWidth, 1 / outputHeight)
    this._resizeWideRadianceTargets()
  }

  init(worldWidth: number, worldHeight: number, lightsTexture: DataTexture, lightCountNode: Node<'float'>): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._lightsTexture = lightsTexture
    this._lightCountNode = lightCountNode

    // Standalone users do not have a LightEffect resize lifecycle. Preserve a
    // useful 1 world-unit = 1 physical-pixel fallback until an explicit
    // processing surface is supplied.
    if (!this._hasExplicitProcessingSize) {
      this._processingSize.set(Math.max(1, Math.ceil(worldWidth)), Math.max(1, Math.ceil(worldHeight)))
    }

    // Auto-calculate cascadeResolution from world size if not explicitly set.
    // Target ~1 probe per 1.5 world units, rounded up to next power of 2.
    const baseAngular = Math.sqrt(this._config.baseRayCount)
    if (this._autoCascadeResolution) {
      const maxDim = Math.max(worldWidth, worldHeight)
      const targetProbes = maxDim / 1.5
      const targetRes = targetProbes * baseAngular
      const autoRes = Math.pow(2, Math.ceil(Math.log2(targetRes)))
      this._config.cascadeResolution =
        this._config.maxAutoCascadeResolution > 0 ? Math.min(autoRes, this._config.maxAutoCascadeResolution) : autoRes
    }

    this._updateIntervalUniforms()

    this._resizeFinalRadianceTargets()

    this._rebuildCascadeRTs()
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

    const dimensions = this._transportDimensions()
    const packed = this._usesDdaFixed()
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const rt = new RenderTarget(dimensions.width, dimensions.height, {
        type: packed ? UnsignedByteType : HalfFloatType,
        minFilter: packed ? NearestFilter : LinearFilter,
        magFilter: packed ? NearestFilter : LinearFilter,
        wrapS: ClampToEdgeWrapping,
        wrapT: ClampToEdgeWrapping,
        depthBuffer: false,
        stencilBuffer: false,
      })
      this._cascadeRTs.push(rt)
      registerDebugTexture(`radiance.cascade${i}`, rt, packed ? 'rgba8' : 'rgba16f', {
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
    }
    this._intervalOffsetNodes.length = this._config.cascadeCount
    this._intervalRangeNodes.length = this._config.cascadeCount
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

  /** Set the physical effect surface used to derive the DDA lighting grid. */
  setProcessingSize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.ceil(width))
    const nextHeight = Math.max(1, Math.ceil(height))
    this._hasExplicitProcessingSize = true
    if (nextWidth === this._processingSize.x && nextHeight === this._processingSize.y) return
    const previousDimensions = this._usesDdaFixed() ? this._transportDimensions() : null
    this._processingSize.set(nextWidth, nextHeight)
    if (!previousDimensions || this._cascadeRTs.length === 0) return
    const nextDimensions = this._transportDimensions()
    if (
      nextDimensions.width === previousDimensions.width &&
      nextDimensions.height === previousDimensions.height &&
      nextDimensions.outputWidth === previousDimensions.outputWidth &&
      nextDimensions.outputHeight === previousDimensions.outputHeight
    ) {
      return
    }
    this._resizeFinalRadianceTargets()
    this._rebuildCascadeRTs()
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

  setOcclusionTexture(texture: Texture | null): void {
    const image = texture?.image as { width?: number; height?: number } | undefined
    this._occlusionTextureSizeNode.value.set(Math.max(1, image?.width ?? 1), Math.max(1, image?.height ?? 1))
    // RenderTarget textures retain their identity across setSize(). Refresh
    // the physical texel dimensions even when the texture object is unchanged;
    // otherwise DDA can keep the constructor-time 1x1 size and sample a single
    // corner occlusion texel for the entire viewport.
    if (this._occlusionTexture === texture) return
    this._occlusionTexture = texture
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._createCascadeMaterials()
  }

  generate(
    renderer: WebGPURenderer,
    sdfTexture: Texture | null,
    occlusionTexture: Texture | null = null,
    scene?: Scene,
    camera?: OrthographicCamera
  ): void {
    if (this._generating) return
    this._generating = true
    if (sdfTexture && this._sdfTexture !== sdfTexture) {
      this._sdfTexture = sdfTexture
      this._disposeWideRadianceMaterials()
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
      this._createCascadeMaterials()
    }
    this.setOcclusionTexture(occlusionTexture)
    if (this._usesDdaFixed() && !this._occlusionTexture) {
      this._generating = false
      return
    }
    if (!this._usesDdaFixed() && !this._sdfTexture) {
      this._generating = false
      return
    }
    if (!this._usesDdaFixed()) this._updateSdfHitEpsilon()

    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState)

    try {
      this._captureEmissiveRadiance(renderer, scene, camera)

      // Process cascades from highest to lowest. Each cascade stores
      // <radiance.rgb, transmittance.a>; lower cascades merge their near
      // interval with four higher-cascade sub-rays via Eq. 7 from the paper.
      for (let i = this._config.cascadeCount - 1; i >= 0; i--) {
        this._renderCascade(renderer, i)
      }

      // Average all directions from cascade 0. When filtering is off,
      // write directly into the stable public texture and skip the copy/filter pass.
      const usesFilteredOutput = this._usesFilteredOutput()
      this._renderFinalRadiance(renderer, usesFilteredOutput ? this._rawFinalRadianceRT : this._finalRadianceRT)
      if (usesFilteredOutput) {
        if (this._usesMipFilter()) {
          this._renderWideRadiance(renderer)
        }
        this._renderFilteredRadiance(renderer)
      }
    } finally {
      RendererUtils.restoreRendererState(renderer, _rendererState)
      this._generating = false
    }
  }

  private _captureEmissiveRadiance(renderer: WebGPURenderer, scene?: Scene, camera?: OrthographicCamera): void {
    const previousColor = renderer.getClearColor(_emissiveClearColor).clone()
    const previousAlpha = renderer.getClearAlpha()
    renderer.setRenderTarget(this._emissiveRadianceRT)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.setClearColor(previousColor, previousAlpha)
    if (scene && camera) {
      this._emissivePass.render(renderer, scene, camera, this._emissiveRadianceRT, this._worldSize)
    }
  }

  private _updateSdfHitEpsilon(): void {
    if (this._config.sdfHitEpsilon > 0) {
      this._sdfHitEpsilonNode.value = this._config.sdfHitEpsilon
      return
    }
    const image = this._sdfTexture?.image as { width?: number; height?: number } | undefined
    const width = Math.max(1, image?.width ?? 1)
    const height = Math.max(1, image?.height ?? 1)
    this._sdfHitEpsilonNode.value = Math.max(this._worldSize.x / width, this._worldSize.y / height) * 0.5
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

    if ((!this._usesDdaFixed() && !this._sdfTexture) || (this._usesDdaFixed() && !this._occlusionTexture)) return
    if (!this._lightsTexture) return
    for (let i = 0; i < this._config.cascadeCount; i++) {
      const prevCascadeTex = i < this._config.cascadeCount - 1 ? (this._cascadeRTs[i + 1]?.texture ?? null) : null

      const material = this._createCascadeMaterial(i, prevCascadeTex)
      this._cascadeMaterials.push(material)
    }
  }

  private _encodeDdaFixed(value: Node<'vec4'>): Node<'vec4'> {
    if (!this._usesDdaFixed()) return value
    const levels = this._ddaQuantizationLevelsNode
    const encodedRgb = floor(value.rgb.div(this._ddaRadianceRangeNode).clamp(0, 1).mul(levels).add(float(0.5))).div(
      levels
    )
    const encodedTransmittance = floor(value.a.clamp(0, 1).mul(levels).add(float(0.5))).div(levels)
    return vec4(encodedRgb, encodedTransmittance)
  }

  private _decodeDdaFixed(value: Node<'vec4'>): Node<'vec4'> {
    if (!this._usesDdaFixed()) return value
    const levels = this._ddaQuantizationLevelsNode
    const fixedCode = floor(value.mul(levels).add(float(0.5))).clamp(0, levels)
    return vec4(fixedCode.rgb.div(levels).mul(this._ddaRadianceRangeNode), fixedCode.a.div(levels))
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
   * - Cascade merge averages 4 sub-rays from cascade N+1
   * - Uses worldToUV/uvToWorld consistently
   */
  private _createCascadeMaterial(cascadeIndex: number, prevCascadeTexture: Texture | null): NodeMaterial {
    const config = this._config
    const sdfTexture = this._sdfTexture
    const occlusionTexture = this._occlusionTexture
    const lightsTexture = this._lightsTexture!
    const lightCount = this._lightCountNode!
    const worldSize = this._worldSizeNode
    const worldOffset = this._worldOffsetNode

    const baseAngular = Math.sqrt(config.baseRayCount)
    const angular = baseAngular * Math.pow(2, cascadeIndex)
    const angularSq = angular * angular

    const dimensions = this._transportDimensions()
    const atlasWidth = dimensions.width
    const atlasHeight = dimensions.height
    const probeGroupWidth = atlasWidth / angular
    const probeGroupHeight = atlasHeight / angular
    const cascadeStride = 2 ** cascadeIndex
    const activeProbeWidth = Math.ceil(dimensions.outputWidth / cascadeStride)
    const activeProbeHeight = Math.ceil(dimensions.outputHeight / cascadeStride)
    const ddaGridWidth = dimensions.outputWidth
    const ddaGridHeight = dimensions.outputHeight
    const ddaMaxSteps = this._ddaMaxSteps(cascadeIndex)
    const sourceRadius =
      config.lightSourceRadius > 0
        ? float(config.lightSourceRadius)
        : this._usesDdaFixed()
          ? min(worldSize.x, worldSize.y)
              .mul(float(AUTO_LIGHT_SOURCE_VIEW_FRACTION))
              .max(
                min(worldSize.x.div(float(ddaGridWidth)), worldSize.y.div(float(ddaGridHeight))).mul(
                  float(AUTO_DDA_LIGHT_SOURCE_RADIUS_TEXELS)
                )
              )
          : min(worldSize.x, worldSize.y).mul(float(AUTO_LIGHT_SOURCE_VIEW_FRACTION))

    const intervalOffset = this._intervalOffsetNodes[cascadeIndex]!
    const intervalRange = this._intervalRangeNodes[cascadeIndex]!
    const raymarchSteps = config.raymarchSteps

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const fragCoord = uv().mul(vec2(float(atlasWidth), float(atlasHeight)))

      // Direction-first layout decomposition
      const probeGroupSize = vec2(float(probeGroupWidth), float(probeGroupHeight))
      const rayXY = floor(fragCoord.div(probeGroupSize))
      const probeXY = mod(fragCoord, probeGroupSize)
      const rayIndex = rayXY.x.add(rayXY.y.mul(float(angular)))

      // `fragCoord` and therefore `probeXY` are already pixel-centred
      // (`probeXY = probeIndex + 0.5`). Adding another half texel shifts the
      // traced interval away from the probe represented by this atlas texel.
      // The far-cascade lookup below is phased from the unshifted centre, so
      // that mismatch presents as parallax error and light leaking at walls.
      // Each higher cascade halves spatial probe density while doubling its
      // angular resolution. Its direction block therefore spans the complete
      // world at `cascadeStride` base-grid cells per probe. Previously every
      // level divided by the base output dimensions without this stride,
      // compressing C1/C2/C3 into 1/2, 1/4 and 1/8 of the viewport. The merge
      // then produced repeated quadrants, Y-displaced sources and X-shaped
      // energy. Padding only duplicates the final active probe.
      const activeProbeXY = probeXY.clamp(
        vec2(0.5),
        vec2(float(activeProbeWidth - 0.5), float(activeProbeHeight - 0.5))
      )
      const probeUV = activeProbeXY
        .mul(float(cascadeStride))
        .div(vec2(float(dimensions.outputWidth), float(dimensions.outputHeight)))
        .clamp(0, 1)
      const probeLocalPos = probeUV.mul(worldSize)
      const probeWorldPos = probeLocalPos.add(worldOffset)

      const theta = rayIndex.add(float(0.5)).mul(float(TAU / angularSq))
      const rayDir = vec2(cos(theta), sin(theta))

      const segmentStart = probeWorldPos.add(rayDir.mul(intervalOffset))
      const segmentStartLocal = probeLocalPos.add(rayDir.mul(intervalOffset))
      const source = traceAnalyticLightSources(
        lightsTexture,
        lightCount,
        segmentStart,
        rayDir,
        intervalRange,
        sourceRadius
      )
      const traceLimit = source.hit.greaterThan(float(0.5)).select(source.distance, intervalRange)
      const intervalRadiance = vec3(0).toVar()
      const intervalTransmittance = float(1).toVar()
      const t = float(0).toVar()
      const reachedTraceLimit = float(0).toVar()

      if (this._usesDdaFixed() && occlusionTexture) {
        // The binary occlusion and emissive targets are camera-local grids.
        // Traverse them in that local space instead of repeatedly subtracting
        // a potentially large/negative map-space camera origin inside the DDA
        // walk. Analytic lights above remain world-space; distances and ray
        // directions are translation invariant, so both paths share the same
        // trace limit without mixing coordinate spaces.
        const localOrigin = vec2(0)
        const boundsInterval = rayBoundsInterval(segmentStartLocal, rayDir, worldSize, localOrigin)
        const traceEntry = boundsInterval.x.max(float(0))
        const traceExit = boundsInterval.y.min(traceLimit)
        const intersectsWorld = traceExit.greaterThanEqual(traceEntry)
        const visibility = traceDdaIntegerRadiance(
          occlusionTexture,
          this._occlusionTextureSizeNode,
          this._emissiveRadianceRT.texture,
          segmentStartLocal,
          rayDir,
          traceEntry,
          traceExit,
          intersectsWorld,
          worldSize,
          localOrigin,
          ddaGridWidth,
          ddaGridHeight,
          ddaMaxSteps
        )
        intervalRadiance.assign(visibility.rgb)
        intervalTransmittance.assign(
          visibility.a
            .lessThan(float(-0.5))
            .or(visibility.a.greaterThan(float(1.5)))
            .select(float(0), float(1))
        )
        reachedTraceLimit.assign(
          visibility.a
            .greaterThan(float(0.5))
            .and(visibility.a.lessThan(float(1.5)))
            .select(float(1), float(0))
        )
      } else if (sdfTexture) {
        Loop(raymarchSteps, () => {
          const sampleWorld = segmentStart.add(rayDir.mul(t))
          const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)

          // Bounds check
          const outOfBounds = sampleUV.x
            .lessThan(0)
            .or(sampleUV.x.greaterThan(1))
            .or(sampleUV.y.lessThan(0))
            .or(sampleUV.y.greaterThan(1))

          If(outOfBounds, () => {
            // Leaving the scene texture is empty space, not an occluder. The
            // interval is complete and remains transmissive.
            reachedTraceLimit.assign(float(1))
            Break()
          })

          const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
          const sdfSample = sampleTexture(sdfTexture, sdfUV)
          const sdfDist = sdfSample.r

          If(sdfDist.lessThan(this._sdfHitEpsilonNode), () => {
            intervalTransmittance.assign(float(0))
            Break()
          })

          const stepLen = min(sdfDist.max(float(0.001)), traceLimit.sub(t).max(float(0)))
          t.addAssign(stepLen)

          If(t.greaterThanEqual(traceLimit), () => {
            reachedTraceLimit.assign(float(1))
            Break()
          })
        })
      }

      // Exhausting a fixed sphere-trace budget is not evidence of an
      // occluder. Preserve transmittance for the parent cascade, but only add
      // an analytic source after the marcher actually reached its distance.
      If(
        intervalTransmittance
          .greaterThan(float(0.5))
          .and(reachedTraceLimit.greaterThan(float(0.5)))
          .and(source.hit.greaterThan(float(0.5))),
        () => {
          intervalRadiance.assign(source.radiance)
          intervalTransmittance.assign(float(0))
        }
      )

      const mergedRadiance = vec3(intervalRadiance).toVar()
      const mergedTransmittance = float(intervalTransmittance).toVar()

      if (prevCascadeTexture && cascadeIndex < config.cascadeCount - 1) {
        If(intervalTransmittance.greaterThan(float(0)), () => {
          const angularN1 = angular * 2
          const probeGroupWidthN1 = atlasWidth / angularN1
          const probeGroupHeightN1 = atlasHeight / angularN1
          const parentStride = cascadeStride * 2
          const activeProbeWidthN1 = Math.ceil(dimensions.outputWidth / parentStride)
          const activeProbeHeightN1 = Math.ceil(dimensions.outputHeight / parentStride)

          // Map probe position from this cascade to next cascade's probe space.
          // N+1 has half the probes per direction block (double angular resolution).
          // Preserve the current probe's screen-space centre in the coarser
          // grid. Clamp inside this direction block: the render target only
          // clamps at its outer edge, so an unclamped hardware-filtered sample
          // could otherwise blend with an adjacent direction block.
          const probeN1 = probeXY
            .mul(float(0.5))
            .clamp(vec2(0.5), vec2(float(activeProbeWidthN1 - 0.5), float(activeProbeHeightN1 - 0.5)))

          const farRadiance = vec3(0).toVar()
          const farTransmittance = float(0).toVar()

          for (let subRay = 0; subRay < 4; subRay++) {
            const subRayIndex = rayIndex.mul(float(4)).add(float(subRay))
            const rayN1XY = vec2(mod(subRayIndex, float(angularN1)), floor(subRayIndex.div(float(angularN1))))

            // Compute full texel position, then convert to UV for bilinear sampling.
            // textureLoad and sampleTexture share the same coordinate origin for
            // render targets in WebGPU — no Y-flip needed.
            const texelPos = rayN1XY.mul(vec2(float(probeGroupWidthN1), float(probeGroupHeightN1))).add(probeN1)
            const mergeUV = texelPos.div(vec2(float(atlasWidth), float(atlasHeight)))
            const mergedSample = this._decodeDdaFixed(sampleTexture(prevCascadeTexture, mergeUV))
            farRadiance.addAssign(mergedSample.rgb)
            farTransmittance.addAssign(mergedSample.a)
          }

          farRadiance.mulAssign(float(0.25))
          farTransmittance.mulAssign(float(0.25))
          mergedRadiance.addAssign(mergedTransmittance.mul(farRadiance))
          mergedTransmittance.mulAssign(farTransmittance)
        })
      }

      return this._encodeDdaFixed(vec4(mergedRadiance, mergedTransmittance))
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
    if (!this._lightsTexture || !this._lightCountNode) return

    const cascade0Texture = this._cascadeRTs[0].texture
    const lightsTexture = this._lightsTexture
    const lightCount = this._lightCountNode
    const config = this._config
    const baseAngular = Math.sqrt(config.baseRayCount)
    const angular = baseAngular // Cascade 0 angular
    const angularSq = angular * angular
    const dimensions = this._transportDimensions()
    const atlasWidth = dimensions.width
    const atlasHeight = dimensions.height
    const probeGroupWidth = atlasWidth / angular
    const probeGroupHeight = atlasHeight / angular

    this._finalRadianceMaterial = new NodeMaterial()
    this._finalRadianceMaterial.fragmentNode = Fn(() => {
      // Map final RT UV → probe position in cascade 0
      const probeXY = uv().mul(vec2(float(probeGroupWidth), float(probeGroupHeight)))

      const irradiance = vec3(0).toVar()

      // Unrolled loop: average all direction blocks
      for (let dirY = 0; dirY < angular; dirY++) {
        for (let dirX = 0; dirX < angular; dirX++) {
          const lookupCoord = vec2(
            float(dirX * probeGroupWidth).add(probeXY.x),
            float(dirY * probeGroupHeight).add(probeXY.y)
          )
          const lookupUV = lookupCoord.div(vec2(float(atlasWidth), float(atlasHeight)))
          const sample = this._decodeDdaFixed(sampleTexture(cascade0Texture, lookupUV))
          irradiance.addAssign(sample.rgb)
        }
      }

      irradiance.divAssign(float(angularSq))
      if (config.includeAmbient) irradiance.addAssign(collectAmbientRadiance(lightsTexture, lightCount))

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
      this._wideDownsampleMaterial && (!needsWideBlur || (this._wideBlurHMaterial && this._wideBlurVMaterial))
    const hasSecondLevel = this._wideDownsampleMaterial2 && this._wideBlurHMaterial2 && this._wideBlurVMaterial2
    if (hasFirstLevel && (!this._usesSecondWideLevel() || hasSecondLevel)) {
      return
    }
    if ((!this._usesDdaFixed() && !this._sdfTexture) || (this._usesDdaFixed() && !this._occlusionTexture)) return

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
    const sdfTexture = this._sdfTexture
    const occlusionTexture = this._occlusionTexture
    const usesDda = this._usesDdaFixed()
    const texelSize = sourceTexelSize
    const radius = this._filterRadiusNode

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const centerUV = uv()
      const center = sampleTexture(sourceTexture, centerUV)
      const pointIsOpen = (pointUV: Node<'vec2'>): Node<'bool'> =>
        usesDda
          ? sampleTexture(occlusionTexture!, vec2(pointUV.x, float(1).sub(pointUV.y))).a.lessThan(float(0.5))
          : sampleTexture(sdfTexture!, vec2(pointUV.x, float(1).sub(pointUV.y))).r.greaterThan(this._sdfHitEpsilonNode)
      const centerOpen = pointIsOpen(centerUV)

      const total = vec3(center.rgb).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()

      const sampleNeighbor = (dx: number, dy: number, baseWeight: number): void => {
        const offset = vec2(dx, dy).mul(texelSize).mul(radius)
        const neighborUV = centerUV.add(offset).clamp(0, 1)
        const midpointUV = centerUV.add(offset.mul(float(0.5))).clamp(0, 1)
        const visible = centerOpen.and(pointIsOpen(neighborUV)).and(pointIsOpen(midpointUV))
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
    if ((!this._usesDdaFixed() && !this._sdfTexture) || (this._usesDdaFixed() && !this._occlusionTexture)) return

    const rawFinalTexture = this._rawFinalRadianceRT.texture
    const sdfTexture = this._sdfTexture
    const occlusionTexture = this._occlusionTexture
    const usesDda = this._usesDdaFixed()
    const texelSize = this._finalTexelSizeNode
    const radius = this._filterRadiusNode
    const strength = this._filterStrengthNode
    const useLocalFilter = this._usesLocalFilter()
    const useWideFilter = this._usesMipFilter()
    const useSecondWideLevel = this._usesSecondWideLevel()
    const mipStrength = this._mipStrengthNode
    const ddaBleedThreshold = this._ddaBleedThresholdNode
    const ddaPaletteBands = this._ddaPaletteBandsNode
    const ddaPaletteExposure = this._ddaPaletteExposureNode

    this._filterRadianceMaterial = new NodeMaterial()
    this._filterRadianceMaterial.fragmentNode = Fn(() => {
      const centerUV = uv()
      const center = sampleTexture(rawFinalTexture, centerUV)
      const pointIsOpen = (pointUV: Node<'vec2'>): Node<'bool'> =>
        usesDda
          ? sampleTexture(occlusionTexture!, vec2(pointUV.x, float(1).sub(pointUV.y))).a.lessThan(float(0.5))
          : sampleTexture(sdfTexture!, vec2(pointUV.x, float(1).sub(pointUV.y))).r.greaterThan(this._sdfHitEpsilonNode)
      const centerOpen = pointIsOpen(centerUV)
      const centerSDF = usesDda ? float(0) : sampleTexture(sdfTexture!, vec2(centerUV.x, float(1).sub(centerUV.y))).r

      const paletteQuantize = (color: Node<'vec3'>): Node<'vec3'> => {
        if (!this._usesPaletteFilter()) return color
        const luma = color.r
          .mul(float(0.2126))
          .add(color.g.mul(float(0.7152)))
          .add(color.b.mul(float(0.0722)))
        const exposedLuma = luma.mul(ddaPaletteExposure)
        const compressed = exposedLuma.div(float(1).add(exposedLuma))
        const snappedCompressed = floor(compressed.mul(ddaPaletteBands))
          .min(ddaPaletteBands.sub(float(1)))
          .div(ddaPaletteBands)
        const snappedLuma = snappedCompressed
          .div(float(1).sub(snappedCompressed).max(float(0.0001)))
          .div(ddaPaletteExposure)
        const scale = luma.greaterThan(float(0.0001)).select(snappedLuma.div(luma), float(0))
        return color.mul(scale)
      }

      const total = vec3(center.rgb).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()
      const sampleNeighbor = (dx: number, dy: number, baseWeight: number): void => {
        const offset = vec2(dx, dy).mul(texelSize).mul(radius)
        const neighborUV = centerUV.add(offset).clamp(0, 1)
        const midpointUV = centerUV.add(offset.mul(float(0.5))).clamp(0, 1)
        const sample = sampleTexture(rawFinalTexture, neighborUV)
        // Keep the filter from crossing silhouettes; DDA also rejects large
        // normalized color deltas so black grid shadows remain attached.
        const visible = centerOpen.and(pointIsOpen(neighborUV)).and(pointIsOpen(midpointUV))
        const colorDelta = sample.rgb.sub(center.rgb).length()
        const colorMagnitude = sample.rgb.length().max(center.rgb.length()).max(float(0.05))
        const colorAccepted = usesDda ? colorDelta.div(colorMagnitude).lessThan(ddaBleedThreshold) : visible
        const weight = visible.and(colorAccepted).select(float(baseWeight), float(0))
        total.addAssign(sample.rgb.mul(weight))
        totalWeight.addAssign(weight)
      }

      if (useLocalFilter) {
        sampleNeighbor(1, 0, 2)
        sampleNeighbor(-1, 0, 2)
        sampleNeighbor(0, 1, 2)
        sampleNeighbor(0, -1, 2)
        sampleNeighbor(1, 1, 1)
        sampleNeighbor(-1, 1, 1)
        sampleNeighbor(1, -1, 1)
        sampleNeighbor(-1, -1, 1)
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
          const veryOpenArea = usesDda
            ? centerOpen.select(float(1), float(0))
            : smoothstep(this._sdfHitEpsilonNode.mul(float(8)), this._sdfHitEpsilonNode.mul(float(48)), centerSDF)
          mipFiltered.assign(mix(wide1.rgb, wide2.rgb, veryOpenArea.mul(this._mipBlurNode)))
        }
        const openArea = usesDda
          ? centerOpen.select(float(1), float(0))
          : smoothstep(this._sdfHitEpsilonNode.mul(float(2)), this._sdfHitEpsilonNode.mul(float(16)), centerSDF)
        const wideColorDelta = mipFiltered.sub(center.rgb).length()
        const wideColorMagnitude = mipFiltered.length().max(center.rgb.length()).max(float(0.05))
        const wideAccepted = usesDda
          ? wideColorDelta.div(wideColorMagnitude).lessThan(ddaBleedThreshold).select(float(1), float(0))
          : float(1)
        const mipMix = mipStrength.mul(openArea).mul(wideAccepted)
        const mixed = mix(crossFiltered, mipFiltered, mipMix)
        return vec4(paletteQuantize(mixed), center.a)
      }

      return vec4(paletteQuantize(crossFiltered), center.a)
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

    unregisterDebugTexture('radiance.emissiveSource')
    this._emissiveRadianceRT.dispose()
    this._emissivePass.dispose()

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
  }
}
