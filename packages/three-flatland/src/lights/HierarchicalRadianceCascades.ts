import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  RenderTarget,
  UnsignedByteType,
  Vector2,
  type DataTexture,
  type OrthographicCamera,
  type Scene,
  type Texture,
} from 'three'
import { NodeMaterial, QuadMesh, RendererUtils, type WebGPURenderer } from 'three/webgpu'
import { beginDebugPass, endDebugPass, registerDebugTexture, unregisterDebugTexture } from '../debug/debug-sink'
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
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js'
import {
  RadianceCascades,
  collectAmbientRadiance,
  getSharedBlueNoiseTexture,
  RADIANCE_CASCADES_PRESETS,
  traceAnalyticLightSources,
  type RadianceCascadesConfig,
  type RadianceCascadesQuality,
} from './RadianceCascades'
import { worldToUV, uvToWorld } from './coordUtils'
import { rayBoundsInterval } from './ddaGrid'

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
const BLUE_NOISE_SIZE = 32
const AUTO_LIGHT_SOURCE_VIEW_FRACTION = 0.02
const AUTO_DDA_LIGHT_SOURCE_RADIUS_TEXELS = 4
const _quadMesh = new QuadMesh()
let _rendererState: ReturnType<typeof RendererUtils.resetRendererState>

function normalizeHolographicResolutionScale(value: number): 1 | 2 | 4 {
  const rounded = Math.max(1, Math.min(4, Math.round(value)))
  return rounded >= 3 ? 4 : (rounded as 1 | 2)
}

function normalizeDdaPaletteBands(value: number): number {
  if (!Number.isFinite(value) || value < 2) return 0
  return Math.max(2, Math.min(64, Math.round(value)))
}

/**
 * Traverse the binary occlusion mask one deliberately coarse grid cell at a
 * time. Geometry stays floating point in this oracle backend, but cell
 * coordinates and mask reads are discrete so later fixed-point backends have
 * an exact behavioral reference.
 *
 * Returns `<transmittance, reachedTraceLimit>`.
 */
function traceDdaFloatOcclusion(
  occlusionTexture: Texture,
  occlusionTextureSize: Node<'vec2'>,
  rayOrigin: Node<'vec2'>,
  rayDirection: Node<'vec2'>,
  traceEntry: Node<'float'>,
  traceExit: Node<'float'>,
  intersectsWorld: Node<'bool'>,
  worldSize: Node<'vec2'>,
  worldOffset: Node<'vec2'>,
  gridSize: Node<'vec2'>,
  maxSteps: number
): Node<'vec2'> {
  const entryWorld = rayOrigin.add(rayDirection.mul(traceEntry))
  const entryWorldUV = worldToUV(entryWorld, worldSize, worldOffset).clamp(0, 1)
  const entryTextureUV = vec2(entryWorldUV.x, float(1).sub(entryWorldUV.y))
  const gridPosition = entryTextureUV.mul(gridSize).clamp(vec2(0), gridSize.sub(float(0.0001)))
  const cell = floor(gridPosition).toVar()
  const gridDirection = vec2(rayDirection.x.div(worldSize.x), rayDirection.y.div(worldSize.y).mul(float(-1))).mul(
    gridSize
  )
  const parallelX = gridDirection.x.abs().lessThan(float(1e-8))
  const parallelY = gridDirection.y.abs().lessThan(float(1e-8))
  const safeDirection = vec2(
    parallelX.select(float(1e-8), gridDirection.x),
    parallelY.select(float(1e-8), gridDirection.y)
  )
  const stepDirection = vec2(
    gridDirection.x.greaterThanEqual(float(0)).select(float(1), float(-1)),
    gridDirection.y.greaterThanEqual(float(0)).select(float(1), float(-1))
  )
  const tDelta = vec2(1).div(safeDirection.abs())
  const nextBoundary = vec2(
    stepDirection.x.greaterThan(float(0)).select(cell.x.add(float(1)).sub(gridPosition.x), gridPosition.x.sub(cell.x)),
    stepDirection.y.greaterThan(float(0)).select(cell.y.add(float(1)).sub(gridPosition.y), gridPosition.y.sub(cell.y))
  )
  const tMax = nextBoundary.mul(tDelta).toVar()
  const traceSpan = traceExit.sub(traceEntry).max(float(0))
  const transmittance = float(1).toVar()
  const reachedTraceLimit = intersectsWorld.not().select(float(1), float(0)).toVar()

  Loop(maxSteps, () => {
    If(intersectsWorld.not(), () => {
      Break()
    })

    const inBounds = cell.x
      .greaterThanEqual(float(0))
      .and(cell.x.lessThan(gridSize.x))
      .and(cell.y.greaterThanEqual(float(0)))
      .and(cell.y.lessThan(gridSize.y))
    If(inBounds.not(), () => {
      reachedTraceLimit.assign(float(1))
      Break()
    })

    const texel = floor(cell.add(float(0.5)).div(gridSize).mul(occlusionTextureSize)).clamp(
      vec2(0),
      occlusionTextureSize.sub(float(1))
    )
    const occupied = textureLoad(occlusionTexture, ivec2(int(texel.x), int(texel.y))).a.greaterThan(float(0.5))
    If(occupied, () => {
      transmittance.assign(float(0))
      Break()
    })

    const nextT = min(tMax.x, tMax.y)
    If(nextT.greaterThanEqual(traceSpan), () => {
      reachedTraceLimit.assign(float(1))
      Break()
    })

    const stepX = tMax.x.lessThanEqual(tMax.y)
    If(stepX, () => {
      cell.x.addAssign(stepDirection.x)
      tMax.x.addAssign(tDelta.x)
    })
    If(stepX.not(), () => {
      cell.y.addAssign(stepDirection.y)
      tMax.y.addAssign(tDelta.y)
    })
  })

  return vec2(transmittance, reachedTraceLimit)
}

/**
 * Integer supercover traversal between quantized lighting-grid cells.
 *
 * The comparison `(2 * stepX + 1) * deltaY` versus
 * `(2 * stepY + 1) * deltaX` is the cross-multiplied form of the next
 * vertical/horizontal boundary time. It avoids division and keeps the walk in
 * integer arithmetic after the world-space endpoints have been quantized.
 * Corner crossings conservatively test both side-adjacent cells before moving
 * diagonally so a one-cell wall cannot leak light through a shared corner.
 *
 * Returns `<transmittance, reachedTraceLimit>`.
 */
function traceDdaIntegerOcclusion(
  occlusionTexture: Texture,
  occlusionTextureSize: Node<'vec2'>,
  rayOrigin: Node<'vec2'>,
  rayDirection: Node<'vec2'>,
  traceEntry: Node<'float'>,
  traceExit: Node<'float'>,
  intersectsWorld: Node<'bool'>,
  worldSize: Node<'vec2'>,
  worldOffset: Node<'vec2'>,
  gridWidth: number,
  gridHeight: number,
  maxSteps: number
): Node<'vec2'> {
  const gridSize = vec2(float(gridWidth), float(gridHeight))
  const gridMax = ivec2(int(gridWidth - 1), int(gridHeight - 1))
  const worldToCell = (worldPosition: Node<'vec2'>): Node<'ivec2'> => {
    const worldUV = worldToUV(worldPosition, worldSize, worldOffset).clamp(0, 1)
    const textureUV = vec2(worldUV.x, float(1).sub(worldUV.y))
    const cell = floor(textureUV.mul(gridSize)).clamp(vec2(0), gridSize.sub(float(0.0001)))
    return ivec2(int(cell.x), int(cell.y))
  }
  const occupiedAt = (cell: Node<'ivec2'>): Node<'bool'> => {
    const clampedCell = ivec2(
      cell.x.lessThan(int(0)).select(int(0), cell.x.greaterThan(gridMax.x).select(gridMax.x, cell.x)),
      cell.y.lessThan(int(0)).select(int(0), cell.y.greaterThan(gridMax.y).select(gridMax.y, cell.y))
    )
    const texelFloat = floor(vec2(clampedCell).add(float(0.5)).div(gridSize).mul(occlusionTextureSize)).clamp(
      vec2(0),
      occlusionTextureSize.sub(float(1))
    )
    const inBounds = cell.x
      .greaterThanEqual(int(0))
      .and(cell.x.lessThanEqual(gridMax.x))
      .and(cell.y.greaterThanEqual(int(0)))
      .and(cell.y.lessThanEqual(gridMax.y))
    return inBounds.and(
      textureLoad(occlusionTexture, ivec2(int(texelFloat.x), int(texelFloat.y))).a.greaterThan(float(0.5))
    )
  }

  const startWorld = rayOrigin.add(rayDirection.mul(traceEntry))
  const endWorld = rayOrigin.add(rayDirection.mul(traceExit))
  const cell = worldToCell(startWorld).toVar()
  const endCell = worldToCell(endWorld)
  const delta = ivec2(endCell.x.sub(cell.x).abs(), endCell.y.sub(cell.y).abs())
  const stepDirection = ivec2(
    endCell.x.greaterThan(cell.x).select(int(1), endCell.x.lessThan(cell.x).select(int(-1), int(0))),
    endCell.y.greaterThan(cell.y).select(int(1), endCell.y.lessThan(cell.y).select(int(-1), int(0)))
  )
  const advancedX = int(0).toVar()
  const advancedY = int(0).toVar()
  const transmittance = float(1).toVar()
  const reachedTraceLimit = intersectsWorld.not().select(float(1), float(0)).toVar()

  Loop(maxSteps, () => {
    If(intersectsWorld.not(), () => {
      Break()
    })

    If(occupiedAt(cell), () => {
      transmittance.assign(float(0))
      Break()
    })

    const reachedEnd = cell.x.equal(endCell.x).and(cell.y.equal(endCell.y))
    If(reachedEnd, () => {
      reachedTraceLimit.assign(float(1))
      Break()
    })

    const onlyY = delta.x.equal(int(0))
    const onlyX = delta.y.equal(int(0))
    const crossingX = advancedX.mul(int(2)).add(int(1)).mul(delta.y)
    const crossingY = advancedY.mul(int(2)).add(int(1)).mul(delta.x)
    const stepX = onlyY.not().and(onlyX.or(crossingX.lessThan(crossingY)))
    const stepY = onlyX.not().and(onlyY.or(crossingY.lessThan(crossingX)))
    const stepCorner = onlyX.not().and(onlyY.not()).and(crossingX.equal(crossingY))

    If(stepCorner, () => {
      const neighborX = ivec2(cell.x.add(stepDirection.x), cell.y)
      const neighborY = ivec2(cell.x, cell.y.add(stepDirection.y))
      If(occupiedAt(neighborX).or(occupiedAt(neighborY)), () => {
        transmittance.assign(float(0))
        Break()
      })
      cell.x.addAssign(stepDirection.x)
      cell.y.addAssign(stepDirection.y)
      advancedX.addAssign(int(1))
      advancedY.addAssign(int(1))
    })
    If(stepX, () => {
      cell.x.addAssign(stepDirection.x)
      advancedX.addAssign(int(1))
    })
    If(stepY, () => {
      cell.y.addAssign(stepDirection.y)
      advancedY.addAssign(int(1))
    })
  })

  return vec2(transmittance, reachedTraceLimit)
}

export type HierarchicalRadianceCascadesQuality = RadianceCascadesQuality

export type HierarchicalRadianceCascadesMode = 'hierarchical' | 'holographic'
export type HolographicRadianceCascadesTraversal = 'sdf' | 'dda-float' | 'dda-integer' | 'dda-fixed'

export interface HolographicRadianceCascadesLevelInfo {
  /** HRC cascade level `n` from the paper. */
  level: number
  /** Final irradiance/probe columns represented by this HRC hierarchy. */
  outputWidth: number
  /** Final irradiance/probe rows represented by this HRC hierarchy. */
  outputHeight: number
  /** Square display dimension reconstructed from the eight parity/rotation segments. */
  outputMaxDimension: number
  /** Probe columns after decimating only along the quadrant-facing axis. */
  probeWidth: number
  /** Probe rows; spatial resolution perpendicular to the quadrant is preserved. */
  probeHeight: number
  /** Number of transfer directions `k = 0..2^n`. */
  transferDirectionCount: number
  /** Number of radiance cones `i = 0..2^n-1`. */
  radianceDirectionCount: number
  /** Transfer values for one parity/rotation segment at this level. */
  transferValueCount: number
  /** Radiance values for one parity/rotation segment at this level. */
  radianceValueCount: number
  /** Packed transfer atlas width for all edge directions in one segment row. */
  transferAtlasWidth: number
  /** Packed transfer atlas height with eight parity/rotation segments stacked vertically. */
  transferAtlasHeight: number
  /** Packed radiance atlas width for all cones in one segment row. `0` for terminal `R_N`. */
  radianceAtlasWidth: number
  /** Packed radiance atlas height with eight parity/rotation segments stacked vertically. */
  radianceAtlasHeight: number
}

