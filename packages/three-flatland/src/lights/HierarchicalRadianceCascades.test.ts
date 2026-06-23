import { describe, expect, it, vi } from 'vitest'
import { DataTexture, FloatType, RGBAFormat } from 'three'
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
      compositionMode: 'hierarchical',
      mipBlur: 0,
      mipStrength: 0.25,
      shortIntervalCount: 4,
      compositionLevels: 2,
    })
    expect(hrc.wideFilterEnabled).toBe(true)
    expect(hrc.wideBlurEnabled).toBe(false)
  })

  it('starts from validated RC quality knobs and adds composition-specific knobs', () => {
    expect(HIERARCHICAL_RADIANCE_CASCADES_PRESETS.balanced).toMatchObject({
      baseRayCount: RADIANCE_CASCADES_PRESETS.balanced.baseRayCount,
      raymarchSteps: RADIANCE_CASCADES_PRESETS.balanced.raymarchSteps,
      maxAutoCascadeResolution: 512,
      sceneRadianceDownsampleFactor:
        RADIANCE_CASCADES_PRESETS.balanced.sceneRadianceDownsampleFactor,
      filterJitterStrength: RADIANCE_CASCADES_PRESETS.balanced.filterJitterStrength,
      mipBlur: 0,
      mipStrength: RADIANCE_CASCADES_PRESETS.balanced.mipStrength,
      shortIntervalCount: 4,
      compositionLevels: 2,
      compositionMode: 'hierarchical',
    })

    expect(HIERARCHICAL_RADIANCE_CASCADES_PRESETS.quality).toMatchObject({
      maxAutoCascadeResolution: 1024,
      shortIntervalCount: 8,
      compositionLevels: 3,
      compositionMode: 'hierarchical',
    })

    for (const preset of Object.values(HIERARCHICAL_RADIANCE_CASCADES_PRESETS)) {
      expect(preset.compositionMode).toBe('hierarchical')
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
      shortIntervalCount: 8,
      compositionLevels: 3,
      filterRadius: 0,
      filterStrength: 0,
      mipBlur: 0,
      mipStrength: 0,
      wideLevels: 2,
    })

    expect(hrc.estimatedCompositionPassCount).toBe(3)
    expect(hrc.estimatedPassCount).toBe(6)

    hrc.mipStrength = 0.25
    expect(hrc.estimatedPassCount).toBe(8)

    hrc.mipBlur = 0.5
    expect(hrc.estimatedPassCount).toBe(13)

    hrc.wideLevels = 1
    expect(hrc.estimatedPassCount).toBe(10)

    hrc.shortIntervalCount = 12
    hrc.compositionLevels = 4
    expect(hrc.estimatedCompositionPassCount).toBe(4)
    expect(hrc.estimatedPassCount).toBe(11)
    hrc.dispose()
  })

  it('estimates raymarch loop texels and physical atlas texels for the short-interval atlas', () => {
    const hrc = new HierarchicalRadianceCascades({
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
    })

    const levels = hrc.holographicLevelInfo
    const terminal = levels.at(-1)!
    const internals = hrc as unknown as {
      _holographicTransferRTs: Array<{ width: number; height: number }>
      _holographicRadianceRTs: Array<{ width: number; height: number }>
    }

    expect(hrc.holographicLevelCount).toBe(5)
    expect(levels).toHaveLength(6)
    expect(levels[0]).toMatchObject({
      level: 0,
      probeWidth: 32,
      probeHeight: 32,
      transferDirectionCount: 2,
      radianceDirectionCount: 1,
      transferAtlasWidth: 64,
      transferAtlasHeight: 128,
      radianceAtlasWidth: 32,
      radianceAtlasHeight: 128,
    })
    expect(terminal).toMatchObject({
      level: 5,
      probeWidth: 1,
      probeHeight: 32,
      transferDirectionCount: 33,
      radianceDirectionCount: 0,
      transferAtlasWidth: 33,
      transferAtlasHeight: 128,
      radianceAtlasWidth: 0,
      radianceAtlasHeight: 0,
    })

    expect(internals._holographicTransferRTs).toHaveLength(6)
    expect(internals._holographicRadianceRTs).toHaveLength(5)
    expect(internals._holographicTransferRTs[0]).toMatchObject({ width: 64, height: 128 })
    expect(internals._holographicRadianceRTs[0]).toMatchObject({ width: 32, height: 128 })
    expect(internals._holographicTransferRTs[5]).toMatchObject({ width: 33, height: 128 })
    expect(hrc.estimatedHolographicTransferValueCount).toBe(
      levels.reduce((sum, level) => sum + level.transferValueCount, 0) * 4
    )
    expect(hrc.estimatedHolographicRadianceValueCount).toBe(
      levels.reduce((sum, level) => sum + level.radianceValueCount, 0) * 4
    )
    hrc.dispose()
  })

  it('counts direct T0-T2 holographic transfer work only in holographic mode', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      baseRayCount: 4,
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
    expect(hrc.estimatedPassCount).toBe(5)
    expect(hrc.estimatedRaymarchSampleCount).toBe(64 * 64 * 4 * 64)

    hrc.compositionMode = 'holographic'

    expect(hrc.estimatedHolographicDirectTransferPassCount).toBe(3)
    expect(hrc.estimatedHolographicDirectTransferTexelCount).toBe(19_456)
    expect(hrc.estimatedHolographicDirectTransferSampleCount).toBe(19_456 * 16)
    expect(hrc.estimatedHolographicRecursiveTransferPassCount).toBe(3)
    expect(hrc.estimatedHolographicRecursiveTransferTexelCount).toBe(13_184)
    expect(hrc.estimatedHolographicRadiancePassCount).toBe(5)
    expect(hrc.estimatedHolographicRadianceTexelCount).toBe(20_480)
    expect(hrc.finalRadianceReadoutMode).toBe('holographic-r0')
    expect(hrc.estimatedPassCount).toBe(13)
    expect(hrc.estimatedRaymarchTexelCount).toBe(0)
    expect(hrc.estimatedPhysicalRaymarchTexelCount).toBe(0)
    expect(hrc.estimatedRaymarchSampleCount).toBe(19_456 * 16)
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

  it('supports runtime tuning for short-interval shader and scene radiance quality knobs', () => {
    const hrc = new HierarchicalRadianceCascades({
      cascadeResolution: 64,
      sceneRadianceDownsampleFactor: 2,
      raymarchSteps: 24,
      blueNoiseStrength: 0.35,
    })
    hrc.init(128, 64)

    const internals = hrc as unknown as {
      _sceneRadianceRT: { width: number; height: number } | null
      _shortIntervalMaterial: unknown
      _blueNoiseStrengthNode: { value: number }
    }
    expect(internals._sceneRadianceRT).toMatchObject({ width: 32, height: 32 })

    hrc.raymarchSteps = 999
    expect(hrc.raymarchSteps).toBe(96)
    expect(internals._shortIntervalMaterial).toBeNull()

    hrc.blueNoiseStrength = 99
    expect(hrc.blueNoiseStrength).toBe(1)
    expect(internals._blueNoiseStrengthNode.value).toBe(1)

    hrc.sceneRadianceDownsampleFactor = 4
    expect(hrc.sceneRadianceDownsampleFactor).toBe(4)
    expect(internals._sceneRadianceRT).toMatchObject({ width: 16, height: 16 })

    hrc.sceneRadianceDownsampleFactor = -1
    expect(hrc.sceneRadianceDownsampleFactor).toBe(1)
    expect(internals._sceneRadianceRT).toMatchObject({ width: 64, height: 64 })
    hrc.dispose()
  })

  it('reuses the baked blue-noise texture from the baseline RC path', () => {
    const rc = new RadianceCascades()
    const hrc = new HierarchicalRadianceCascades()
    const rcNoise = (rc as unknown as { _blueNoiseTexture: unknown })._blueNoiseTexture
    const hrcNoise = (hrc as unknown as { _blueNoiseTexture: unknown })._blueNoiseTexture

    expect(hrcNoise).toBe(rcNoise)

    rc.dispose()
    hrc.dispose()
  })

  it('keeps the baked blue-noise texture stable across HRC resizing and tuning', () => {
    const hrc = new HierarchicalRadianceCascades({ cascadeResolution: 64 })
    const internals = hrc as unknown as { _blueNoiseTexture: unknown }
    const texture = internals._blueNoiseTexture

    hrc.init(128, 128)
    hrc.shortIntervalCount = 16
    hrc.sceneRadianceDownsampleFactor = 4
    hrc.blueNoiseStrength = 0.8
    hrc.raymarchSteps = 48

    expect(internals._blueNoiseTexture).toBe(texture)
    hrc.dispose()
  })
})
