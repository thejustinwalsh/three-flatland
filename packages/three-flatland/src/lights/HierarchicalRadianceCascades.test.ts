import { describe, expect, it, vi } from 'vitest'
import { DataTexture, FloatType, HalfFloatType, NearestFilter, RGBAFormat, UnsignedByteType } from 'three'
import {
  HierarchicalRadianceCascades,
  HIERARCHICAL_RADIANCE_CASCADES_PRESETS,
  createHierarchicalRadianceCascadesConfig,
} from './HierarchicalRadianceCascades'
import { RadianceCascades, RADIANCE_CASCADES_PRESETS } from './RadianceCascades'

describe('HierarchicalRadianceCascades', () => {
  function createTexture(): DataTexture {
    const texture = new DataTexture(new Float32Array(4 * 4), 1, 4, RGBAFormat, FloatType)
    texture.needsUpdate = true
    return texture
  }

  it('keeps HRC as a separate interval-composition boundary from baseline RC', () => {
    const hrc = new HierarchicalRadianceCascades()

    expect(hrc).not.toBeInstanceOf(RadianceCascades)
    expect(hrc.algorithm).toBe('interval-composition')
    expect(hrc.config).toMatchObject({
      compositionMode: 'holographic',
      mipBlur: 0.25,
      mipStrength: 0.15,
      shortIntervalCount: 4,
      compositionLevels: 2,
    })
    expect(hrc.wideFilterEnabled).toBe(true)
    expect(hrc.wideBlurEnabled).toBe(true)
  })

  it('starts from validated RC quality knobs and adds composition-specific knobs', () => {
    expect(HIERARCHICAL_RADIANCE_CASCADES_PRESETS.balanced).toMatchObject({
      baseRayCount: RADIANCE_CASCADES_PRESETS.balanced.baseRayCount,
      raymarchSteps: RADIANCE_CASCADES_PRESETS.balanced.raymarchSteps,
      maxAutoCascadeResolution: 512,
      filterDiagonals: false,
      filterJitterStrength: 0,
      mipBlur: 0.25,
      mipStrength: 0.15,
      shortIntervalCount: 4,
      compositionLevels: 2,
      compositionMode: 'holographic',
      holographicFinalResolutionScale: 4,
      ddaBleedThreshold: 0.65,
      ddaQuantizationBits: 8,
      ddaPaletteBands: 32,
    })

    expect(HIERARCHICAL_RADIANCE_CASCADES_PRESETS.quality).toMatchObject({
      maxAutoCascadeResolution: 512,
      shortIntervalCount: 8,
      compositionLevels: 3,
      compositionMode: 'holographic',
      holographicFinalResolutionScale: 4,
    })

    for (const preset of Object.values(HIERARCHICAL_RADIANCE_CASCADES_PRESETS)) {
      expect(preset.compositionMode).toBe('holographic')
    }
  })

  it('supports overrides and clamps composition budget knobs', () => {
    const config = createHierarchicalRadianceCascadesConfig('fast', {
      shortIntervalCount: 6,
      compositionLevels: 5,
      compositionMode: 'holographic',
    })
    expect(config).toMatchObject({
      raymarchSteps: 24,
      shortIntervalCount: 6,
      compositionLevels: 5,
      compositionMode: 'holographic',
    })

    const hrc = new HierarchicalRadianceCascades({
      shortIntervalCount: 999,
      compositionLevels: -1,
      compositionMode: 'holographic',
    })
    expect(hrc.shortIntervalCount).toBe(64)
    expect(hrc.compositionLevels).toBe(1)
    expect(hrc.compositionMode).toBe('holographic')

    hrc.shortIntervalCount = -1
    hrc.compositionLevels = 99
    hrc.compositionMode = 'hierarchical'
    expect(hrc.shortIntervalCount).toBe(1)
    expect(hrc.compositionLevels).toBe(8)
    expect(hrc.compositionMode).toBe('hierarchical')
  })

  it('allocates a stable short-interval atlas texture sized from cascade resolution and interval grid', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      shortIntervalCount: 12,
    })
    const texture = hrc.shortIntervalAtlasTexture

    expect(hrc.shortIntervalGridSize).toBe(4)
    expect(hrc.shortIntervalAtlasSize).toBe(256)

    hrc.init(320, 180)
    expect(hrc.shortIntervalAtlasTexture).toBe(texture)
    expect(hrc.config.cascadeResolution).toBe(64)
    expect(hrc.shortIntervalAtlasSize).toBe(256)

    hrc.shortIntervalCount = 17
    const internals = hrc as unknown as { _compositionRTs: Array<{ width: number; height: number }> }
    expect(hrc.shortIntervalGridSize).toBe(5)
    expect(hrc.shortIntervalAtlasTexture).toBe(texture)
    expect(hrc.shortIntervalAtlasSize).toBe(320)
    expect(internals._compositionRTs[0]!.width).toBe(320)
    expect(internals._compositionRTs[1]!.width).toBe(320)
    hrc.dispose()
  })

  it('updates short interval length and atlas budget when composition count changes at runtime', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      shortIntervalCount: 8,
      compositionLevels: 3,
    })
    hrc.init(80, 60)

    const initialInterval = hrc.effectiveBaseInterval
    expect(initialInterval).toBeCloseTo(Math.hypot(80, 60) / 8)

    hrc.shortIntervalCount = 12
    hrc.compositionLevels = 4

    expect(hrc.shortIntervalCount).toBe(12)
    expect(hrc.compositionLevels).toBe(4)
    expect(hrc.effectiveBaseInterval).toBeCloseTo(Math.hypot(80, 60) / 12)
    expect(hrc.effectiveBaseInterval).toBeLessThan(initialInterval)
    expect(hrc.shortIntervalGridSize).toBe(4)
    expect(hrc.shortIntervalAtlasSize).toBe(256)
    hrc.dispose()
  })

  it('rebuilds composition materials when short interval count changes inside the same atlas grid', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      shortIntervalCount: 10,
    })
    const dispose = vi.fn()
    const internals = hrc as unknown as {
      _compositionMaterials: Map<number, { dispose: () => void }>
    }
    internals._compositionMaterials.set(1, { dispose })

    hrc.shortIntervalCount = 12

    expect(hrc.shortIntervalGridSize).toBe(4)
    expect(internals._compositionMaterials.size).toBe(0)
    expect(dispose).toHaveBeenCalledTimes(1)
    hrc.dispose()
  })

  it('auto-sizes HRC cascade resolution with atlas-aware preset caps', () => {
    const hrc = new HierarchicalRadianceCascades()
    const texture = hrc.shortIntervalAtlasTexture

    hrc.init(1_000, 1_000)

    expect(hrc.config.cascadeResolution).toBe(512)
    expect(hrc.shortIntervalGridSize).toBe(2)
    expect(hrc.shortIntervalAtlasTexture).toBe(texture)
    expect(hrc.shortIntervalAtlasSize).toBe(1024)
    expect(hrc.effectiveBaseInterval).toBeGreaterThan(0)
    hrc.dispose()
  })

  it('sizes raw, filtered, and wide irradiance targets from the base probe grid', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      baseRayCount: 4,
      holographicFinalResolutionScale: 1,
      wideDownsampleFactor: 2,
    })

    hrc.init(128, 64)

    const internals = hrc as unknown as {
      _rawFinalRadianceRT: { width: number; height: number }
      _finalRadianceRT: { width: number; height: number }
      _wideRadianceRT: { width: number; height: number }
      _wideRadianceRT2: { width: number; height: number }
    }
    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 32, height: 32 })
    expect(internals._finalRadianceRT).toMatchObject({ width: 32, height: 32 })
    expect(internals._wideRadianceRT).toMatchObject({ width: 16, height: 16 })
    expect(internals._wideRadianceRT2).toMatchObject({ width: 8, height: 8 })

    hrc.wideDownsampleFactor = 4
    expect(internals._wideRadianceRT).toMatchObject({ width: 8, height: 8 })
    expect(internals._wideRadianceRT2).toMatchObject({ width: 2, height: 2 })
    hrc.dispose()
  })

  it('uses filtered output when local or wide filtering is enabled', () => {
    const hrc = new HierarchicalRadianceCascades({
      filterRadius: 0,
      filterStrength: 0,
      mipBlur: 0,
      mipStrength: 0,
    })
    const internals = hrc as unknown as { _usesFilteredOutput: () => boolean }

    expect(internals._usesFilteredOutput()).toBe(false)
    hrc.filterRadius = 1
    hrc.filterStrength = 0.8
    expect(internals._usesFilteredOutput()).toBe(true)
    hrc.filterRadius = 0
    hrc.mipStrength = 0.25
    expect(internals._usesFilteredOutput()).toBe(true)

    hrc.mipStrength = 0
    hrc.mipBlur = 0.5
    expect(internals._usesFilteredOutput()).toBe(false)
    hrc.dispose()
  })

  it('rebuilds the filter material only when local filtering toggles on or off', () => {
    const hrc = new HierarchicalRadianceCascades({
      filterRadius: 1,
      filterStrength: 0.8,
      mipStrength: 0.25,
    })
    const dispose = vi.fn()
    const internals = hrc as unknown as {
      _filterRadianceMaterial: { dispose: () => void } | null
    }
    internals._filterRadianceMaterial = { dispose }

    hrc.filterRadius = 1.5
    expect(dispose).not.toHaveBeenCalled()
    expect(internals._filterRadianceMaterial).toBeTruthy()

    hrc.filterStrength = 0
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(internals._filterRadianceMaterial).toBeNull()

    internals._filterRadianceMaterial = { dispose }
    hrc.filterRadius = 0
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(internals._filterRadianceMaterial).toBeTruthy()

    hrc.filterStrength = 0.8
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(internals._filterRadianceMaterial).toBeTruthy()

    hrc.filterRadius = 1
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(internals._filterRadianceMaterial).toBeNull()
    hrc.dispose()
  })

  it('estimates render pass count from HRC composition and wide-GI chains', () => {
    const hrc = new HierarchicalRadianceCascades({
      compositionMode: 'hierarchical',
      shortIntervalCount: 8,
      compositionLevels: 3,
      filterRadius: 0,
      filterStrength: 0,
      mipBlur: 0,
      mipStrength: 0,
      wideLevels: 2,
    })

    expect(hrc.estimatedCompositionPassCount).toBe(3)
    expect(hrc.estimatedPassCount).toBe(5)

    hrc.mipStrength = 0.25
    expect(hrc.estimatedPassCount).toBe(7)

    hrc.mipBlur = 0.5
    expect(hrc.estimatedPassCount).toBe(12)

    hrc.wideLevels = 1
    expect(hrc.estimatedPassCount).toBe(9)

    hrc.shortIntervalCount = 12
    hrc.compositionLevels = 4
    expect(hrc.estimatedCompositionPassCount).toBe(4)
    expect(hrc.estimatedPassCount).toBe(10)
    hrc.dispose()
  })

  it('estimates raymarch loop texels and physical atlas texels for the short-interval atlas', () => {
    const hrc = new HierarchicalRadianceCascades({
      compositionMode: 'hierarchical',
      cascadeResolution: 64,
      shortIntervalCount: 12,
      raymarchSteps: 24,
    })

    expect(hrc.shortIntervalGridSize).toBe(4)
    expect(hrc.shortIntervalAtlasSize).toBe(256)
    expect(hrc.estimatedRaymarchTexelCount).toBe(64 * 64 * 12)
    expect(hrc.estimatedPhysicalRaymarchTexelCount).toBe(256 * 256)
    expect(hrc.estimatedUnusedRaymarchTexelCount).toBe(256 * 256 - 64 * 64 * 12)
    expect(hrc.estimatedRaymarchSampleCount).toBe(64 * 64 * 12 * 24)

    hrc.shortIntervalCount = 17
    expect(hrc.shortIntervalGridSize).toBe(5)
    expect(hrc.shortIntervalAtlasSize).toBe(320)
    expect(hrc.estimatedRaymarchTexelCount).toBe(64 * 64 * 17)
    expect(hrc.estimatedPhysicalRaymarchTexelCount).toBe(320 * 320)
    expect(hrc.estimatedUnusedRaymarchTexelCount).toBe(320 * 320 - 64 * 64 * 17)
    expect(hrc.estimatedRaymarchSampleCount).toBe(64 * 64 * 17 * 24)
    hrc.dispose()
  })

  it('allocates paper-shaped holographic transfer and radiance atlases', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      baseRayCount: 4,
      holographicFinalResolutionScale: 1,
    })

    const levels = hrc.holographicLevelInfo
    const terminal = levels.at(-1)!
    const internals = hrc as unknown as {
      _holographicTransferRTs: Array<{ width: number; height: number }>
      _holographicRadianceRTs: Array<{ width: number; height: number }>
    }

    expect(hrc.holographicLevelCount).toBe(4)
    expect(levels).toHaveLength(5)
    expect(levels[0]).toMatchObject({
      level: 0,
      probeWidth: 16,
      probeHeight: 16,
      transferDirectionCount: 3,
      radianceDirectionCount: 2,
      transferAtlasWidth: 48,
      transferAtlasHeight: 128,
      radianceAtlasWidth: 32,
      radianceAtlasHeight: 128,
    })
    expect(terminal).toMatchObject({
      level: 4,
      probeWidth: 1,
      probeHeight: 16,
      transferDirectionCount: 33,
      radianceDirectionCount: 0,
      transferAtlasWidth: 33,
      transferAtlasHeight: 128,
      radianceAtlasWidth: 0,
      radianceAtlasHeight: 0,
    })

    expect(internals._holographicTransferRTs).toHaveLength(5)
    expect(internals._holographicRadianceRTs).toHaveLength(4)
    expect(internals._holographicTransferRTs[0]).toMatchObject({ width: 48, height: 128 })
    expect(internals._holographicRadianceRTs[0]).toMatchObject({ width: 32, height: 128 })
    expect(internals._holographicTransferRTs[4]).toMatchObject({ width: 33, height: 128 })
    expect(hrc.estimatedHolographicTransferValueCount).toBe(
      levels.reduce((sum, level) => sum + level.transferValueCount, 0) * 8
    )
    expect(hrc.estimatedHolographicRadianceValueCount).toBe(
      levels.reduce((sum, level) => sum + level.radianceValueCount, 0) * 8
    )
    hrc.dispose()
  })

  it('keeps float DDA full-resolution and halves packed fixed-point atlas bytes at the integer grid size', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 512,
      baseRayCount: 16,
      compositionMode: 'holographic',
      holographicTraversal: 'dda-float',
      holographicFinalResolutionScale: 4,
      ddaPixelSize: 4,
      ddaQuantizationBits: 6,
      ddaTransferRange: 4,
      ddaRadianceRange: 1,
      ddaPaletteBands: 0,
      ddaPaletteExposure: 16,
    })
    hrc.init(320, 180)

    const internals = hrc as unknown as {
      _rawFinalRadianceRT: { width: number; height: number; texture: { minFilter: number } }
    }
    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 512, height: 512 })
    expect(hrc.holographicStorageBytesPerTexel).toBe(8)
    expect(hrc.holographicTransferAtlasTextures.every((texture) => texture.type === HalfFloatType)).toBe(true)
    const floatStorageBytes = hrc.estimatedHolographicStorageBytes

    hrc.holographicTraversal = 'dda-integer'

    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 80, height: 80 })
    expect(internals._rawFinalRadianceRT.texture.minFilter).toBe(NearestFilter)
    expect(hrc.holographicStorageBytesPerTexel).toBe(8)
    expect(hrc.holographicTransferAtlasTextures.every((texture) => texture.type === HalfFloatType)).toBe(true)
    const integerStorageBytes = hrc.estimatedHolographicStorageBytes
    expect(integerStorageBytes).toBeLessThan(floatStorageBytes / 12)

    hrc.holographicTraversal = 'dda-fixed'

    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 80, height: 80 })
    expect(hrc.holographicStorageBytesPerTexel).toBe(4)
    expect(hrc.holographicTransferAtlasTextures.every((texture) => texture.type === UnsignedByteType)).toBe(true)
    expect(hrc.holographicRadianceAtlasTextures.every((texture) => texture.type === UnsignedByteType)).toBe(true)
    expect(hrc.estimatedHolographicStorageBytes).toBe(integerStorageBytes / 2)

    hrc.ddaQuantizationBits = 99
    hrc.ddaTransferRange = 0
    hrc.ddaRadianceRange = 100
    hrc.ddaPaletteBands = 8
    hrc.ddaPaletteExposure = 0
    expect(hrc.ddaQuantizationBits).toBe(8)
    expect(hrc.ddaTransferRange).toBe(0.25)
    expect(hrc.ddaRadianceRange).toBe(64)
    expect(hrc.ddaPaletteBands).toBe(8)
    expect(hrc.ddaPaletteExposure).toBe(0.25)
    hrc.ddaPaletteBands = 1
    expect(hrc.ddaPaletteBands).toBe(0)
    hrc.ddaPaletteBands = 100
    expect(hrc.ddaPaletteBands).toBe(64)
    hrc.dispose()
  })

  it('pools replaced holographic atlases and reuses them when the topology returns', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      compositionMode: 'holographic',
      holographicTraversal: 'dda-integer',
      holographicFinalResolutionScale: 4,
      ddaPixelSize: 4,
    })
    const internals = hrc as unknown as {
      _holographicTransferRTs: Array<{ dispose: () => void }>
      _renderTargetPool: Set<{ dispose: () => void }>
    }
    const replacedTarget = internals._holographicTransferRTs[0]!
    const dispose = vi.spyOn(replacedTarget, 'dispose')

    hrc.holographicTraversal = 'dda-fixed'

    expect(dispose).not.toHaveBeenCalled()
    expect(internals._renderTargetPool.has(replacedTarget)).toBe(true)

    hrc.holographicTraversal = 'dda-integer'

    expect(internals._holographicTransferRTs).toContain(replacedTarget)
    expect(internals._renderTargetPool.has(replacedTarget)).toBe(false)
    expect(dispose).not.toHaveBeenCalled()
    hrc.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('replaces and reuses output targets without destroying bound GPU textures', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      compositionMode: 'holographic',
      holographicTraversal: 'dda-fixed',
      holographicFinalResolutionScale: 4,
      ddaPixelSize: 4,
    })
    const internals = hrc as unknown as {
      _rawFinalRadianceRT: { width: number; dispose: () => void }
      _renderTargetPool: Set<{ width: number; dispose: () => void }>
    }
    hrc.setProcessingSize(128, 128)
    const outputTarget = internals._rawFinalRadianceRT
    const dispose = vi.spyOn(outputTarget, 'dispose')
    expect(outputTarget.width).toBe(32)

    hrc.ddaPixelSize = 2

    expect(internals._rawFinalRadianceRT).not.toBe(outputTarget)
    expect(internals._rawFinalRadianceRT.width).toBe(64)
    expect(internals._renderTargetPool.has(outputTarget)).toBe(true)
    expect(dispose).not.toHaveBeenCalled()

    hrc.ddaPixelSize = 4

    expect(internals._rawFinalRadianceRT).toBe(outputTarget)
    expect(internals._renderTargetPool.has(outputTarget)).toBe(false)
    expect(dispose).not.toHaveBeenCalled()
    hrc.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('derives integer DDA HRC from the physical surface instead of the cascade cap', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      maxAutoCascadeResolution: 64,
      compositionMode: 'holographic',
      holographicTraversal: 'dda-fixed',
      holographicFinalResolutionScale: 1,
      ddaPixelSize: 4,
    })
    hrc.init(360, 240)
    hrc.setProcessingSize(1280, 720)

    const internals = hrc as unknown as {
      _rawFinalRadianceRT: { width: number; height: number }
    }
    // HRC uses a square rotation-preserving domain based on the longer axis.
    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 320, height: 320 })

    hrc.holographicFinalResolutionScale = 4
    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 320, height: 320 })
    hrc.dispose()
  })

  it('reclaims retired targets only after submitted GPU work completes', async () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      compositionMode: 'holographic',
      holographicTraversal: 'dda-fixed',
      holographicFinalResolutionScale: 4,
      ddaPixelSize: 4,
    })
    const internals = hrc as unknown as {
      _rawFinalRadianceRT: { dispose: () => void }
      _renderTargetPool: Set<{ dispose: () => void }>
      _pendingRenderTargetDisposals: Set<{ dispose: () => void }>
      _flushRetiredRenderTargets: (renderer: {
        backend: { device: { queue: { onSubmittedWorkDone: () => Promise<void> } } }
      }) => void
    }
    const retiredTarget = internals._rawFinalRadianceRT
    const dispose = vi.spyOn(retiredTarget, 'dispose')
    let finishFence!: () => void
    const fence = new Promise<void>((resolve) => {
      finishFence = resolve
    })

    hrc.ddaPixelSize = 2
    internals._flushRetiredRenderTargets({
      backend: { device: { queue: { onSubmittedWorkDone: () => fence } } },
    })

    expect(internals._renderTargetPool.size).toBe(0)
    expect(internals._pendingRenderTargetDisposals.has(retiredTarget)).toBe(true)
    expect(dispose).not.toHaveBeenCalled()

    finishFence()
    await fence
    await Promise.resolve()

    expect(internals._pendingRenderTargetDisposals.has(retiredTarget)).toBe(false)
    expect(dispose).toHaveBeenCalledTimes(1)
    hrc.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('adds hue-preserving palette output only to DDA modes', () => {
    const hrc = new HierarchicalRadianceCascades({
      compositionMode: 'holographic',
      holographicTraversal: 'sdf',
      filterRadius: 0,
      filterStrength: 0,
      mipStrength: 0,
      ddaPaletteBands: 16,
    })
    const internals = hrc as unknown as {
      _usesDdaPalette: () => boolean
      _usesFilteredOutput: () => boolean
    }

    expect(internals._usesDdaPalette()).toBe(false)
    expect(internals._usesFilteredOutput()).toBe(false)

    hrc.holographicTraversal = 'dda-float'
    expect(internals._usesDdaPalette()).toBe(true)
    expect(internals._usesFilteredOutput()).toBe(true)

    hrc.ddaPaletteBands = 0
    expect(internals._usesDdaPalette()).toBe(false)
    expect(internals._usesFilteredOutput()).toBe(false)
    hrc.dispose()
  })

  it('counts direct T0-T2 holographic transfer work only in holographic mode', () => {
    const hrc = new HierarchicalRadianceCascades({
      compositionMode: 'hierarchical',
      cascadeResolution: 64,
      baseRayCount: 4,
      holographicFinalResolutionScale: 1,
      shortIntervalCount: 4,
      compositionLevels: 2,
      raymarchSteps: 64,
      filterRadius: 0,
      filterStrength: 0,
      mipStrength: 0,
    })

    expect(hrc.estimatedHolographicDirectTransferPassCount).toBe(0)
    expect(hrc.estimatedHolographicDirectTransferTexelCount).toBe(0)
    expect(hrc.estimatedHolographicRecursiveTransferPassCount).toBe(0)
    expect(hrc.estimatedHolographicRecursiveTransferTexelCount).toBe(0)
    expect(hrc.estimatedHolographicRadiancePassCount).toBe(0)
    expect(hrc.estimatedHolographicRadianceTexelCount).toBe(0)
    expect(hrc.finalRadianceReadoutMode).toBe('interval-atlas')
    expect(hrc.estimatedPassCount).toBe(4)
    expect(hrc.estimatedRaymarchSampleCount).toBe(64 * 64 * 4 * 64)

    hrc.compositionMode = 'holographic'

    expect(hrc.estimatedHolographicDirectTransferPassCount).toBe(3)
    expect(hrc.estimatedHolographicDirectTransferTexelCount).toBe(15_872)
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(15_872 * 64)
    expect(hrc.estimatedHolographicRecursiveTransferPassCount).toBe(2)
    expect(hrc.estimatedHolographicRecursiveTransferTexelCount).toBe(8_576)
    expect(hrc.estimatedHolographicRadiancePassCount).toBe(4)
    expect(hrc.estimatedHolographicRadianceTexelCount).toBe(16_384)
    expect(hrc.finalRadianceReadoutMode).toBe('holographic-r0')
    expect(hrc.estimatedPassCount).toBe(10)
    expect(hrc.estimatedRaymarchTexelCount).toBe(0)
    expect(hrc.estimatedPhysicalRaymarchTexelCount).toBe(0)
    expect(hrc.estimatedRaymarchSampleCount).toBe(15_872 * 64)

    hrc.holographicTraversal = 'dda-float'

    // T0/T1/T2 visit at most 5/9/17 supercover cells respectively;
    // raymarchSteps is an SDF-only budget and must not inflate DDA estimates.
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(6_144 * 5 + 5_120 * 9 + 4_608 * 17)
    expect(hrc.estimatedRaymarchSampleCount).toBe(155_136)
    hrc.dispose()
  })

  it('locks the holographic shipping visual budget without wide blur passes', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 512,
      baseRayCount: 16,
      compositionMode: 'holographic',
      raymarchSteps: 64,
      blueNoiseStrength: 0,
      intervalOverlap: 0,
      filterRadius: 0.7,
      filterStrength: 1,
      filterDiagonals: false,
      filterJitterStrength: 0,
      mipBlur: 0,
      mipStrength: 0.4,
      wideDownsampleFactor: 2,
      wideLevels: 1,
      holographicFinalResolutionScale: 1,
      shortIntervalCount: 4,
      compositionLevels: 2,
    })

    expect(hrc.finalRadianceReadoutMode).toBe('holographic-r0')
    expect(hrc.estimatedHolographicDirectTransferPassCount).toBe(3)
    expect(hrc.estimatedHolographicRecursiveTransferPassCount).toBe(4)
    expect(hrc.estimatedHolographicRadiancePassCount).toBe(6)
    expect(hrc.wideFilterEnabled).toBe(true)
    expect(hrc.wideBlurEnabled).toBe(false)
    expect(hrc.estimatedPassCount).toBe(16)
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(16_252_928)
    expect(hrc.estimatedRaymarchSampleCount).toBe(16_252_928)
    hrc.dispose()
  })

  it('scales holographic final output resolution for quality probes', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 512,
      baseRayCount: 16,
      compositionMode: 'holographic',
      raymarchSteps: 64,
      filterRadius: 0.7,
      filterStrength: 1,
      mipBlur: 0,
      mipStrength: 0.4,
      wideDownsampleFactor: 2,
      wideLevels: 1,
      holographicFinalResolutionScale: 1,
    })

    const internals = hrc as unknown as {
      _finalRadianceRT: { width: number; height: number }
      _rawFinalRadianceRT: { width: number; height: number }
      _wideRadianceRT: { width: number; height: number }
    }

    expect(hrc.holographicFinalResolutionScale).toBe(1)
    expect(internals._finalRadianceRT).toMatchObject({ width: 128, height: 128 })
    expect(hrc.holographicLevelCount).toBe(6)
    expect(hrc.estimatedPassCount).toBe(16)
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(16_252_928)

    hrc.holographicFinalResolutionScale = 2

    expect(hrc.holographicFinalResolutionScale).toBe(2)
    expect(internals._finalRadianceRT).toMatchObject({ width: 256, height: 256 })
    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 256, height: 256 })
    expect(internals._wideRadianceRT).toMatchObject({ width: 128, height: 128 })
    expect(hrc.holographicLevelCount).toBe(7)
    expect(hrc.estimatedPassCount).toBe(18)
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(65_011_712)

    hrc.holographicFinalResolutionScale = 4

    expect(internals._finalRadianceRT).toMatchObject({ width: 512, height: 512 })
    expect(hrc.holographicLevelCount).toBe(8)
    expect(hrc.estimatedPassCount).toBe(20)
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(260_046_848)
    hrc.dispose()
  })

  it('preserves holographic render targets when only world bounds resize', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 128,
      compositionMode: 'holographic',
      holographicFinalResolutionScale: 4,
    })
    hrc.init(320, 180)

    const internals = hrc as unknown as {
      _holographicTransferRTs: unknown[]
      _holographicRadianceRTs: unknown[]
    }
    const transferTargets = [...internals._holographicTransferRTs]
    const radianceTargets = [...internals._holographicRadianceRTs]

    hrc.resize(400, 180)

    expect(internals._holographicTransferRTs).toEqual(transferTargets)
    expect(internals._holographicRadianceRTs).toEqual(radianceTargets)
    for (let i = 0; i < transferTargets.length; i++) {
      expect(internals._holographicTransferRTs[i]).toBe(transferTargets[i])
    }
    for (let i = 0; i < radianceTargets.length; i++) {
      expect(internals._holographicRadianceRTs[i]).toBe(radianceTargets[i])
    }
    hrc.dispose()
  })

  it('preserves packed fixed-point atlas identities and dimensions across surface-only resizes', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 512,
      compositionMode: 'holographic',
      holographicTraversal: 'dda-fixed',
      holographicFinalResolutionScale: 4,
      ddaPixelSize: 4,
    })
    hrc.init(512, 512)

    const transferTargets = [...hrc.holographicTransferAtlasTextures]
    const radianceTargets = [...hrc.holographicRadianceAtlasTextures]
    const internals = hrc as unknown as {
      _rawFinalRadianceRT: { width: number; height: number }
    }

    hrc.resize(913, 517)

    expect(internals._rawFinalRadianceRT).toMatchObject({ width: 128, height: 128 })
    expect(hrc.holographicTransferAtlasTextures).toEqual(transferTargets)
    expect(hrc.holographicRadianceAtlasTextures).toEqual(radianceTargets)
    expect(hrc.holographicTransferAtlasTextures.every((texture) => texture.type === UnsignedByteType)).toBe(true)
    expect(hrc.holographicRadianceAtlasTextures.every((texture) => texture.type === UnsignedByteType)).toBe(true)
    hrc.dispose()
  })

  it('supports broad GI without extra wide blur passes', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 128,
      mipBlur: 0,
      mipStrength: 0.25,
      wideLevels: 2,
    })
    hrc.init(128, 64)

    const internals = hrc as unknown as {
      _sdfTexture: DataTexture | null
      _usesMipFilter: () => boolean
      _usesWideBlur: () => boolean
      _usesSecondWideLevel: () => boolean
      _ensureWideRadianceMaterials: () => void
      _wideDownsampleMaterial: unknown
      _wideBlurHMaterial: unknown
      _wideBlurVMaterial: unknown
      _wideDownsampleMaterial2: unknown
    }
    internals._sdfTexture = createTexture()

    expect(internals._usesMipFilter()).toBe(true)
    expect(internals._usesWideBlur()).toBe(false)
    expect(internals._usesSecondWideLevel()).toBe(false)
    expect(hrc.wideFilterEnabled).toBe(true)
    expect(hrc.wideBlurEnabled).toBe(false)

    internals._ensureWideRadianceMaterials()
    expect(internals._wideDownsampleMaterial).toBeTruthy()
    expect(internals._wideBlurHMaterial).toBeNull()
    expect(internals._wideBlurVMaterial).toBeNull()
    expect(internals._wideDownsampleMaterial2).toBeNull()

    hrc.mipBlur = 0.5
    internals._ensureWideRadianceMaterials()
    expect(internals._usesWideBlur()).toBe(true)
    expect(internals._usesSecondWideLevel()).toBe(true)
    expect(hrc.wideBlurEnabled).toBe(true)
    expect(internals._wideBlurHMaterial).toBeTruthy()
    expect(internals._wideBlurVMaterial).toBeTruthy()
    expect(internals._wideDownsampleMaterial2).toBeTruthy()
    hrc.dispose()
  })

  it('supports runtime tuning for short-interval shader quality knobs', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      raymarchSteps: 24,
      blueNoiseStrength: 0.35,
    })
    hrc.init(128, 64)

    const internals = hrc as unknown as {
      _shortIntervalMaterial: unknown
      _blueNoiseStrengthNode: { value: number }
    }

    hrc.raymarchSteps = 999
    expect(hrc.raymarchSteps).toBe(96)
    expect(internals._shortIntervalMaterial).toBeNull()

    hrc.blueNoiseStrength = 99
    expect(hrc.blueNoiseStrength).toBe(1)
    expect(internals._blueNoiseStrengthNode.value).toBe(1)

    hrc.dispose()
  })

  it('keeps the baked blue-noise texture stable across HRC resizing and tuning', () => {
    const hrc = new HierarchicalRadianceCascades({ cascadeResolution: 64 })
    const internals = hrc as unknown as { _blueNoiseTexture: unknown }
    const texture = internals._blueNoiseTexture

    hrc.init(128, 128)
    hrc.shortIntervalCount = 16
    hrc.blueNoiseStrength = 0.8
    hrc.raymarchSteps = 48

    expect(internals._blueNoiseTexture).toBe(texture)
    hrc.dispose()
  })
})