export interface HierarchicalRadianceCascadesConfig extends RadianceCascadesConfig {
  /** @deprecated Failed stochastic angular experiment; retained until the legacy composer is deleted. */
  angularJitter: boolean
  /** @deprecated Failed stochastic angular experiment; retained until the legacy composer is deleted. */
  blueNoiseStrength: number
  /** @deprecated HRC uses the reference cardinal cleanup kernel. */
  filterDiagonals: boolean
  /** @deprecated Failed stochastic filter experiment. */
  filterJitterStrength: number
  /** Short base intervals composed into longer transfer instead of raymarching every interval directly. */
  shortIntervalCount: number
  /** Number of interval-composition levels after the base short-interval atlas. */
  compositionLevels: number
  /** HRC composition family: experimental interval composition or Holographic transfer/radiance recursion. */
  compositionMode: HierarchicalRadianceCascadesMode
  /** Direct visibility backend used by Holographic T0-T2 and final R0 reconstruction. */
  holographicTraversal: HolographicRadianceCascadesTraversal
  /** Full-resolution HRC texels grouped into one logical DDA lighting pixel. */
  ddaPixelSize: number
  /** Maximum normalized RGB delta allowed to bleed between neighboring DDA lighting pixels. */
  ddaBleedThreshold: number
  /** Fixed-point precision used for packed DDA transfer/radiance atlas channels. */
  ddaQuantizationBits: number
  /** Maximum linear radiance represented by one packed transfer RGB channel. */
  ddaTransferRange: number
  /** Maximum integrated radiance represented by one packed R0 RGB channel. */
  ddaRadianceRange: number
  /** Hue-preserving final-light posterization bands. `0` disables palette snapping. */
  ddaPaletteBands: number
  /** Linear-light exposure applied before palette snapping and removed afterward. */
  ddaPaletteExposure: number
  /**
   * Multiplier for the complete Holographic hierarchy resolution relative to
   * the legacy RC probe-grid resolution. This is not a final upscaler: doubling
   * it rebuilds the segment pyramid at 4x the texels. With 16 base RC rays,
   * `4` matches the cascade/display resolution used by the HRC reference.
   * Integer/fixed DDA modes ignore this value and derive their complete square
   * hierarchy directly from `max(processingWidth, processingHeight) / ddaPixelSize`.
   */
  holographicFinalResolutionScale: number
}

const DEFAULT_HRC_CONFIG: HierarchicalRadianceCascadesConfig = {
  traversal: 'sdf',
  cascadeCount: 4,
  baseRayCount: 16,
  baseInterval: 0,
  cascadeResolution: 0,
  maxAutoCascadeResolution: 512,
  angularJitter: false,
  raymarchSteps: 24,
  sdfHitEpsilon: 0,
  blueNoiseStrength: 0,
  intervalOverlap: 0,
  // Amitabha's reference cleanup is center weight 1 plus four cardinal taps
  // at 0.25. Our center-4/cardinal-1 kernel with full strength is equivalent.
  filterRadius: 1,
  filterStrength: 1,
  filterDiagonals: false,
  filterJitterStrength: 0,
  // A small, SDF-gated wide reconstruction blend suppresses the remaining
  // half-float/display contour steps without replacing the local HRC result.
  // Larger blends visibly detach shadows from their occluders.
  mipBlur: 0.25,
  mipStrength: 0.15,
  wideDownsampleFactor: 2,
  wideLevels: 1,
  lightSourceRadius: 0,
  includeAmbient: true,
  shortIntervalCount: 4,
  compositionLevels: 2,
  compositionMode: 'holographic',
  holographicTraversal: 'sdf',
  ddaPixelSize: 4,
  ddaBleedThreshold: 0.65,
  ddaQuantizationBits: 8,
  ddaTransferRange: 4,
  ddaRadianceRange: 1,
  ddaPaletteBands: 32,
  ddaPaletteExposure: 16,
  holographicFinalResolutionScale: 4,
}

export const HIERARCHICAL_RADIANCE_CASCADES_PRESETS = {
  fast: {
    ...RADIANCE_CASCADES_PRESETS.fast,
    maxAutoCascadeResolution: 512,
    angularJitter: false,
    blueNoiseStrength: 0,
    intervalOverlap: 0,
    filterRadius: 1,
    filterStrength: 1,
    filterDiagonals: false,
    filterJitterStrength: 0,
    mipBlur: 0,
    mipStrength: 0,
    shortIntervalCount: 4,
    compositionLevels: 2,
    compositionMode: 'holographic',
    holographicTraversal: 'sdf',
    ddaPixelSize: 8,
    ddaBleedThreshold: 0.65,
    ddaQuantizationBits: 5,
    ddaTransferRange: 4,
    ddaRadianceRange: 1,
    ddaPaletteBands: 0,
    ddaPaletteExposure: 16,
    holographicFinalResolutionScale: 1,
  },
  balanced: {
    ...RADIANCE_CASCADES_PRESETS.balanced,
    maxAutoCascadeResolution: 512,
    angularJitter: false,
    raymarchSteps: 24,
    blueNoiseStrength: 0,
    intervalOverlap: 0,
    filterRadius: 1,
    filterStrength: 1,
    filterDiagonals: false,
    filterJitterStrength: 0,
    mipBlur: 0.25,
    mipStrength: 0.15,
    shortIntervalCount: 4,
    compositionLevels: 2,
    compositionMode: 'holographic',
    holographicTraversal: 'sdf',
    ddaPixelSize: 4,
    ddaBleedThreshold: 0.65,
    ddaQuantizationBits: 8,
    ddaTransferRange: 4,
    ddaRadianceRange: 1,
    ddaPaletteBands: 32,
    ddaPaletteExposure: 16,
    holographicFinalResolutionScale: 4,
  },
  quality: {
    ...RADIANCE_CASCADES_PRESETS.quality,
    // A 1024px full HRC pyramid is currently too expensive for a generally
    // safe preset. Keep the validated 512px ceiling and spend quality on the
    // reference-resolution hierarchy instead.
    maxAutoCascadeResolution: 512,
    angularJitter: false,
    raymarchSteps: 32,
    blueNoiseStrength: 0,
    intervalOverlap: 0,
    filterRadius: 1,
    filterStrength: 1,
    filterDiagonals: false,
    filterJitterStrength: 0,
    mipBlur: 0.25,
    mipStrength: 0.15,
    wideLevels: 1,
    shortIntervalCount: 8,
    compositionLevels: 3,
    compositionMode: 'holographic',
    holographicTraversal: 'sdf',
    ddaPixelSize: 2,
    ddaBleedThreshold: 0.65,
    ddaQuantizationBits: 8,
    ddaTransferRange: 4,
    ddaRadianceRange: 1,
    ddaPaletteBands: 0,
    ddaPaletteExposure: 16,
    holographicFinalResolutionScale: 4,
  },
} satisfies Record<HierarchicalRadianceCascadesQuality, Partial<HierarchicalRadianceCascadesConfig>>

export function createHierarchicalRadianceCascadesConfig(
  quality: HierarchicalRadianceCascadesQuality = 'balanced',
  overrides: Partial<HierarchicalRadianceCascadesConfig> = {}
): Partial<HierarchicalRadianceCascadesConfig> {
  return { ...HIERARCHICAL_RADIANCE_CASCADES_PRESETS[quality], ...overrides }
}

/**
 * Configuration boundary for the Holographic Radiance Cascades renderer.
 *
 * This class is intentionally separate from `RadianceCascades`. It is not a
 * subclass with different defaults: paper HRC builds its eight-segment transfer
 * and radiance pyramids here. The older short-interval composition experiment is
 * retained as the `hierarchical` compatibility mode.
 */
export class HierarchicalRadianceCascades {
  readonly algorithm = 'interval-composition'
  private _config: HierarchicalRadianceCascadesConfig
  private _referenceHierarchy: RadianceCascades
  private _shortIntervalAtlasRT: RenderTarget
  private _compositionRTs: [RenderTarget, RenderTarget]
  private _holographicTransferRTs: RenderTarget[] = []
  private _holographicRadianceRTs: RenderTarget[] = []
  private _renderTargetPool = new Set<RenderTarget>()
  private _pendingRenderTargetDisposals = new Set<RenderTarget>()
  private _holographicDirectTransferMaterials = new Map<number, NodeMaterial>()
  private _holographicRecursiveTransferMaterials = new Map<number, NodeMaterial>()
  private _holographicRadianceMaterials = new Map<number, NodeMaterial>()
  private _rawFinalRadianceRT: RenderTarget
  private _wideRadianceRT: RenderTarget
  private _wideBlurRT: RenderTarget
  private _wideRadianceRT2: RenderTarget
  private _wideBlurRT2: RenderTarget
  private _finalRadianceRT: RenderTarget
  private _finalRadianceTextureNode: TextureNode
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
  /** Physical processing surface used only to size integer DDA lighting grids. */
  private _processingSize = new Vector2(1, 1)
  private _hasExplicitProcessingSize = false
  private _worldSizeNode = uniform(new Vector2(1, 1))
  private _worldOffsetNode = uniform(new Vector2(0, 0))
  private _radianceWorldSizeNode = uniform(new Vector2(1, 1))
  private _radianceWorldOffsetNode = uniform(new Vector2(0, 0))
  private _shortIntervalLengthNode = uniform(1)
  private _finalTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode = uniform(new Vector2(1, 1))
  private _wideTexelSizeNode2 = uniform(new Vector2(1, 1))
  private _blueNoiseStrengthNode = uniform(0.45)
  private _filterRadiusNode = uniform(1.25)
  private _filterStrengthNode = uniform(0.8)
  private _filterJitterStrengthNode = uniform(0.35)
  private _ddaBleedThresholdNode = uniform(0.65)
  private _ddaQuantizationLevelsNode = uniform(63)
  private _ddaTransferRangeNode = uniform(4)
  private _ddaRadianceRangeNode = uniform(1)
  private _ddaPaletteBandsNode = uniform(0)
  private _ddaPaletteExposureNode = uniform(16)
  private _mipBlurNode = uniform(0)
  private _mipStrengthNode = uniform(0)
  private _sdfHitEpsilonNode = uniform(0.5)
  private _occlusionTextureSizeNode = uniform(new Vector2(1, 1))
  private _blueNoiseTexture: DataTexture
  private _generating = false
  private _effectiveBaseInterval = 16
  private _autoBaseInterval: boolean
  private _autoCascadeResolution: boolean
  private _lightsTexture: DataTexture | null = null
  private _lightCountNode: Node<'float'> = uniform(0)
  private _sdfTexture: Texture | null = null
  private _occlusionTexture: Texture | null = null
  private _lastComposedTexture: Texture | null = null
  private _lastComposedSpan = 1

