import { describe, expect, it, vi } from 'vitest'
import { DataTexture, FloatType, NearestFilter, RepeatWrapping, RGBAFormat, Vector2 } from 'three'
import { uniform } from 'three/tsl'
import {
  RadianceCascades,
  RADIANCE_CASCADES_PRESETS,
  createRadianceCascadesConfig,
} from './RadianceCascades'

describe('RadianceCascades', () => {
  function createLightsTexture(): DataTexture {
    const texture = new DataTexture(new Float32Array(4 * 4), 1, 4, RGBAFormat, FloatType)
    texture.needsUpdate = true
    return texture
  }

  it('provides tuned quality presets with override support', () => {
    expect(RADIANCE_CASCADES_PRESETS.fast.baseRayCount).toBe(4)
    expect(RADIANCE_CASCADES_PRESETS.balanced.baseRayCount).toBe(16)
    expect(RADIANCE_CASCADES_PRESETS.fast.sceneRadianceDownsampleFactor).toBe(4)
    expect(RADIANCE_CASCADES_PRESETS.balanced.sceneRadianceDownsampleFactor).toBe(2)
    expect(RADIANCE_CASCADES_PRESETS.quality.sceneRadianceDownsampleFactor).toBe(1)
    expect(RADIANCE_CASCADES_PRESETS.balanced.maxAutoCascadeResolution).toBe(1024)
    expect(RADIANCE_CASCADES_PRESETS.fast.raymarchSteps).toBe(24)
    expect(RADIANCE_CASCADES_PRESETS.balanced.raymarchSteps).toBe(32)
    expect(RADIANCE_CASCADES_PRESETS.quality.raymarchSteps).toBe(48)
    expect(RADIANCE_CASCADES_PRESETS.balanced.blueNoiseStrength).toBe(0.45)
    expect(RADIANCE_CASCADES_PRESETS.balanced.intervalOverlap).toBe(0.1)
    expect(RADIANCE_CASCADES_PRESETS.fast.filterDiagonals).toBe(false)
    expect(RADIANCE_CASCADES_PRESETS.balanced.filterDiagonals).toBe(true)
    expect(RADIANCE_CASCADES_PRESETS.fast.filterJitterStrength).toBe(0)
    expect(RADIANCE_CASCADES_PRESETS.balanced.filterJitterStrength).toBe(0.35)
    expect(RADIANCE_CASCADES_PRESETS.quality.filterJitterStrength).toBe(0.25)
    expect(RADIANCE_CASCADES_PRESETS.balanced.mipBlur).toBe(0.5)
    expect(RADIANCE_CASCADES_PRESETS.balanced.mipStrength).toBe(0.25)
    expect(RADIANCE_CASCADES_PRESETS.balanced.wideDownsampleFactor).toBe(2)
    expect(RADIANCE_CASCADES_PRESETS.quality.wideDownsampleFactor).toBe(2)
    expect(RADIANCE_CASCADES_PRESETS.quality.wideLevels).toBe(2)

    expect(createRadianceCascadesConfig('balanced', { mipStrength: 0.1 })).toMatchObject({
      baseRayCount: 16,
      sceneRadianceDownsampleFactor: 2,
      raymarchSteps: 32,
      filterJitterStrength: 0.35,
      mipBlur: 0.5,
      mipStrength: 0.1,
      wideDownsampleFactor: 2,
    })
  })

  it('exposes a stable final radiance texture before and after init', () => {
    const radiance = new RadianceCascades({
      cascadeCount: 3,
      baseRayCount: 4,
      cascadeResolution: 64,
    })

    const texture = radiance.finalRadianceTexture
    radiance.init(128, 64, createLightsTexture(), uniform(0))

    expect(radiance.finalRadianceTexture).toBe(texture)
    radiance.dispose()
  })

  it('sizes cascade render targets from the configured resolution', () => {
    const radiance = new RadianceCascades({
      cascadeCount: 3,
      baseRayCount: 4,
      cascadeResolution: 64,
    })

    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const cascadeRTs = (
      radiance as unknown as { _cascadeRTs: Array<{ width: number; height: number }> }
    )._cascadeRTs
    expect(cascadeRTs).toHaveLength(3)
    expect(cascadeRTs.map((rt) => [rt.width, rt.height])).toEqual([
      [64, 64],
      [64, 64],
      [64, 64],
    ])
    radiance.dispose()
  })

  it('sizes final irradiance to the base probe grid', () => {
    const radiance = new RadianceCascades({
      baseRayCount: 4,
      cascadeResolution: 64,
    })

    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const finalRT = (radiance as unknown as { _finalRadianceRT: { width: number; height: number } })
      ._finalRadianceRT
    expect(finalRT.width).toBe(32)
    expect(finalRT.height).toBe(32)
    radiance.dispose()
  })

  it('caps auto cascade resolution for predictable performance', () => {
    const radiance = new RadianceCascades({
      baseRayCount: 16,
      maxAutoCascadeResolution: 512,
    })

    radiance.init(1_000, 1_000, createLightsTexture(), uniform(0))

    expect(radiance.config.cascadeResolution).toBe(512)
    const finalRT = (radiance as unknown as { _finalRadianceRT: { width: number; height: number } })
      ._finalRadianceRT
    expect(finalRT.width).toBe(128)
    expect(finalRT.height).toBe(128)
    radiance.dispose()
  })

  it('sizes scene radiance from the configured downsample factor', () => {
    const radiance = new RadianceCascades({
      cascadeResolution: 128,
      sceneRadianceDownsampleFactor: 2,
    })

    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const sceneRT = (
      radiance as unknown as {
        _sceneRadianceRT: { width: number; height: number } | null
      }
    )._sceneRadianceRT
    expect(sceneRT?.width).toBe(64)
    expect(sceneRT?.height).toBe(64)

    radiance.sceneRadianceDownsampleFactor = 4
    expect(radiance.sceneRadianceDownsampleFactor).toBe(4)
    expect(sceneRT?.width).toBe(32)
    expect(sceneRT?.height).toBe(32)
    radiance.dispose()
  })

  it('sizes raw and filtered final irradiance targets together', () => {
    const radiance = new RadianceCascades({
      baseRayCount: 16,
      cascadeResolution: 128,
    })

    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _rawFinalRadianceRT: { width: number; height: number }
      _wideRadianceRT: { width: number; height: number }
      _wideBlurRT: { width: number; height: number }
      _wideRadianceRT2: { width: number; height: number }
      _wideBlurRT2: { width: number; height: number }
      _finalRadianceRT: { width: number; height: number }
      _finalTexelSizeNode: { value: Vector2 }
      _wideTexelSizeNode: { value: Vector2 }
      _wideTexelSizeNode2: { value: Vector2 }
    }
    expect(internals._rawFinalRadianceRT.width).toBe(32)
    expect(internals._rawFinalRadianceRT.height).toBe(32)
    expect(internals._wideRadianceRT.width).toBe(16)
    expect(internals._wideRadianceRT.height).toBe(16)
    expect(internals._wideBlurRT.width).toBe(16)
    expect(internals._wideBlurRT.height).toBe(16)
    expect(internals._wideRadianceRT2.width).toBe(8)
    expect(internals._wideRadianceRT2.height).toBe(8)
    expect(internals._wideBlurRT2.width).toBe(8)
    expect(internals._wideBlurRT2.height).toBe(8)
    expect(internals._finalRadianceRT.width).toBe(32)
    expect(internals._finalRadianceRT.height).toBe(32)
    expect(internals._finalTexelSizeNode.value.x).toBeCloseTo(1 / 32)
    expect(internals._finalTexelSizeNode.value.y).toBeCloseTo(1 / 32)
    expect(internals._wideTexelSizeNode.value.x).toBeCloseTo(1 / 16)
    expect(internals._wideTexelSizeNode.value.y).toBeCloseTo(1 / 16)
    expect(internals._wideTexelSizeNode2.value.x).toBeCloseTo(1 / 8)
    expect(internals._wideTexelSizeNode2.value.y).toBeCloseTo(1 / 8)
    radiance.dispose()
  })

  it('sizes wide approximation targets from the configured downsample factor', () => {
    const radiance = new RadianceCascades({
      baseRayCount: 16,
      cascadeResolution: 128,
      wideDownsampleFactor: 4,
    })

    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _wideRadianceRT: { width: number; height: number }
      _wideBlurRT: { width: number; height: number }
      _wideRadianceRT2: { width: number; height: number }
      _wideBlurRT2: { width: number; height: number }
      _wideTexelSizeNode: { value: Vector2 }
      _wideTexelSizeNode2: { value: Vector2 }
    }
    expect(internals._wideRadianceRT.width).toBe(8)
    expect(internals._wideRadianceRT.height).toBe(8)
    expect(internals._wideBlurRT.width).toBe(8)
    expect(internals._wideBlurRT.height).toBe(8)
    expect(internals._wideRadianceRT2.width).toBe(2)
    expect(internals._wideRadianceRT2.height).toBe(2)
    expect(internals._wideBlurRT2.width).toBe(2)
    expect(internals._wideBlurRT2.height).toBe(2)
    expect(internals._wideTexelSizeNode.value.x).toBeCloseTo(1 / 8)
    expect(internals._wideTexelSizeNode.value.y).toBeCloseTo(1 / 8)
    expect(internals._wideTexelSizeNode2.value.x).toBeCloseTo(1 / 2)
    expect(internals._wideTexelSizeNode2.value.y).toBeCloseTo(1 / 2)
    radiance.dispose()
  })

  it('clamps final filter uniforms', () => {
    const radiance = new RadianceCascades()
    const internals = radiance as unknown as {
      _filterRadiusNode: { value: number }
      _filterStrengthNode: { value: number }
      _filterJitterStrengthNode: { value: number }
      _blueNoiseStrengthNode: { value: number }
      _mipBlurNode: { value: number }
      _mipStrengthNode: { value: number }
    }

    radiance.blueNoiseStrength = 99
    radiance.raymarchSteps = 999
    radiance.intervalOverlap = 99
    radiance.sceneRadianceDownsampleFactor = 99
    radiance.filterRadius = -1
    radiance.filterStrength = 99
    radiance.filterJitterStrength = 99
    radiance.mipBlur = 99
    radiance.mipStrength = -1
    radiance.wideDownsampleFactor = 99
    expect(radiance.blueNoiseStrength).toBe(1)
    expect(radiance.raymarchSteps).toBe(96)
    expect(radiance.intervalOverlap).toBe(0.45)
    expect(radiance.sceneRadianceDownsampleFactor).toBe(4)
    expect(radiance.filterRadius).toBe(0)
    expect(radiance.filterStrength).toBe(1)
    expect(radiance.filterJitterStrength).toBe(1)
    expect(radiance.mipBlur).toBe(1)
    expect(radiance.mipStrength).toBe(0)
    expect(radiance.wideDownsampleFactor).toBe(4)
    expect(internals._blueNoiseStrengthNode.value).toBe(1)
    expect(internals._filterRadiusNode.value).toBe(0)
    expect(internals._filterStrengthNode.value).toBe(1)
    expect(internals._filterJitterStrengthNode.value).toBe(1)
    expect(internals._mipBlurNode.value).toBe(1)
    expect(internals._mipStrengthNode.value).toBe(0)

    radiance.raymarchSteps = -1
    expect(radiance.raymarchSteps).toBe(8)
    radiance.dispose()
  })

  it('only uses the filtered-output path when local filtering or broad GI is enabled', () => {
    const radiance = new RadianceCascades({
      filterRadius: 0,
      filterStrength: 0,
      mipBlur: 0,
      mipStrength: 0,
    })
    const internals = radiance as unknown as { _usesFilteredOutput: () => boolean }

    expect(internals._usesFilteredOutput()).toBe(false)

    radiance.filterStrength = 1
    expect(internals._usesFilteredOutput()).toBe(false)

    radiance.filterRadius = 1
    expect(internals._usesFilteredOutput()).toBe(true)

    radiance.filterRadius = 0
    radiance.mipStrength = 0.25
    expect(internals._usesFilteredOutput()).toBe(true)

    radiance.mipStrength = 0
    radiance.mipBlur = 0.5
    expect(internals._usesFilteredOutput()).toBe(false)

    radiance.dispose()
  })

  it('rebuilds the filter material only when local filtering toggles on or off', () => {
    const radiance = new RadianceCascades({
      filterRadius: 1,
      filterStrength: 0.8,
      mipStrength: 0.25,
    })
    const dispose = vi.fn()
    const internals = radiance as unknown as {
      _filterRadianceMaterial: { dispose: () => void } | null
    }
    internals._filterRadianceMaterial = { dispose }

    radiance.filterRadius = 1.5
    expect(dispose).not.toHaveBeenCalled()
    expect(internals._filterRadianceMaterial).toBeTruthy()

    radiance.filterStrength = 0
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(internals._filterRadianceMaterial).toBeNull()

    internals._filterRadianceMaterial = { dispose }
    radiance.filterRadius = 0
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(internals._filterRadianceMaterial).toBeTruthy()

    radiance.filterStrength = 0.8
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(internals._filterRadianceMaterial).toBeTruthy()

    radiance.filterRadius = 1
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(internals._filterRadianceMaterial).toBeNull()
    radiance.dispose()
  })

  it('estimates render pass count from active RC filter and wide-GI chains', () => {
    const radiance = new RadianceCascades({
      cascadeCount: 4,
      filterRadius: 0,
      filterStrength: 0,
      mipBlur: 0,
      mipStrength: 0,
      wideLevels: 2,
    })

    expect(radiance.estimatedPassCount).toBe(6)

    radiance.mipStrength = 0.25
    expect(radiance.estimatedPassCount).toBe(8)

    radiance.mipBlur = 0.5
    expect(radiance.estimatedPassCount).toBe(13)

    radiance.wideLevels = 1
    expect(radiance.estimatedPassCount).toBe(10)

    radiance.filterRadius = 1
    radiance.filterStrength = 0.8
    expect(radiance.estimatedPassCount).toBe(10)
    radiance.dispose()
  })

  it('estimates physical raymarch texels and samples for RC cascades', () => {
    const radiance = new RadianceCascades({
      cascadeResolution: 64,
      cascadeCount: 3,
      raymarchSteps: 24,
    })

    expect(radiance.estimatedRaymarchTexelCount).toBe(64 * 64 * 3)
    expect(radiance.estimatedRaymarchSampleCount).toBe(64 * 64 * 3 * 24)
    radiance.dispose()
  })

  it('creates a repeat-wrapped nearest-filtered blue-noise jitter texture', () => {
    const radiance = new RadianceCascades()
    const texture = (radiance as unknown as { _blueNoiseTexture: DataTexture })._blueNoiseTexture

    expect(texture.image.width).toBe(32)
    expect(texture.image.height).toBe(32)
    expect(texture.minFilter).toBe(NearestFilter)
    expect(texture.magFilter).toBe(NearestFilter)
    expect(texture.wrapS).toBe(RepeatWrapping)
    expect(texture.wrapT).toBe(RepeatWrapping)

    const data = texture.image.data as Uint8Array
    let min = 255
    let max = 0
    const seen = new Set<number>()
    for (let i = 0; i < data.length; i += 4) {
      min = Math.min(min, data[i]!)
      max = Math.max(max, data[i]!)
      seen.add(data[i]!)
      expect(data[i + 1]).toBe(data[i])
      expect(data[i + 2]).toBe(data[i])
      expect(data[i + 3]).toBe(255)
    }

    expect(min).toBe(0)
    expect(max).toBe(255)
    expect(seen.size).toBeGreaterThan(200)
    radiance.dispose()
  })

  it('reuses the generated blue-noise texture across radiance cascade instances', () => {
    const first = new RadianceCascades()
    const second = new RadianceCascades()

    const firstTexture = (first as unknown as { _blueNoiseTexture: DataTexture })._blueNoiseTexture
    const secondTexture = (second as unknown as { _blueNoiseTexture: DataTexture })._blueNoiseTexture

    expect(secondTexture).toBe(firstTexture)

    first.dispose()
    second.dispose()
  })

  it('clamps wide approximation levels', () => {
    const radiance = new RadianceCascades()

    radiance.wideLevels = 99
    expect(radiance.wideLevels).toBe(2)

    radiance.wideLevels = -1
    expect(radiance.wideLevels).toBe(1)

    radiance.wideLevels = 1.6
    expect(radiance.wideLevels).toBe(2)
    radiance.dispose()
  })

  it('creates second-level wide approximation materials only when enabled', () => {
    const radiance = new RadianceCascades({
      baseRayCount: 16,
      cascadeResolution: 128,
      mipBlur: 0.5,
      mipStrength: 0.25,
      wideLevels: 1,
    })
    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _sdfTexture: DataTexture | null
      _ensureWideRadianceMaterials: () => void
      _wideDownsampleMaterial: unknown
      _wideBlurHMaterial: unknown
      _wideBlurVMaterial: unknown
      _wideDownsampleMaterial2: unknown
      _wideBlurHMaterial2: unknown
      _wideBlurVMaterial2: unknown
    }
    internals._sdfTexture = createLightsTexture()

    internals._ensureWideRadianceMaterials()
    expect(internals._wideDownsampleMaterial).toBeTruthy()
    expect(internals._wideBlurHMaterial).toBeTruthy()
    expect(internals._wideBlurVMaterial).toBeTruthy()
    expect(internals._wideDownsampleMaterial2).toBeNull()
    expect(internals._wideBlurHMaterial2).toBeNull()
    expect(internals._wideBlurVMaterial2).toBeNull()

    radiance.wideLevels = 2
    internals._ensureWideRadianceMaterials()
    expect(internals._wideDownsampleMaterial2).toBeTruthy()
    expect(internals._wideBlurHMaterial2).toBeTruthy()
    expect(internals._wideBlurVMaterial2).toBeTruthy()
    radiance.dispose()
  })

  it('supports broad GI without extra wide blur passes', () => {
    const radiance = new RadianceCascades({
      baseRayCount: 16,
      cascadeResolution: 128,
      mipBlur: 0,
      mipStrength: 0.25,
      wideLevels: 2,
    })
    radiance.init(128, 64, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
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
    internals._sdfTexture = createLightsTexture()

    expect(internals._usesMipFilter()).toBe(true)
    expect(internals._usesWideBlur()).toBe(false)
    expect(internals._usesSecondWideLevel()).toBe(false)
    expect(radiance.wideFilterEnabled).toBe(true)
    expect(radiance.wideBlurEnabled).toBe(false)

    internals._ensureWideRadianceMaterials()
    expect(internals._wideDownsampleMaterial).toBeTruthy()
    expect(internals._wideBlurHMaterial).toBeNull()
    expect(internals._wideBlurVMaterial).toBeNull()
    expect(internals._wideDownsampleMaterial2).toBeNull()

    radiance.mipBlur = 0.5
    internals._ensureWideRadianceMaterials()
    expect(internals._usesWideBlur()).toBe(true)
    expect(internals._usesSecondWideLevel()).toBe(true)
    expect(radiance.wideBlurEnabled).toBe(true)
    expect(internals._wideBlurHMaterial).toBeTruthy()
    expect(internals._wideBlurVMaterial).toBeTruthy()
    expect(internals._wideDownsampleMaterial2).toBeTruthy()
    radiance.dispose()
  })

  it('rebuilds only the final filter material when diagonal filtering changes', () => {
    const radiance = new RadianceCascades({ filterDiagonals: true })
    const dispose = vi.fn()
    const internals = radiance as unknown as {
      _filterRadianceMaterial: { dispose: () => void } | null
    }
    internals._filterRadianceMaterial = { dispose }

    radiance.filterDiagonals = true
    expect(dispose).not.toHaveBeenCalled()
    expect(internals._filterRadianceMaterial).not.toBeNull()

    radiance.filterDiagonals = false
    expect(radiance.filterDiagonals).toBe(false)
    expect(dispose).toHaveBeenCalledOnce()
    expect(internals._filterRadianceMaterial).toBeNull()
    radiance.dispose()
  })

  it('clamps cascadeCount and rebuilds cascade targets', () => {
    const radiance = new RadianceCascades({
      cascadeCount: 3,
      baseRayCount: 4,
      cascadeResolution: 32,
    })
    radiance.init(64, 64, createLightsTexture(), uniform(0))

    radiance.cascadeCount = 99
    expect(radiance.cascadeCount).toBe(6)
    expect((radiance as unknown as { _cascadeRTs: unknown[] })._cascadeRTs).toHaveLength(6)

    radiance.cascadeCount = -1
    expect(radiance.cascadeCount).toBe(2)
    expect((radiance as unknown as { _cascadeRTs: unknown[] })._cascadeRTs).toHaveLength(2)
    radiance.dispose()
  })

  it('updates auto interval uniforms when world bounds change', () => {
    const radiance = new RadianceCascades({
      cascadeCount: 3,
      baseRayCount: 4,
      cascadeResolution: 32,
      intervalOverlap: 0,
    })
    radiance.init(90, 120, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _intervalOffsetNodes: Array<{ value: number }>
      _intervalRangeNodes: Array<{ value: number }>
      _minStepNodes: Array<{ value: number }>
    }
    const initialRange = internals._intervalRangeNodes[0]!.value

    radiance.setWorldBounds(new Vector2(180, 240), new Vector2(-90, -120))

    expect(internals._intervalOffsetNodes.map((node) => node.value)).toEqual([
      0,
      internals._intervalRangeNodes[0]!.value,
      internals._intervalRangeNodes[0]!.value + internals._intervalRangeNodes[1]!.value,
    ])
    expect(internals._intervalRangeNodes[0]!.value).toBeCloseTo(initialRange * 2)
    expect(internals._intervalRangeNodes[1]!.value).toBeCloseTo(
      internals._intervalRangeNodes[0]!.value * 4
    )
    expect(internals._intervalRangeNodes[2]!.value).toBeCloseTo(
      internals._intervalRangeNodes[1]!.value * 4
    )
    expect(internals._minStepNodes[0]!.value).toBeCloseTo(
      internals._intervalRangeNodes[0]!.value / radiance.raymarchSteps
    )

    radiance.raymarchSteps = 64
    expect(internals._minStepNodes[0]!.value).toBeCloseTo(
      internals._intervalRangeNodes[0]!.value / 64
    )
    radiance.dispose()
  })

  it('overlaps higher cascade intervals without changing base reach math', () => {
    const radiance = new RadianceCascades({
      cascadeCount: 3,
      baseRayCount: 4,
      cascadeResolution: 32,
      intervalOverlap: 0.1,
    })
    radiance.init(90, 120, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _intervalOffsetNodes: Array<{ value: number }>
      _intervalRangeNodes: Array<{ value: number }>
      _effectiveBaseInterval: number
    }
    const base = internals._effectiveBaseInterval

    expect(internals._intervalOffsetNodes[0]!.value).toBeCloseTo(0)
    expect(internals._intervalOffsetNodes[1]!.value).toBeCloseTo(base - base * 4 * 0.1)
    expect(internals._intervalOffsetNodes[2]!.value).toBeCloseTo(base + base * 4 - base * 16 * 0.1)
    expect(internals._intervalRangeNodes[0]!.value).toBeCloseTo(base)
    expect(internals._intervalRangeNodes[1]!.value).toBeCloseTo(base * 4 * 1.1)
    expect(internals._intervalRangeNodes[2]!.value).toBeCloseTo(base * 16 * 1.1)

    radiance.intervalOverlap = -1
    expect(radiance.intervalOverlap).toBe(0)
    expect(internals._intervalOffsetNodes[0]!.value).toBeCloseTo(0)
    expect(internals._intervalOffsetNodes[1]!.value).toBeCloseTo(base)
    expect(internals._intervalOffsetNodes[2]!.value).toBeCloseTo(base + base * 4)
    radiance.dispose()
  })
})