  constructor(config: Partial<HierarchicalRadianceCascadesConfig> = {}) {
    this._config = {
      ...DEFAULT_HRC_CONFIG,
      ...HIERARCHICAL_RADIANCE_CASCADES_PRESETS.balanced,
      ...config,
    }
    this._config.holographicFinalResolutionScale = normalizeHolographicResolutionScale(
      this._config.holographicFinalResolutionScale
    )
    this._config.holographicTraversal =
      this._config.holographicTraversal === 'dda-float' ||
      this._config.holographicTraversal === 'dda-integer' ||
      this._config.holographicTraversal === 'dda-fixed'
        ? this._config.holographicTraversal
        : 'sdf'
    this._config.ddaPixelSize = Math.max(1, Math.min(32, Math.round(this._config.ddaPixelSize)))
    this._config.ddaBleedThreshold = Math.max(0, Math.min(2, this._config.ddaBleedThreshold))
    this._config.ddaQuantizationBits = Math.max(2, Math.min(8, Math.round(this._config.ddaQuantizationBits)))
    this._config.ddaTransferRange = Math.max(0.25, Math.min(64, this._config.ddaTransferRange))
    this._config.ddaRadianceRange = Math.max(0.25, Math.min(64, this._config.ddaRadianceRange))
    this._config.ddaPaletteBands = normalizeDdaPaletteBands(this._config.ddaPaletteBands)
    this._config.ddaPaletteExposure = Math.max(0.25, Math.min(64, this._config.ddaPaletteExposure))
    this._referenceHierarchy = new RadianceCascades(this._config)
    this._autoBaseInterval = this._config.baseInterval <= 0
    this._autoCascadeResolution = this._config.cascadeResolution <= 0
    this.shortIntervalCount = this._config.shortIntervalCount
    this.compositionLevels = this._config.compositionLevels
    this.compositionMode = this._config.compositionMode

    const initialCascadeResolution = this._config.cascadeResolution > 0 ? this._config.cascadeResolution : 128
    const initialAtlasResolution = this._shortIntervalAtlasResolution(initialCascadeResolution)
    const initialFinalResolution = this._finalRadianceResolution(initialCascadeResolution)
    this._shortIntervalAtlasRT = this._createRenderTarget(
      initialAtlasResolution,
      initialAtlasResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.short-interval-atlas'
    )
    this._compositionRTs = [
      this._createRenderTarget(
        initialAtlasResolution,
        initialAtlasResolution,
        LinearFilter,
        HalfFloatType,
        'hrc.composition-a'
      ),
      this._createRenderTarget(
        initialAtlasResolution,
        initialAtlasResolution,
        LinearFilter,
        HalfFloatType,
        'hrc.composition-b'
      ),
    ]
    this._rebuildHolographicRenderTargets(initialCascadeResolution)
    this._rawFinalRadianceRT = this._createRenderTarget(
      initialFinalResolution,
      initialFinalResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.raw-final'
    )
    this._wideRadianceRT = this._createRenderTarget(
      initialFinalResolution,
      initialFinalResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.wide-radiance'
    )
    this._wideBlurRT = this._createRenderTarget(
      initialFinalResolution,
      initialFinalResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.wide-blur'
    )
    this._wideRadianceRT2 = this._createRenderTarget(
      initialFinalResolution,
      initialFinalResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.wide-radiance-2'
    )
    this._wideBlurRT2 = this._createRenderTarget(
      initialFinalResolution,
      initialFinalResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.wide-blur-2'
    )
    this._finalRadianceRT = this._createRenderTarget(
      initialFinalResolution,
      initialFinalResolution,
      LinearFilter,
      HalfFloatType,
      'hrc.final'
    )
    this._finalRadianceTextureNode = sampleTexture(this._finalRadianceRT.texture) as TextureNode
    this._updateFinalRadianceFilters()
    this._blueNoiseTexture = getSharedBlueNoiseTexture()
    this.blueNoiseStrength = this._config.blueNoiseStrength
    this.raymarchSteps = this._config.raymarchSteps
    this.sdfHitEpsilon = this._config.sdfHitEpsilon
    this.filterRadius = this._config.filterRadius
    this.filterStrength = this._config.filterStrength
    this.filterJitterStrength = this._config.filterJitterStrength
    this.ddaBleedThreshold = this._config.ddaBleedThreshold
    this.ddaQuantizationBits = this._config.ddaQuantizationBits
    this.ddaTransferRange = this._config.ddaTransferRange
    this.ddaRadianceRange = this._config.ddaRadianceRange
    this.ddaPaletteBands = this._config.ddaPaletteBands
    this.ddaPaletteExposure = this._config.ddaPaletteExposure
    this.mipBlur = this._config.mipBlur
    this.mipStrength = this._config.mipStrength
    this.wideDownsampleFactor = this._config.wideDownsampleFactor
    this.wideLevels = this._config.wideLevels
    this.lightSourceRadius = this._config.lightSourceRadius

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

  /** Sample the live final target through a stable node across target replacement. */
  sampleFinalRadiance(radianceUV: Node<'vec2'>): Node<'vec4'> {
    return this._finalRadianceTextureNode.sample(radianceUV) as Node<'vec4'>
  }

  /** Map a world-space point into the domain represented by the radiance texture. */
  worldToRadianceUV(worldPosition: Node<'vec2'>): Node<'vec2'> {
    return vec2(worldPosition).sub(this._radianceWorldOffsetNode).div(this._radianceWorldSizeNode)
  }

  /** Map a padded-square radiance UV into the rectangular SDF texture domain. */
  private _radianceUVToSDFUV(radianceUV: Node<'vec2'>): Node<'vec2'> {
    const worldPosition = uvToWorld(radianceUV, this._radianceWorldSizeNode, this._radianceWorldOffsetNode)
    const sdfUV = worldToUV(worldPosition, this._worldSizeNode, this._worldOffsetNode)
    return vec2(sdfUV.x, float(1).sub(sdfUV.y))
  }

  get finalRadianceReadoutMode(): 'interval-atlas' | 'holographic-r0' {
    return this._usesHolographicFinalReadout() ? 'holographic-r0' : 'interval-atlas'
  }

  /** Whether the active traversal needs a distance field instead of the binary caster mask. */
  get requiresSdf(): boolean {
    return this._config.compositionMode !== 'holographic' || this._config.holographicTraversal === 'sdf'
  }

  private _usesDdaOcclusion(): boolean {
    return this._config.compositionMode === 'holographic' && this._config.holographicTraversal !== 'sdf'
  }

  private _hasRequiredOcclusionInput(): boolean {
    return this._usesDdaOcclusion() ? this._occlusionTexture !== null : this._sdfTexture !== null
  }

  /** Test an HRC output-space point against the active shadow representation. */
  private _filterPointIsOpen(radianceUV: Node<'vec2'>): Node<'bool'> {
    const shadowUV = this._radianceUVToSDFUV(radianceUV)
    if (this._usesDdaOcclusion()) {
      return sampleTexture(this._occlusionTexture!, shadowUV).a.lessThan(float(0.5))
    }
    return sampleTexture(this._sdfTexture!, shadowUV).r.greaterThan(this._sdfHitEpsilonNode)
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

  get holographicStorageBytesPerTexel(): 4 | 8 {
    return this._usesPackedFixedPoint() ? 4 : 8
  }

  get estimatedHolographicStorageBytes(): number {
    if (this._config.compositionMode !== 'holographic') return 0
    return (
      (this.estimatedHolographicTransferValueCount + this.estimatedHolographicRadianceValueCount) *
      this.holographicStorageBytesPerTexel
    )
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
    this._updateRadianceWorldBounds()
    this._requestHolographicOutputResize()
  }

  get holographicTraversal(): HolographicRadianceCascadesTraversal {
    return this._config.holographicTraversal
  }

  set holographicTraversal(value: HolographicRadianceCascadesTraversal) {
    const traversal = value === 'dda-float' || value === 'dda-integer' || value === 'dda-fixed' ? value : 'sdf'
    if (traversal === this._config.holographicTraversal) return
    const previousOutput = this._holographicFinalRadianceDimensions()
    const previousPacked = this._usesPackedFixedPoint()
    this._config.holographicTraversal = traversal
    const nextOutput = this._holographicFinalRadianceDimensions()
    const nextPacked = this._usesPackedFixedPoint()
    if (
      this._config.compositionMode === 'holographic' &&
      (previousOutput.width !== nextOutput.width ||
        previousOutput.height !== nextOutput.height ||
        previousPacked !== nextPacked)
    ) {
      this._requestHolographicOutputResize()
      return
    }
    this._updateFinalRadianceFilters()
    this._disposeHolographicDirectTransferMaterials()
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  get ddaPixelSize(): number {
    return this._config.ddaPixelSize
  }

  set ddaPixelSize(value: number) {
    const pixelSize = Math.max(1, Math.min(32, Math.round(value)))
    if (pixelSize === this._config.ddaPixelSize) return
    this._config.ddaPixelSize = pixelSize
    if (this._config.compositionMode === 'holographic' && this._usesIntegerDdaGrid()) {
      this._requestHolographicOutputResize()
      return
    }
    this._disposeHolographicDirectTransferMaterials()
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  get ddaBleedThreshold(): number {
    return this._config.ddaBleedThreshold
  }

  set ddaBleedThreshold(value: number) {
    const threshold = Math.max(0, Math.min(2, value))
    this._config.ddaBleedThreshold = threshold
    this._ddaBleedThresholdNode.value = threshold
  }

  get ddaQuantizationBits(): number {
    return this._config.ddaQuantizationBits
  }

  set ddaQuantizationBits(value: number) {
    const bits = Math.max(2, Math.min(8, Math.round(value)))
    this._config.ddaQuantizationBits = bits
    this._ddaQuantizationLevelsNode.value = 2 ** bits - 1
  }

  get ddaTransferRange(): number {
    return this._config.ddaTransferRange
  }

  set ddaTransferRange(value: number) {
    const range = Math.max(0.25, Math.min(64, value))
    this._config.ddaTransferRange = range
    this._ddaTransferRangeNode.value = range
  }

  get ddaRadianceRange(): number {
    return this._config.ddaRadianceRange
  }

  set ddaRadianceRange(value: number) {
    const range = Math.max(0.25, Math.min(64, value))
    this._config.ddaRadianceRange = range
    this._ddaRadianceRangeNode.value = range
  }

  get ddaPaletteBands(): number {
    return this._config.ddaPaletteBands
  }

  set ddaPaletteBands(value: number) {
    const wasEnabled = this._usesDdaPalette()
    const bands = normalizeDdaPaletteBands(value)
    this._config.ddaPaletteBands = bands
    this._ddaPaletteBandsNode.value = bands
    if (wasEnabled !== this._usesDdaPalette()) {
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

  get holographicFinalResolutionScale(): number {
    return this._config.holographicFinalResolutionScale
  }

  set holographicFinalResolutionScale(value: number) {
    const scale = normalizeHolographicResolutionScale(value)
    if (scale === this._config.holographicFinalResolutionScale) return
    this._config.holographicFinalResolutionScale = scale
    if (this._config.compositionMode !== 'holographic') return
    this._requestHolographicOutputResize()
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
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  get sdfHitEpsilon(): number {
    return this._config.sdfHitEpsilon
  }

  set sdfHitEpsilon(value: number) {
    this._config.sdfHitEpsilon = Math.max(0, value)
    this._referenceHierarchy.sdfHitEpsilon = this._config.sdfHitEpsilon
    this._updateSdfHitEpsilon()
  }

  get blueNoiseStrength(): number {
    return this._config.blueNoiseStrength
  }

  set blueNoiseStrength(value: number) {
    const strength = Math.max(0, Math.min(1, value))
    this._config.blueNoiseStrength = strength
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

  get lightSourceRadius(): number {
    return this._config.lightSourceRadius
  }

  set lightSourceRadius(value: number) {
    const radius = Math.max(0, value)
    if (radius === this._config.lightSourceRadius) return
    this._config.lightSourceRadius = radius
    this._referenceHierarchy.lightSourceRadius = radius
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeHolographicDirectTransferMaterials()
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
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
    return Math.max(0, Math.min(this._config.compositionLevels, Math.ceil(Math.log2(this._config.shortIntervalCount))))
  }

  get estimatedHolographicDirectTransferPassCount(): number {
    return this._config.compositionMode === 'holographic' ? Math.min(3, this._holographicTransferRTs.length) : 0
  }

  get estimatedHolographicRecursiveTransferPassCount(): number {
    return this._config.compositionMode === 'holographic' ? Math.max(0, this._holographicTransferRTs.length - 3) : 0
  }

  get estimatedHolographicRadiancePassCount(): number {
    return this._config.compositionMode === 'holographic' ? this._holographicRadianceRTs.length : 0
  }

  get estimatedPassCount(): number {
    let count =
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
      this.estimatedRaymarchTexelCount * this._config.raymarchSteps + this.estimatedHolographicDirectTransferSampleCount
    )
  }

  get estimatedHolographicDirectTransferTexelCount(): number {
    if (this._config.compositionMode !== 'holographic') return 0
    return this._holographicLevelInfo()
      .slice(0, 3)
      .reduce((sum, level) => sum + level.transferValueCount * 8, 0)
  }

  get estimatedHolographicDirectTransferSampleCount(): number {
    if (this._usesDdaOcclusion()) {
      // T0-T2 spans at most 2*stride cells along the segment axis and
      // 2*stride cells laterally. Both DDA backends visit one supercover cell
      // per loop iteration and stop as soon as the quantized endpoint is
      // reached, so charging every texel the SDF raymarch budget dramatically
      // overstates DDA work.
      return this._holographicLevelInfo()
        .slice(0, 3)
        .reduce((sum, level) => sum + level.transferValueCount * 8 * (4 * 2 ** level.level + 1), 0)
    }
    return this.estimatedHolographicDirectTransferTexelCount * this._holographicDirectTransferStepCount()
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
    return this._usesLocalFilter() || this._usesMipFilter() || this._usesDdaPalette()
  }

  private _usesDdaPalette(): boolean {
    return this._usesDdaOcclusion() && this._config.ddaPaletteBands >= 2
  }

  private _usesSecondWideLevel(): boolean {
    return this._usesWideBlur() && this._config.wideLevels > 1
  }

  init(worldWidth: number, worldHeight: number, lightsTexture?: DataTexture, lightCountNode?: Node<'float'>): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._updateRadianceWorldBounds()
    if (lightsTexture) this._lightsTexture = lightsTexture
    if (lightCountNode) this._lightCountNode = lightCountNode
    if (!this._hasExplicitProcessingSize) {
      this._processingSize.set(Math.max(1, Math.ceil(worldWidth)), Math.max(1, Math.ceil(worldHeight)))
    }

    const baseAngular = Math.sqrt(this._config.baseRayCount)
    if (this._autoCascadeResolution) {
      const maxDim = Math.max(worldWidth, worldHeight)
      const targetProbes = maxDim / 1.5
      const targetRes = targetProbes * baseAngular
      const autoRes = Math.pow(2, Math.ceil(Math.log2(targetRes)))
      this._config.cascadeResolution =
        this._config.maxAutoCascadeResolution > 0 ? Math.min(autoRes, this._config.maxAutoCascadeResolution) : autoRes
    }

    this._syncReferenceHierarchyConfig()
    if (this._lightsTexture && this._lightCountNode) {
      this._referenceHierarchy.init(worldWidth, worldHeight, this._lightsTexture, this._lightCountNode)
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
    const finalFilter =
      this._config.compositionMode === 'holographic' && this._usesIntegerDdaGrid() ? NearestFilter : LinearFilter
    this._rawFinalRadianceRT = this._replaceRenderTarget(
      this._rawFinalRadianceRT,
      finalWidth,
      finalHeight,
      finalFilter,
      'hrc.raw-final'
    )
    this._finalRadianceRT = this._replaceRenderTarget(
      this._finalRadianceRT,
      finalWidth,
      finalHeight,
      finalFilter,
      'hrc.final'
    )
    this._finalRadianceTextureNode.value = this._finalRadianceRT.texture
    this._updateFinalRadianceFilters()
    this._finalTexelSizeNode.value.set(1 / finalWidth, 1 / finalHeight)
    this._resizeWideRadianceTargets()
    this._registerResizableDebugTargets()
    this._disposeMaterials()
  }

  resize(worldWidth: number, worldHeight: number): void {
    this._worldSize.set(worldWidth, worldHeight)
    this._worldSizeNode.value.set(worldWidth, worldHeight)
    this._updateRadianceWorldBounds()
    this._referenceHierarchy.resize(worldWidth, worldHeight)
    this._updateBaseInterval()
  }

  /** Set the physical effect surface used to derive the integer DDA grid. */
  setProcessingSize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.ceil(width))
    const nextHeight = Math.max(1, Math.ceil(height))
    this._hasExplicitProcessingSize = true
    if (nextWidth === this._processingSize.x && nextHeight === this._processingSize.y) return
    const previous = this._holographicFinalRadianceDimensions()
    this._processingSize.set(nextWidth, nextHeight)
    if (this._config.compositionMode !== 'holographic' || !this._usesIntegerDdaGrid()) return
    const next = this._holographicFinalRadianceDimensions()
    if (previous.width === next.width && previous.height === next.height) return
    this._requestHolographicOutputResize()
  }

  setWorldBounds(worldSize: Vector2, worldOffset: Vector2): void {
    this._worldSize.copy(worldSize)
    this._worldOffset.copy(worldOffset)
    this._worldSizeNode.value.copy(worldSize)
    this._worldOffsetNode.value.copy(worldOffset)
    this._updateRadianceWorldBounds()
    this._referenceHierarchy.setWorldBounds(worldSize, worldOffset)
    this._updateBaseInterval()
    if (this._config.compositionMode === 'holographic') {
      const final = this._holographicFinalRadianceDimensions()
      if (this._rawFinalRadianceRT.width !== final.width || this._rawFinalRadianceRT.height !== final.height) {
        this._rebuildHolographicRenderTargets()
        const filter = this._usesIntegerDdaGrid() ? NearestFilter : LinearFilter
        this._rawFinalRadianceRT = this._replaceRenderTarget(
          this._rawFinalRadianceRT,
          final.width,
          final.height,
          filter,
          'hrc.raw-final'
        )
        this._finalRadianceRT = this._replaceRenderTarget(
          this._finalRadianceRT,
          final.width,
          final.height,
          filter,
          'hrc.final'
        )
        this._finalRadianceTextureNode.value = this._finalRadianceRT.texture
        this._finalTexelSizeNode.value.set(1 / final.width, 1 / final.height)
        this._resizeWideRadianceTargets()
        this._registerResizableDebugTargets()
        this._finalRadianceMaterial?.dispose()
        this._finalRadianceMaterial = null
        this._finalRadianceSourceTexture = null
      }
    }
  }

  setSdfTexture(texture: Texture | null): void {
    if (this._sdfTexture === texture) return
    this._sdfTexture = texture
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeCompositionMaterials()
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
  }

  setOcclusionTexture(texture: Texture | null): void {
    if (this._occlusionTexture === texture) return
    this._occlusionTexture = texture
    this._disposeHolographicDirectTransferMaterials()
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  generate(
    renderer: WebGPURenderer,
    sdfTexture: Texture | null,
    _scene?: Scene,
    _camera?: OrthographicCamera,
    occlusionTexture: Texture | null = null
  ): void {
    if (this._generating) return
    this._generating = true
    this.setSdfTexture(sdfTexture)
    this.setOcclusionTexture(occlusionTexture)
    this._updateSdfHitEpsilon()
    const occlusionImage = occlusionTexture?.image as { width?: number; height?: number } | undefined
    this._occlusionTextureSizeNode.value.set(
      Math.max(1, occlusionImage?.width ?? 1),
      Math.max(1, occlusionImage?.height ?? 1)
    )
    _rendererState = RendererUtils.resetRendererState(renderer, _rendererState)
    try {
      if (this._config.compositionMode === 'holographic') {
        this._renderHolographicDirectTransfers(renderer)
        this._renderHolographicRecursiveTransfers(renderer)
        this._renderHolographicRadiance(renderer)
      } else {
        this._renderShortIntervals(renderer)
        this._renderComposition(renderer)
      }
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
      this._flushRetiredRenderTargets(renderer)
      this._generating = false
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

  dispose(): void {
    unregisterDebugTexture('hrc.shortIntervals')
    unregisterDebugTexture('hrc.composedIntervals')
    unregisterDebugTexture('hrc.finalIrradiance')
    unregisterDebugTexture('hrc.rawFinalIrradiance')
    unregisterDebugTexture('hrc.wideIrradiance')
    unregisterDebugTexture('hrc.wideIrradiance2')
    this._shortIntervalAtlasRT.dispose()
    this._compositionRTs[0].dispose()
    this._compositionRTs[1].dispose()
    this._disposeAllHolographicRenderTargets()
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
    referenceConfig.maxAutoCascadeResolution = this._config.maxAutoCascadeResolution
    referenceConfig.raymarchSteps = this._config.raymarchSteps
    referenceConfig.sdfHitEpsilon = this._config.sdfHitEpsilon
    referenceConfig.intervalOverlap = this._config.intervalOverlap
    referenceConfig.filterRadius = this._config.filterRadius
    referenceConfig.filterStrength = this._config.filterStrength
    referenceConfig.mipBlur = this._config.mipBlur
    referenceConfig.mipStrength = this._config.mipStrength
    referenceConfig.wideDownsampleFactor = this._config.wideDownsampleFactor
    referenceConfig.wideLevels = this._config.wideLevels
    referenceConfig.lightSourceRadius = this._config.lightSourceRadius
  }

  private _updateRadianceWorldBounds(): void {
    if (this._config.compositionMode === 'holographic') {
      const extent = Math.max(this._worldSize.x, this._worldSize.y)
      this._radianceWorldSizeNode.value.set(extent, extent)
      this._radianceWorldOffsetNode.value.set(
        this._worldOffset.x - (extent - this._worldSize.x) * 0.5,
        this._worldOffset.y - (extent - this._worldSize.y) * 0.5
      )
      return
    }

    this._radianceWorldSizeNode.value.copy(this._worldSize)
    this._radianceWorldOffsetNode.value.copy(this._worldOffset)
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
    if (this._usesIntegerDdaGrid()) {
      // HRC's rotation-preserving domain is square. Downsample the physical
      // viewport once, then run every transfer/radiance level at 1× integer
      // cells inside that logical grid. No cascade-resolution cap participates.
      const logicalResolution = Math.max(
        1,
        Math.ceil(Math.max(this._processingSize.x, this._processingSize.y) / this._config.ddaPixelSize)
      )
      return { width: logicalResolution, height: logicalResolution }
    }
    const scale = normalizeHolographicResolutionScale(this._config.holographicFinalResolutionScale)
    const baseResolution = resolution > 0 ? resolution : 128
    const maxResolution = Math.min(baseResolution, this._finalRadianceResolution(resolution) * scale)
    return {
      width: Math.max(1, Math.ceil(maxResolution)),
      height: Math.max(1, Math.ceil(maxResolution)),
    }
  }

  private _usesIntegerDdaGrid(): boolean {
    return this._config.holographicTraversal === 'dda-integer' || this._config.holographicTraversal === 'dda-fixed'
  }

  private _usesPackedFixedPoint(): boolean {
    return this._config.holographicTraversal === 'dda-fixed'
  }

  private _encodeFixedPoint(value: Node<'vec4'>, radianceRange: Node<'float'>): Node<'vec4'> {
    if (!this._usesPackedFixedPoint()) return value
    const levels = this._ddaQuantizationLevelsNode
    const encodedRgb = floor(value.rgb.div(radianceRange).clamp(0, 1).mul(levels).add(float(0.5))).div(levels)
    const encodedTransmittance = floor(value.a.clamp(0, 1).mul(levels).add(float(0.5))).div(levels)
    return vec4(encodedRgb, encodedTransmittance)
  }

  private _decodeFixedPoint(value: Node<'vec4'>, radianceRange: Node<'float'>): Node<'vec4'> {
    if (!this._usesPackedFixedPoint()) return value
    // RGBA8 UNORM has 255 storage intervals, while 5/6-bit code ranges do not
    // divide 255 exactly. Reconstruct the selected integer code on every read
    // so recursive transfer/radiance accumulation cannot drift back into
    // arbitrary floating-point values between quantized stages.
    const levels = this._ddaQuantizationLevelsNode
    const fixedCode = floor(value.mul(levels).add(float(0.5))).clamp(0, levels)
    return vec4(fixedCode.rgb.div(levels).mul(radianceRange), fixedCode.a.div(levels))
  }

  private _encodeHolographicTransfer(value: Node<'vec4'>): Node<'vec4'> {
    return this._encodeFixedPoint(value, this._ddaTransferRangeNode)
  }

  private _decodeHolographicTransfer(value: Node<'vec4'>): Node<'vec4'> {
    return this._decodeFixedPoint(value, this._ddaTransferRangeNode)
  }

  private _holographicRadianceRange(level: number): Node<'float'> {
    return this._ddaRadianceRangeNode.div(float(2 ** level))
  }

  private _encodeHolographicRadiance(value: Node<'vec4'>, level: number): Node<'vec4'> {
    return this._encodeFixedPoint(value, this._holographicRadianceRange(level))
  }

  private _decodeHolographicRadiance(value: Node<'vec4'>, level: number): Node<'vec4'> {
    return this._decodeFixedPoint(value, this._holographicRadianceRange(level))
  }

  private _updateFinalRadianceFilters(): void {
    const filter =
      this._config.compositionMode === 'holographic' && this._usesIntegerDdaGrid() ? NearestFilter : LinearFilter
    for (const target of [this._rawFinalRadianceRT, this._finalRadianceRT]) {
      if (target.texture.minFilter !== filter || target.texture.magFilter !== filter) {
        target.texture.minFilter = filter
        target.texture.magFilter = filter
        target.texture.needsUpdate = true
      }
    }
  }

  private _resizeHolographicOutputTargets(): void {
    const filter =
      this._config.compositionMode === 'holographic' && this._usesIntegerDdaGrid() ? NearestFilter : LinearFilter
    if (this._config.compositionMode !== 'holographic') {
      const finalResolution = this._finalRadianceResolution()
      this._rawFinalRadianceRT = this._replaceRenderTarget(
        this._rawFinalRadianceRT,
        finalResolution,
        finalResolution,
        filter,
        'hrc.raw-final'
      )
      this._finalRadianceRT = this._replaceRenderTarget(
        this._finalRadianceRT,
        finalResolution,
        finalResolution,
        filter,
        'hrc.final'
      )
      this._finalRadianceTextureNode.value = this._finalRadianceRT.texture
      this._updateFinalRadianceFilters()
      this._finalTexelSizeNode.value.set(1 / finalResolution, 1 / finalResolution)
      this._resizeWideRadianceTargets()
      this._registerResizableDebugTargets()
      this._disposeWideRadianceMaterials()
      this._filterRadianceMaterial?.dispose()
      this._filterRadianceMaterial = null
      this._finalRadianceMaterial?.dispose()
      this._finalRadianceMaterial = null
      this._finalRadianceSourceTexture = null
      return
    }
    const final = this._holographicFinalRadianceDimensions()
    this._rebuildHolographicRenderTargets()
    this._rawFinalRadianceRT = this._replaceRenderTarget(
      this._rawFinalRadianceRT,
      final.width,
      final.height,
      filter,
      'hrc.raw-final'
    )
    this._finalRadianceRT = this._replaceRenderTarget(
      this._finalRadianceRT,
      final.width,
      final.height,
      filter,
      'hrc.final'
    )
    this._finalRadianceTextureNode.value = this._finalRadianceRT.texture
    this._updateFinalRadianceFilters()
    this._finalTexelSizeNode.value.set(1 / final.width, 1 / final.height)
    this._resizeWideRadianceTargets()
    this._registerResizableDebugTargets()
    this._disposeWideRadianceMaterials()
    this._filterRadianceMaterial?.dispose()
    this._filterRadianceMaterial = null
    this._finalRadianceMaterial?.dispose()
    this._finalRadianceMaterial = null
    this._finalRadianceSourceTexture = null
  }

  private _requestHolographicOutputResize(): void {
    this._resizeHolographicOutputTargets()
  }

  private _holographicLevelCount(): number {
    const output = this._holographicFinalRadianceDimensions()
    const internalSize = Math.max(1, Math.floor(Math.max(output.width, output.height) / 2))
    return Math.max(1, Math.ceil(Math.log2(internalSize)))
  }

  private _holographicLevelInfo(): HolographicRadianceCascadesLevelInfo[] {
    return this._holographicLevelInfoForResolution(this._config.cascadeResolution)
  }

  private _rebuildHolographicRenderTargets(resolution = this._config.cascadeResolution): void {
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
    this._retireHolographicRenderTargets()
    const levels = this._holographicLevelInfoForResolution(resolution)
    const storageType = this._usesPackedFixedPoint() ? UnsignedByteType : HalfFloatType
    this._holographicTransferRTs = levels.map((level) =>
      this._acquireRenderTarget(
        level.transferAtlasWidth,
        level.transferAtlasHeight,
        NearestFilter,
        storageType,
        `hrc.transfer-${level.level}`
      )
    )
    this._holographicRadianceRTs = levels
      .filter((level) => level.radianceValueCount > 0)
      .map((level) =>
        this._acquireRenderTarget(
          level.radianceAtlasWidth,
          level.radianceAtlasHeight,
          NearestFilter,
          storageType,
          `hrc.radiance-${level.level}`
        )
      )
  }

  private _retireHolographicRenderTargets(): void {
    const targets = [...this._holographicTransferRTs, ...this._holographicRadianceRTs]
    this._retireRenderTargets(targets)
    this._holographicTransferRTs = []
    this._holographicRadianceRTs = []
  }

  private _retireRenderTargets(targets: RenderTarget[]): void {
    for (const target of targets) this._renderTargetPool.add(target)
  }

  private _flushRetiredRenderTargets(renderer: WebGPURenderer): void {
    if (this._renderTargetPool.size === 0) return

    const retired = [...this._renderTargetPool]
    this._renderTargetPool.clear()
    for (const target of retired) this._pendingRenderTargetDisposals.add(target)

    const disposeRetired = (): void => {
      for (const target of retired) {
        if (!this._pendingRenderTargetDisposals.delete(target)) continue
        target.dispose()
      }
    }
    const queue = (
      renderer.backend as {
        device?: { queue?: { onSubmittedWorkDone?: () => Promise<void> } }
      }
    ).device?.queue
    if (queue?.onSubmittedWorkDone) {
      void queue.onSubmittedWorkDone().then(disposeRetired, disposeRetired)
      return
    }
    disposeRetired()
  }

  private _disposeAllHolographicRenderTargets(): void {
    for (const target of this._holographicTransferRTs) target.dispose()
    for (const target of this._holographicRadianceRTs) target.dispose()
    for (const target of this._renderTargetPool) target.dispose()
    for (const target of this._pendingRenderTargetDisposals) target.dispose()
    this._holographicTransferRTs = []
    this._holographicRadianceRTs = []
    this._renderTargetPool.clear()
    this._pendingRenderTargetDisposals.clear()
  }

  private _holographicLevelInfoForResolution(resolution: number): HolographicRadianceCascadesLevelInfo[] {
    const output = this._holographicFinalRadianceDimensions(resolution)
    const outputMaxDimension = Math.max(output.width, output.height)
    const internalSize = Math.max(1, Math.floor(outputMaxDimension / 2))
    const terminalLevel = Math.max(1, Math.ceil(Math.log2(internalSize)))
    const levels: HolographicRadianceCascadesLevelInfo[] = []
    for (let level = 0; level <= terminalLevel; level++) {
      const stride = 2 ** level
      const probeWidth = Math.ceil(internalSize / stride)
      const probeHeight = internalSize
      const transferDirectionCount = 2 * stride + 1
      const radianceDirectionCount = level < terminalLevel ? 2 * stride : 0
      const transferAtlasWidth = probeWidth * transferDirectionCount
      const transferAtlasHeight = probeHeight * 8
      const radianceAtlasWidth = probeWidth * radianceDirectionCount
      const radianceAtlasHeight = radianceDirectionCount > 0 ? probeHeight * 8 : 0
      levels.push({
        level,
        outputWidth: output.width,
        outputHeight: output.height,
        outputMaxDimension,
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
    return Math.max(8, Math.min(64, this._config.raymarchSteps))
  }

  private _createRenderTarget(
    width: number,
    height: number,
    filter: typeof LinearFilter | typeof NearestFilter = LinearFilter,
    type: typeof HalfFloatType | typeof UnsignedByteType = HalfFloatType,
    label = 'hrc.render-target'
  ): RenderTarget {
    const target = new RenderTarget(width, height, {
      type,
      minFilter: filter,
      magFilter: filter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    })
    target.texture.name = label
    return target
  }

  private _acquireRenderTarget(
    width: number,
    height: number,
    filter: typeof LinearFilter | typeof NearestFilter = LinearFilter,
    type: typeof HalfFloatType | typeof UnsignedByteType = HalfFloatType,
    label = 'hrc.render-target'
  ): RenderTarget {
    for (const target of this._renderTargetPool) {
      if (
        target.width === width &&
        target.height === height &&
        target.texture.type === type &&
        target.texture.minFilter === filter &&
        target.texture.magFilter === filter
      ) {
        this._renderTargetPool.delete(target)
        target.texture.name = label
        return target
      }
    }
    return this._createRenderTarget(width, height, filter, type, label)
  }

  private _replaceRenderTarget(
    target: RenderTarget,
    width: number,
    height: number,
    filter: typeof LinearFilter | typeof NearestFilter,
    label: string
  ): RenderTarget {
    if (target.width === width && target.height === height) {
      if (target.texture.minFilter !== filter || target.texture.magFilter !== filter) {
        target.texture.minFilter = filter
        target.texture.magFilter = filter
        target.texture.needsUpdate = true
      }
      return target
    }
    const replacement = this._acquireRenderTarget(width, height, filter, HalfFloatType, label)
    this._retireRenderTargets([target])
    return replacement
  }

  private _registerResizableDebugTargets(): void {
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

  private _resizeWideRadianceTargets(): void {
    const factor = this._config.wideDownsampleFactor
    const wideWidth = Math.max(1, Math.ceil(this._rawFinalRadianceRT.width / factor))
    const wideHeight = Math.max(1, Math.ceil(this._rawFinalRadianceRT.height / factor))
    const wideWidth2 = Math.max(1, Math.ceil(wideWidth / factor))
    const wideHeight2 = Math.max(1, Math.ceil(wideHeight / factor))
    this._wideRadianceRT = this._replaceRenderTarget(
      this._wideRadianceRT,
      wideWidth,
      wideHeight,
      LinearFilter,
      'hrc.wide-radiance'
    )
    this._wideBlurRT = this._replaceRenderTarget(this._wideBlurRT, wideWidth, wideHeight, LinearFilter, 'hrc.wide-blur')
    this._wideRadianceRT2 = this._replaceRenderTarget(
      this._wideRadianceRT2,
      wideWidth2,
      wideHeight2,
      LinearFilter,
      'hrc.wide-radiance-2'
    )
    this._wideBlurRT2 = this._replaceRenderTarget(
      this._wideBlurRT2,
      wideWidth2,
      wideHeight2,
      LinearFilter,
      'hrc.wide-blur-2'
    )
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

  private _renderHolographicDirectTransfers(renderer: WebGPURenderer): void {
    if (!this._hasRequiredOcclusionInput()) return

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
    if (!this._hasRequiredOcclusionInput()) return null

    const levelInfo = this._holographicLevelInfo()[level]
    if (!levelInfo) return null

    const sdfTexture = this._sdfTexture
    const lightsTexture = this._lightsTexture!
    const lightCount = this._lightCountNode
    const worldSize = this._radianceWorldSizeNode
    const worldOffset = this._radianceWorldOffsetNode
    const sdfWorldSize = this._worldSizeNode
    const sdfWorldOffset = this._worldOffsetNode
    const output = this._holographicFinalRadianceDimensions()
    const outputWidth = output.width
    const outputHeight = output.height
    const stride = 2 ** level
    const probeWidth = levelInfo.probeWidth
    const probeHeight = levelInfo.probeHeight
    const transferAtlasWidth = levelInfo.transferAtlasWidth
    const transferAtlasHeight = levelInfo.transferAtlasHeight
    const raymarchSteps = this._holographicDirectTransferStepCount()
    const occlusionTexture = this._occlusionTexture
    const useDdaFloat = this._config.holographicTraversal === 'dda-float' && occlusionTexture !== null
    const useDdaInteger = this._usesIntegerDdaGrid() && occlusionTexture !== null
    const ddaGridSize = vec2(float(outputWidth), float(outputHeight))
    // A direct T_n segment advances 2*stride cells along its facing axis and
    // at most 2*stride cells laterally. The supercover therefore visits no
    // more than 4*stride+1 cells; using the whole target perimeter here left
    // mobile compilers with a needlessly huge loop bound.
    const ddaMaxSteps = 4 * stride + 1
    const autoSourceRadius = min(sdfWorldSize.x, sdfWorldSize.y)
      .mul(float(AUTO_LIGHT_SOURCE_VIEW_FRACTION))
      .max(
        min(worldSize.x.div(float(outputWidth)), worldSize.y.div(float(outputHeight))).mul(
          float(AUTO_DDA_LIGHT_SOURCE_RADIUS_TEXELS)
        )
      )
    const sourceRadius = this._config.lightSourceRadius > 0 ? float(this._config.lightSourceRadius) : autoSourceRadius

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const atlasCoord = floor(uv().mul(vec2(float(transferAtlasWidth), float(transferAtlasHeight))))
      const segmentIndex = floor(atlasCoord.y.div(float(probeHeight)))
      const localY = mod(atlasCoord.y, float(probeHeight))
      const directionIndex = floor(atlasCoord.x.div(float(probeWidth)))
      const probeX = mod(atlasCoord.x, float(probeWidth))
      const rotationIndex = floor(segmentIndex.div(float(2)))
      const parityOffset = mod(segmentIndex, float(2))
      const xDirection = vec2(1, 0).toVar()
      If(rotationIndex.greaterThan(float(0.5)).and(rotationIndex.lessThan(float(1.5))), () => {
        xDirection.assign(vec2(0, 1))
      })
      If(rotationIndex.greaterThan(float(1.5)).and(rotationIndex.lessThan(float(2.5))), () => {
        xDirection.assign(vec2(-1, 0))
      })
      If(rotationIndex.greaterThan(float(2.5)), () => {
        xDirection.assign(vec2(0, -1))
      })
      const yDirection = vec2(xDirection.y.mul(float(-1)), xDirection.x)
      const diagonal = xDirection.add(yDirection)
      const halfSize = float(outputWidth / 2)
      const origin = vec2(halfSize, halfSize)
        .sub(diagonal.mul(halfSize))
        .add(yDirection.mul(parityOffset.add(float(0.499))))
        .add(xDirection.mul(float(0.501)))
      const gridStride = float(2 * stride)
      const lateralOffset = directionIndex.sub(float(stride))
      const startGrid = origin.add(xDirection.mul(probeX.mul(gridStride))).add(yDirection.mul(localY.mul(float(2))))
      const offsetGrid = xDirection.mul(gridStride).add(yDirection.mul(lateralOffset.mul(float(2))))
      const endLocalY = localY.add(lateralOffset)
      const validGrid = probeX.lessThan(float(probeWidth)).and(localY.lessThan(float(probeHeight)))
      const validEnd = endLocalY.greaterThanEqual(float(0)).and(endLocalY.lessThan(float(probeHeight)))

      const outputSize = vec2(float(outputWidth), float(outputHeight))
      const startUV = startGrid.div(outputSize)
      const endUV = startGrid.add(offsetGrid).div(outputSize)
      const startWorld = uvToWorld(startUV, worldSize, worldOffset)
      const endWorld = uvToWorld(endUV, worldSize, worldOffset)
      const segment = endWorld.sub(startWorld)
      const segmentLength = segment.length().max(float(0.001))
      const rayDir = segment.div(segmentLength)
      const source = traceAnalyticLightSources(
        lightsTexture,
        lightCount,
        startWorld,
        rayDir,
        segmentLength,
        sourceRadius
      )
      const traceLimit = source.hit.greaterThan(float(0.5)).select(source.distance, segmentLength)
      const boundsInterval = rayBoundsInterval(startWorld, rayDir, sdfWorldSize, sdfWorldOffset)
      const traceEntry = boundsInterval.x.max(float(0))
      const traceExit = boundsInterval.y.min(traceLimit)
      const intersectsWorld = traceExit.greaterThanEqual(traceEntry)
      const radiance = vec3(0).toVar()
      const transmittance = float(1).toVar()
      const t = float(traceEntry).toVar()
      const reachedTraceLimit = float(0).toVar()

      if (useDdaFloat) {
        const visibility = traceDdaFloatOcclusion(
          occlusionTexture,
          this._occlusionTextureSizeNode,
          startWorld,
          rayDir,
          traceEntry,
          traceExit,
          intersectsWorld,
          sdfWorldSize,
          sdfWorldOffset,
          ddaGridSize,
          ddaMaxSteps
        )
        transmittance.assign(visibility.x)
        reachedTraceLimit.assign(visibility.y)
      } else if (useDdaInteger) {
        const visibility = traceDdaIntegerOcclusion(
          occlusionTexture,
          this._occlusionTextureSizeNode,
          startWorld,
          rayDir,
          traceEntry,
          traceExit,
          intersectsWorld,
          sdfWorldSize,
          sdfWorldOffset,
          outputWidth,
          outputHeight,
          ddaMaxSteps
        )
        transmittance.assign(visibility.x)
        reachedTraceLimit.assign(visibility.y)
      } else {
        Loop(raymarchSteps, () => {
          If(intersectsWorld.not(), () => {
            reachedTraceLimit.assign(float(1))
            Break()
          })

          const sampleWorld = startWorld.add(rayDir.mul(t))
          const sampleUV = worldToUV(sampleWorld, sdfWorldSize, sdfWorldOffset).clamp(0, 1)

          const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
          const sdfDist = sampleTexture(sdfTexture!, sdfUV).r
          If(sdfDist.lessThan(this._sdfHitEpsilonNode), () => {
            transmittance.assign(float(0))
            Break()
          })

          const stepLen = min(sdfDist.max(float(0.001)), traceExit.sub(t).max(float(0)))
          t.addAssign(stepLen)

          If(t.greaterThanEqual(traceExit), () => {
            reachedTraceLimit.assign(float(1))
            Break()
          })
        })
      }

      If(
        transmittance
          .greaterThan(float(0.5))
          .and(reachedTraceLimit.greaterThan(float(0.5)))
          .and(source.hit.greaterThan(float(0.5))),
        () => {
          radiance.assign(source.radiance)
          transmittance.assign(float(0))
        }
      )

      const boundedTransmittance = validEnd.select(transmittance, float(0))
      return this._encodeHolographicTransfer(
        vec4(radiance, boundedTransmittance).mul(validGrid.select(float(1), float(0)))
      )
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
      const atlasCoord = floor(uv().mul(vec2(float(transferAtlasWidth), float(transferAtlasHeight))))
      const segmentIndex = floor(atlasCoord.y.div(float(probeHeight)))
      const localY = mod(atlasCoord.y, float(probeHeight))
      const directionIndex = floor(atlasCoord.x.div(float(probeWidth)))
      const probeX = mod(atlasCoord.x, float(probeWidth))

      const samplePrevious = (sampleX: Node<'float'>, sampleY: Node<'float'>, sampleDirection: Node<'float'>) => {
        const valid = sampleX
          .greaterThanEqual(float(0))
          .and(sampleX.lessThan(float(previousProbeWidth)))
          .and(sampleY.greaterThanEqual(float(0)))
          .and(sampleY.lessThan(float(previousProbeHeight)))
          .and(sampleDirection.greaterThanEqual(float(0)))
          .and(sampleDirection.lessThan(float(previousInfo.transferDirectionCount)))
        const coord = vec2(
          sampleDirection.mul(float(previousProbeWidth)).add(sampleX).add(float(0.5)),
          segmentIndex.mul(float(previousProbeHeight)).add(sampleY).add(float(0.5))
        )
        const sampled = this._decodeHolographicTransfer(
          sampleTexture(sourceTexture, coord.div(vec2(float(previousAtlasWidth), float(previousAtlasHeight))))
        )
        // Amitabha's `load_opt` returns an empty fluence for an out-of-grid
        // midpoint: black radiance with full transmittance. Zeroing the whole
        // value made the missing midpoint opaque and stamped the eight segment
        // axes into the result as +/X-shaped phantom occluders.
        return valid.select(sampled, vec4(0, 0, 0, 1))
      }

      const mergeTransfer = (nearTransfer: Node<'vec4'>, farTransfer: Node<'vec4'>) => {
        return vec4(nearTransfer.rgb.add(nearTransfer.a.mul(farTransfer.rgb)), nearTransfer.a.mul(farTransfer.a))
      }

      const output = vec4(0, 0, 0, 0).toVar()
      const evenDirection = mod(directionIndex, float(2)).lessThan(float(0.5))
      const previousX = probeX.mul(float(2))
      // The terminal level uses radianceDirectionCount=0 as an allocation
      // sentinel, but its geometric grid still has transferDirectionCount-1
      // directions. Derive the offset from the grid, not radiance storage.
      const rayOffset = directionIndex.sub(float((levelInfo.transferDirectionCount - 1) / 2))

      If(evenDirection, () => {
        const sourceDirection = directionIndex.div(float(2))
        const nearTransfer = samplePrevious(previousX, localY, sourceDirection)
        const farTransfer = samplePrevious(
          previousX.add(float(1)),
          localY.add(rayOffset.div(float(2))),
          sourceDirection
        )
        output.assign(mergeTransfer(nearTransfer, farTransfer))
      })

      If(evenDirection.not(), () => {
        const lowDirection = floor(directionIndex.div(float(2)))
        const highDirection = lowDirection.add(float(1))
        const lowNear = samplePrevious(previousX, localY, lowDirection)
        const lowFar = samplePrevious(
          previousX.add(float(1)),
          localY.add(floor(rayOffset.div(float(2)))),
          highDirection
        )
        const highNear = samplePrevious(previousX, localY, highDirection)
        const highFar = samplePrevious(
          previousX.add(float(1)),
          localY.add(floor(rayOffset.add(float(1)).div(float(2)))),
          lowDirection
        )
        const lowMerge = mergeTransfer(lowNear, lowFar)
        const highMerge = mergeTransfer(highNear, highFar)
        output.assign(lowMerge.add(highMerge).mul(float(0.5)))
      })

      return this._encodeHolographicTransfer(output)
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
    const probeWidth = levelInfo.probeWidth
    const probeHeight = levelInfo.probeHeight
    const radianceAtlasWidth = levelInfo.radianceAtlasWidth
    const radianceAtlasHeight = levelInfo.radianceAtlasHeight
    const nextRadianceAtlasWidth = nextInfo.radianceAtlasWidth
    const nextRadianceAtlasHeight = nextInfo.radianceAtlasHeight

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const atlasCoord = floor(uv().mul(vec2(float(radianceAtlasWidth), float(radianceAtlasHeight))))
      const segmentIndex = floor(atlasCoord.y.div(float(probeHeight)))
      const localY = mod(atlasCoord.y, float(probeHeight))
      const directionIndex = floor(atlasCoord.x.div(float(probeWidth)))
      const probeX = mod(atlasCoord.x, float(probeWidth))
      const probeParityEven = mod(probeX, float(2)).lessThan(float(0.5))

      const coneArc = (childDirection: Node<'float'>) => {
        // radianceDirectionCount is zero at the terminal boundary because no
        // R_N texture is allocated. The cone geometry still uses the next
        // grid's full direction count (T_N stores directions+1 edges).
        const halfDirections = float((nextInfo.transferDirectionCount - 1) / 2)
        const angle0 = atan(childDirection.sub(float(0.5)).sub(halfDirections).add(float(0.5)), halfDirections)
        const angle1 = atan(childDirection.add(float(0.5)).sub(halfDirections).add(float(0.5)), halfDirections)
        return angle1.sub(angle0).max(float(0)).div(float(TAU))
      }

      const sampleTransfer = (
        texture: Texture,
        info: HolographicRadianceCascadesLevelInfo,
        sampleX: Node<'float'>,
        sampleY: Node<'float'>,
        sampleDirection: Node<'float'>
      ) => {
        const valid = sampleX
          .greaterThanEqual(float(0))
          .and(sampleX.lessThan(float(info.probeWidth)))
          .and(sampleY.greaterThanEqual(float(0)))
          .and(sampleY.lessThan(float(info.probeHeight)))
          .and(sampleDirection.greaterThanEqual(float(0)))
          .and(sampleDirection.lessThan(float(info.transferDirectionCount)))
        const coord = vec2(
          sampleDirection.mul(float(info.probeWidth)).add(sampleX).add(float(0.5)),
          segmentIndex.mul(float(info.probeHeight)).add(sampleY).add(float(0.5))
        )
        const sampled = this._decodeHolographicTransfer(
          sampleTexture(texture, coord.div(vec2(float(info.transferAtlasWidth), float(info.transferAtlasHeight))))
        )
        return valid.select(sampled, vec4(0, 0, 0, 1))
      }

      const sampleNextRadiance = (sampleX: Node<'float'>, sampleY: Node<'float'>, sampleDirection: Node<'float'>) => {
        if (!nextRadianceTexture || nextInfo.radianceDirectionCount <= 0) {
          return vec4(0, 0, 0, 1)
        }

        const valid = sampleX
          .greaterThanEqual(float(0))
          .and(sampleX.lessThan(float(nextInfo.probeWidth)))
          .and(sampleY.greaterThanEqual(float(0)))
          .and(sampleY.lessThan(float(nextInfo.probeHeight)))
          .and(sampleDirection.greaterThanEqual(float(0)))
          .and(sampleDirection.lessThan(float(nextInfo.radianceDirectionCount)))
        const coord = vec2(
          sampleDirection.mul(float(nextInfo.probeWidth)).add(sampleX).add(float(0.5)),
          segmentIndex.mul(float(nextInfo.probeHeight)).add(sampleY).add(float(0.5))
        )
        const sampled = this._decodeHolographicRadiance(
          sampleTexture(
            nextRadianceTexture,
            coord.div(vec2(float(nextRadianceAtlasWidth), float(nextRadianceAtlasHeight)))
          ),
          level + 1
        )
        return sampled.mul(valid.select(float(1), float(0)))
      }

      const overRadiance = (arc: Node<'float'>, transfer: Node<'vec4'>, farRadiance: Node<'vec4'>) => {
        return vec4(transfer.rgb.mul(arc).add(transfer.a.mul(farRadiance.rgb)), float(1))
      }

      const lowEdge = directionIndex
      const highEdge = directionIndex.add(float(1))
      const lowChild = directionIndex.mul(float(2))
      const highChild = lowChild.add(float(1))
      const lowerOffset = directionIndex.sub(float(levelInfo.radianceDirectionCount / 2))
      const upperOffset = lowerOffset.add(float(1))
      const factor = probeParityEven.select(float(2), float(1))
      const nextCellX = floor(probeX.div(float(2)))
      const lowerTransfer = vec4(0).toVar()
      const upperTransfer = vec4(0).toVar()

      If(probeParityEven, () => {
        lowerTransfer.assign(sampleTransfer(nextTransferTexture, nextInfo, nextCellX, localY, lowEdge.mul(float(2))))
        upperTransfer.assign(sampleTransfer(nextTransferTexture, nextInfo, nextCellX, localY, highEdge.mul(float(2))))
      })
      If(probeParityEven.not(), () => {
        lowerTransfer.assign(sampleTransfer(transferTexture, levelInfo, probeX, localY, lowEdge))
        upperTransfer.assign(sampleTransfer(transferTexture, levelInfo, probeX, localY, highEdge))
      })

      const nextLower = overRadiance(
        coneArc(lowChild),
        lowerTransfer,
        sampleNextRadiance(floor(probeX.add(factor).div(float(2))), localY.add(lowerOffset.mul(factor)), lowChild)
      )
      const nextUpper = overRadiance(
        coneArc(highChild),
        upperTransfer,
        sampleNextRadiance(floor(probeX.add(factor).div(float(2))), localY.add(upperOffset.mul(factor)), highChild)
      )
      const output = vec4(nextLower.rgb.add(nextUpper.rgb), float(1)).toVar()

      If(probeParityEven, () => {
        const directLower = sampleNextRadiance(nextCellX, localY, lowChild)
        const directUpper = sampleNextRadiance(nextCellX, localY, highChild)
        output.assign(
          vec4(
            directLower.rgb
              .add(nextLower.rgb)
              .mul(float(0.5))
              .add(directUpper.rgb.add(nextUpper.rgb).mul(float(0.5))),
            float(1)
          )
        )
      })

      return this._encodeHolographicRadiance(output, level)
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
    if (!this._sdfTexture) return

    const config = this._config
    const sdfTexture = this._sdfTexture
    const lightsTexture = this._lightsTexture!
    const lightCount = this._lightCountNode
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
    const sourceRadius =
      config.lightSourceRadius > 0
        ? float(config.lightSourceRadius)
        : min(worldSize.x, worldSize.y).mul(float(AUTO_LIGHT_SOURCE_VIEW_FRACTION))

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
        // `tileLocal` is evaluated at fragment centres, so `probeXY` already
        // contains the half-texel probe-centre offset.
        const probeUV = probeXY.div(float(probeGroupSize))
        const probeWorldPos = uvToWorld(probeUV, worldSize, worldOffset)

        const jitter = config.angularJitter
          ? sampleTexture(blueNoiseTexture, probeXY.div(float(32)))
              .r.sub(float(0.5))
              .mul(float(2))
              .mul(blueNoiseStrength)
          : float(0)
        const theta = rayIndex.add(float(0.5).add(jitter)).mul(float(TAU / angularSq))
        const rayDir = vec2(cos(theta), sin(theta))

        const start = intervalIndex.mul(intervalLength)
        const segmentStart = probeWorldPos.add(rayDir.mul(start))
        const source = traceAnalyticLightSources(
          lightsTexture,
          lightCount,
          segmentStart,
          rayDir,
          intervalLength,
          sourceRadius
        )
        const traceLimit = source.hit.greaterThan(float(0.5)).select(source.distance, intervalLength)
        const radiance = vec3(0).toVar()
        const transmittance = float(1).toVar()
        const t = float(0).toVar()
        const reachedTraceLimit = float(0).toVar()

        Loop(raymarchSteps, () => {
          const sampleWorld = segmentStart.add(rayDir.mul(t))
          const sampleUV = worldToUV(sampleWorld, worldSize, worldOffset)
          const outOfBounds = sampleUV.x
            .lessThan(0)
            .or(sampleUV.x.greaterThan(1))
            .or(sampleUV.y.lessThan(0))
            .or(sampleUV.y.greaterThan(1))

          If(outOfBounds, () => {
            reachedTraceLimit.assign(float(1))
            Break()
          })

          const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
          const sdfDist = sampleTexture(sdfTexture, sdfUV).r
          If(sdfDist.lessThan(this._sdfHitEpsilonNode), () => {
            transmittance.assign(float(0))
            Break()
          })

          const stepLen = min(sdfDist.max(float(0.001)), traceLimit.sub(t).max(float(0)))
          t.addAssign(stepLen)

          If(t.greaterThanEqual(traceLimit), () => {
            reachedTraceLimit.assign(float(1))
            Break()
          })
        })

        If(
          transmittance
            .greaterThan(float(0.5))
            .and(reachedTraceLimit.greaterThan(float(0.5)))
            .and(source.hit.greaterThan(float(0.5))),
          () => {
            radiance.assign(source.radiance)
            transmittance.assign(float(0))
          }
        )

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
          const nextTileXY = vec2(mod(nextInterval, float(gridSize)), floor(nextInterval.div(float(gridSize))))
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
      : (this._lastComposedTexture ?? this._shortIntervalAtlasRT.texture)
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
    if (!this._hasRequiredOcclusionInput() || !this._lightsTexture || !this._lightCountNode) {
      return
    }

    const sdfTexture = this._sdfTexture
    const lightsTexture = this._lightsTexture
    const lightCount = this._lightCountNode
    const worldSize = this._radianceWorldSizeNode
    const worldOffset = this._radianceWorldOffsetNode
    const sdfWorldSize = this._worldSizeNode
    const sdfWorldOffset = this._worldOffsetNode
    const radianceAtlasWidth = r0Info.radianceAtlasWidth
    const radianceAtlasHeight = r0Info.radianceAtlasHeight
    const internalSize = r0Info.probeHeight
    const raymarchSteps = this._holographicDirectTransferStepCount()
    const occlusionTexture = this._occlusionTexture
    const useDdaFloat = this._config.holographicTraversal === 'dda-float' && occlusionTexture !== null
    const useDdaInteger = this._usesIntegerDdaGrid() && occlusionTexture !== null
    const ddaGridSize = vec2(float(outputWidth), float(outputHeight))
    // Final R0 reconstruction only traces between adjacent parity wedges.
    // Their maximum internal displacement is 1.5 cells horizontally and one
    // vertically. Convert that local bound to output-grid cells instead of
    // charging every fragment for the full target perimeter.
    const ddaMaxSteps = Math.min(
      1024,
      Math.ceil((outputWidth / internalSize) * 1.5) + Math.ceil(outputHeight / internalSize) + 2
    )
    const autoSourceRadius = min(sdfWorldSize.x, sdfWorldSize.y)
      .mul(float(AUTO_LIGHT_SOURCE_VIEW_FRACTION))
      .max(
        min(worldSize.x.div(float(outputWidth)), worldSize.y.div(float(outputHeight))).mul(
          float(AUTO_DDA_LIGHT_SOURCE_RADIUS_TEXELS)
        )
      )
    const sourceRadius = this._config.lightSourceRadius > 0 ? float(this._config.lightSourceRadius) : autoSourceRadius

    this._finalRadianceMaterial = new NodeMaterial()
    this._finalRadianceMaterial.fragmentNode = Fn(() => {
      const outputSize = vec2(float(outputWidth), float(outputHeight))
      const outputCoord = floor(uv().mul(outputSize))

      const sampleR0 = (cellX: Node<'float'>, globalY: Node<'float'>, direction: Node<'float'>) => {
        const valid = cellX
          .greaterThanEqual(float(0))
          .and(cellX.lessThan(float(internalSize)))
          .and(globalY.greaterThanEqual(float(0)))
          .and(globalY.lessThan(float(internalSize * 8)))
          .and(direction.greaterThanEqual(float(0)))
          .and(direction.lessThan(float(2)))
        const coord = vec2(direction.mul(float(internalSize)).add(cellX).add(float(0.5)), globalY.add(float(0.5)))
        const sample = this._decodeHolographicRadiance(
          sampleTexture(sourceTexture, coord.div(vec2(float(radianceAtlasWidth), float(radianceAtlasHeight)))),
          0
        )
        return sample.rgb.mul(valid.select(float(1), float(0)))
      }

      const traceWedge = (
        startCell: Node<'vec2'>,
        endCell: Node<'vec2'>,
        segmentIndex: Node<'float'>,
        xDirection: Node<'vec2'>,
        yDirection: Node<'vec2'>
      ) => {
        const parityOffset = mod(segmentIndex, float(2))
        const diagonal = xDirection.add(yDirection)
        const halfSize = float(outputWidth / 2)
        const origin = vec2(halfSize, halfSize)
          .sub(diagonal.mul(halfSize))
          .add(yDirection.mul(parityOffset.add(float(0.499))))
          .add(xDirection.mul(float(0.501)))
        const segmentYOffset = segmentIndex.mul(float(internalSize))
        const toDisplay = (cell: Node<'vec2'>) => {
          const localCell = vec2(cell.x, cell.y.sub(segmentYOffset))
          return origin
            .add(xDirection.mul(localCell.x.div(float(internalSize)).mul(float(outputWidth))))
            .add(yDirection.mul(localCell.y.div(float(internalSize)).mul(float(outputHeight))))
        }
        const startGrid = toDisplay(startCell)
        const endGrid = toDisplay(endCell)
        const startWorld = uvToWorld(startGrid.div(outputSize), worldSize, worldOffset)
        const endWorld = uvToWorld(endGrid.div(outputSize), worldSize, worldOffset)
        const segment = endWorld.sub(startWorld)
        const segmentLength = segment.length().max(float(0.001))
        const rayDirection = segment.div(segmentLength)
        const source = traceAnalyticLightSources(
          lightsTexture,
          lightCount,
          startWorld,
          rayDirection,
          segmentLength,
          sourceRadius
        )
        const traceLimit = source.hit.greaterThan(float(0.5)).select(source.distance, segmentLength)
        const boundsInterval = rayBoundsInterval(startWorld, rayDirection, sdfWorldSize, sdfWorldOffset)
        const traceEntry = boundsInterval.x.max(float(0))
        const traceExit = boundsInterval.y.min(traceLimit)
        const intersectsWorld = traceExit.greaterThanEqual(traceEntry)
        const radiance = vec3(0).toVar()
        const transmittance = float(1).toVar()
        const t = float(traceEntry).toVar()
        const reachedTraceLimit = float(0).toVar()

        if (useDdaFloat) {
          const visibility = traceDdaFloatOcclusion(
            occlusionTexture,
            this._occlusionTextureSizeNode,
            startWorld,
            rayDirection,
            traceEntry,
            traceExit,
            intersectsWorld,
            sdfWorldSize,
            sdfWorldOffset,
            ddaGridSize,
            ddaMaxSteps
          )
          transmittance.assign(visibility.x)
          reachedTraceLimit.assign(visibility.y)
        } else if (useDdaInteger) {
          const visibility = traceDdaIntegerOcclusion(
            occlusionTexture,
            this._occlusionTextureSizeNode,
            startWorld,
            rayDirection,
            traceEntry,
            traceExit,
            intersectsWorld,
            sdfWorldSize,
            sdfWorldOffset,
            outputWidth,
            outputHeight,
            ddaMaxSteps
          )
          transmittance.assign(visibility.x)
          reachedTraceLimit.assign(visibility.y)
        } else {
          Loop(raymarchSteps, () => {
            If(intersectsWorld.not(), () => {
              reachedTraceLimit.assign(float(1))
              Break()
            })

            const sampleWorld = startWorld.add(rayDirection.mul(t))
            const sampleUV = worldToUV(sampleWorld, sdfWorldSize, sdfWorldOffset).clamp(0, 1)

            const sdfUV = vec2(sampleUV.x, float(1).sub(sampleUV.y))
            const sdfDistance = sampleTexture(sdfTexture!, sdfUV).r
            If(sdfDistance.lessThan(this._sdfHitEpsilonNode), () => {
              transmittance.assign(float(0))
              Break()
            })

            t.addAssign(min(sdfDistance.max(float(0.001)), traceExit.sub(t).max(float(0))))
            If(t.greaterThanEqual(traceExit), () => {
              reachedTraceLimit.assign(float(1))
              Break()
            })
          })
        }
        If(
          transmittance
            .greaterThan(float(0.5))
            .and(reachedTraceLimit.greaterThan(float(0.5)))
            .and(source.hit.greaterThan(float(0.5))),
          () => {
            radiance.assign(source.radiance.mul(float(1 / 8)))
            transmittance.assign(float(0))
          }
        )

        const segmentMinY = segmentYOffset
        const segmentMaxY = segmentYOffset.add(float(internalSize))
        const validEnd = endCell.y.greaterThanEqual(segmentMinY).and(endCell.y.lessThan(segmentMaxY))
        return vec4(radiance, validEnd.select(transmittance, float(0)))
      }

      const total = vec3(0).toVar()
      Loop({ start: 0, end: 4, type: 'float', condition: '<' }, ({ i: rotation }: { i: Node<'float'> }) => {
        const initialCell = vec2(outputCoord).toVar()
        const xDirection = vec2(1, 0).toVar()
        If(rotation.greaterThan(float(0.5)).and(rotation.lessThan(float(1.5))), () => {
          initialCell.assign(vec2(outputCoord.y, float(outputWidth - 1).sub(outputCoord.x)))
          xDirection.assign(vec2(0, 1))
        })
        If(rotation.greaterThan(float(1.5)).and(rotation.lessThan(float(2.5))), () => {
          initialCell.assign(
            vec2(float(outputWidth - 1).sub(outputCoord.x), float(outputHeight - 1).sub(outputCoord.y))
          )
          xDirection.assign(vec2(-1, 0))
        })
        If(rotation.greaterThan(float(2.5)), () => {
          initialCell.assign(vec2(float(outputHeight - 1).sub(outputCoord.y), outputCoord.x))
          xDirection.assign(vec2(0, -1))
        })
        const yDirection = vec2(xDirection.y.mul(float(-1)), xDirection.x)
        const cell = vec2(initialCell.x.add(float(1)), initialCell.y)
        const validCell = cell.x.lessThan(float(outputWidth))
        const xEven = mod(cell.x, float(2)).lessThan(float(0.5))
        const yEven = mod(cell.y, float(2)).lessThan(float(0.5))
        const parityMatches = xEven.and(yEven).or(xEven.not().and(yEven.not()))
        const paritySegment = parityMatches.not().select(float(1), float(0))
        const segmentIndex = rotation.mul(float(2)).add(paritySegment)
        const rowOffset = parityMatches.select(float(0), yEven.select(float(internalSize - 1), float(internalSize)))
        const baseX = floor(cell.x.div(float(2)))
        const baseY = floor(cell.y.div(float(2)))
          .add(rowOffset)
          .add(rotation.mul(float(2 * internalSize)))
        const parity = xEven
        const cellF = vec2(baseX, baseY).add(parity.select(vec2(0), vec2(0.5, 0.5)))
        const startCell = cellF.sub(vec2(0.49, 0))
        const factor = parity.select(float(2), float(1))
        const lowerEnd = floor(cellF.add(vec2(0.5, -0.5).mul(factor)))
        const upperEnd = floor(cellF.add(vec2(0.5, 0.5).mul(factor)))
        const lower = traceWedge(startCell, lowerEnd, segmentIndex, xDirection, yDirection)
        const upper = traceWedge(startCell, upperEnd, segmentIndex, xDirection, yDirection)
        const nextLower = lower.rgb.add(
          lower.a.mul(sampleR0(baseX.add(float(1)), baseY.add(parity.select(float(-1), float(0))), float(0)))
        )
        const nextUpper = upper.rgb.add(upper.a.mul(sampleR0(baseX.add(float(1)), baseY.add(float(1)), float(1))))
        const contribution = nextLower.add(nextUpper).toVar()
        If(parity, () => {
          contribution.assign(
            sampleR0(baseX, baseY, float(0))
              .add(nextLower)
              .mul(float(0.5))
              .add(sampleR0(baseX, baseY, float(1)).add(nextUpper).mul(float(0.5)))
          )
        })
        total.addAssign(contribution.mul(validCell.select(float(1), float(0))))
      })

      total.addAssign(collectAmbientRadiance(lightsTexture, lightCount))
      return vec4(total, float(1))
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
      this._wideDownsampleMaterial && (!needsWideBlur || (this._wideBlurHMaterial && this._wideBlurVMaterial))
    const hasSecondLevel = this._wideDownsampleMaterial2 && this._wideBlurHMaterial2 && this._wideBlurVMaterial2
    if (hasFirstLevel && (!this._usesSecondWideLevel() || hasSecondLevel)) {
      return
    }
    if (!this._hasRequiredOcclusionInput()) return

    if (!hasFirstLevel) {
      this._wideDownsampleMaterial = this._createShadowAwareDownsampleMaterial(
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
      this._wideDownsampleMaterial2 = this._createShadowAwareDownsampleMaterial(
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

  private _createShadowAwareDownsampleMaterial(
    sourceTexture: Texture,
    sourceTexelSize: UniformNode<'vec2', Vector2>
  ): NodeMaterial {
    const texelSize = sourceTexelSize
    const radius = this._filterRadiusNode

    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const centerUV = uv()
      const center = sampleTexture(sourceTexture, centerUV)
      const centerOpen = this._filterPointIsOpen(centerUV)
      const total = vec3(center.rgb).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()

      const sampleNeighbor = (dx: number, dy: number, baseWeight: number): void => {
        const offset = vec2(dx, dy).mul(texelSize).mul(radius)
        const neighborUV = centerUV.add(offset).clamp(0, 1)
        const midpointUV = centerUV.add(offset.mul(float(0.5))).clamp(0, 1)
        const visible = centerOpen.and(this._filterPointIsOpen(neighborUV)).and(this._filterPointIsOpen(midpointUV))
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
    if (!this._hasRequiredOcclusionInput()) return

    const rawFinalTexture = this._rawFinalRadianceRT.texture
    const blueNoiseTexture = this._blueNoiseTexture
    const texelSize = this._finalTexelSizeNode
    const radius = this._filterRadiusNode
    const strength = this._filterStrengthNode
    const useLocalFilter = this._usesLocalFilter()
    const useWideFilter = this._usesMipFilter()
    const useSecondWideLevel = this._usesSecondWideLevel()
    const useFilterDiagonals = this._config.filterDiagonals
    const useFilterJitter = this._config.filterJitterStrength > 0 && !this._usesDdaOcclusion()
    const usesDdaShadowMask = this._usesDdaOcclusion()
    const useDdaColorThreshold = this._usesIntegerDdaGrid()
    const filterJitterStrength = this._filterJitterStrengthNode
    const ddaBleedThreshold = this._ddaBleedThresholdNode
    const ddaPaletteBands = this._ddaPaletteBandsNode
    const ddaPaletteExposure = this._ddaPaletteExposureNode
    const mipStrength = this._mipStrengthNode
    const blueNoiseScale = Math.max(1, Math.ceil(this._rawFinalRadianceRT.width / BLUE_NOISE_SIZE))

    this._filterRadianceMaterial = new NodeMaterial()
    this._filterRadianceMaterial.fragmentNode = Fn(() => {
      const centerUV = uv()
      const center = sampleTexture(rawFinalTexture, centerUV)
      const centerOpen = this._filterPointIsOpen(centerUV)
      const centerSdfDistance = usesDdaShadowMask
        ? float(0)
        : sampleTexture(this._sdfTexture!, this._radianceUVToSDFUV(centerUV)).r
      const total = vec3(center.rgb).mul(float(4)).toVar()
      const totalWeight = float(4).toVar()
      const centerLuma = center.r
        .mul(float(0.2126))
        .add(center.g.mul(float(0.7152)))
        .add(center.b.mul(float(0.0722)))
      const minVisibleLuma = float(centerLuma).toVar()
      const filterRadiusScale = useFilterJitter
        ? float(1).add(
            sampleTexture(blueNoiseTexture, centerUV.mul(float(blueNoiseScale)))
              .r.sub(float(0.5))
              .mul(filterJitterStrength)
              .mul(
                smoothstep(
                  this._sdfHitEpsilonNode.mul(float(4)),
                  this._sdfHitEpsilonNode.mul(float(24)),
                  centerSdfDistance
                )
              )
          )
        : float(1)

      const paletteQuantize = (color: Node<'vec3'>): Node<'vec3'> => {
        if (!this._usesDdaPalette()) return color
        const luma = color.r
          .mul(float(0.2126))
          .add(color.g.mul(float(0.7152)))
          .add(color.b.mul(float(0.0722)))
        // Quantize in a Reinhard-compressed linear-light domain. The exposure
        // control places useful scene energy across the selected bands while
        // preserving exact black and never touching transfer alpha/occlusion.
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

      const sampleNeighbor = (dx: number, dy: number, baseWeight: number): void => {
        const offset = vec2(dx, dy).mul(texelSize).mul(radius).mul(filterRadiusScale)
        const neighborUV = centerUV.add(offset).clamp(0, 1)
        const midpointUV = centerUV.add(offset.mul(float(0.5))).clamp(0, 1)
        const visible = centerOpen.and(this._filterPointIsOpen(neighborUV)).and(this._filterPointIsOpen(midpointUV))
        const sample = sampleTexture(rawFinalTexture, neighborUV)
        const colorDelta = sample.rgb.sub(center.rgb).length()
        const colorMagnitude = sample.rgb.length().max(center.rgb.length()).max(float(0.05))
        const normalizedColorDelta = colorDelta.div(colorMagnitude)
        const colorAccepted = useDdaColorThreshold ? normalizedColorDelta.lessThan(ddaBleedThreshold) : visible
        const accepted = visible.and(colorAccepted)
        const weight = accepted.select(float(baseWeight), float(0))
        total.addAssign(sample.rgb.mul(weight))
        totalWeight.addAssign(weight)
        const sampleLuma = sample.r
          .mul(float(0.2126))
          .add(sample.g.mul(float(0.7152)))
          .add(sample.b.mul(float(0.0722)))
        minVisibleLuma.assign(min(minVisibleLuma, accepted.select(sampleLuma, minVisibleLuma)))
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
      const edgeArea = usesDdaShadowMask
        ? float(0)
        : float(1).sub(
            smoothstep(this._sdfHitEpsilonNode.mul(float(4)), this._sdfHitEpsilonNode.mul(float(28)), centerSdfDistance)
          )
      const shadowContrast = smoothstep(
        float(0.06),
        float(0.32),
        crossLuma.sub(minVisibleLuma).div(crossLuma.max(float(0.001)))
      )
      const edgePreserved = crossFiltered.mul(mix(float(1), lumaScale, edgeArea.mul(shadowContrast).mul(float(0.45))))

      if (useWideFilter) {
        const wide1 = sampleTexture(this._wideRadianceRT.texture, centerUV)
        const mipFiltered = vec3(wide1.rgb).toVar()
        if (useSecondWideLevel) {
          const wide2 = sampleTexture(this._wideRadianceRT2.texture, centerUV)
          const veryOpenArea = usesDdaShadowMask
            ? centerOpen.select(float(1), float(0))
            : smoothstep(
                this._sdfHitEpsilonNode.mul(float(8)),
                this._sdfHitEpsilonNode.mul(float(48)),
                centerSdfDistance
              )
          mipFiltered.assign(mix(wide1.rgb, wide2.rgb, veryOpenArea.mul(this._mipBlurNode)))
        }
        const wideColorDelta = mipFiltered.sub(center.rgb).length()
        const wideColorMagnitude = mipFiltered.length().max(center.rgb.length()).max(float(0.05))
        const wideColorAccepted = useDdaColorThreshold
          ? wideColorDelta.div(wideColorMagnitude).lessThan(ddaBleedThreshold).select(float(1), float(0))
          : float(1)
        const openArea = usesDdaShadowMask
          ? centerOpen.select(float(1), float(0))
          : smoothstep(this._sdfHitEpsilonNode.mul(float(2)), this._sdfHitEpsilonNode.mul(float(16)), centerSdfDistance)
        const edgeAwareMipStrength = mipStrength
          .mul(openArea)
          .mul(wideColorAccepted)
          .mul(float(1).sub(edgeArea.mul(shadowContrast).mul(float(0.55))))
        return vec4(paletteQuantize(mix(edgePreserved, mipFiltered, edgeAwareMipStrength)), center.a)
      }

      return vec4(paletteQuantize(edgePreserved), center.a)
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
    this._shortIntervalMaterial?.dispose()
    this._shortIntervalMaterial = null
    this._disposeCompositionMaterials()
    this._disposeHolographicDirectTransferMaterials()
    this._disposeHolographicRecursiveTransferMaterials()
    this._disposeHolographicRadianceMaterials()
    this._disposeWideRadianceMaterials()
  }
}
