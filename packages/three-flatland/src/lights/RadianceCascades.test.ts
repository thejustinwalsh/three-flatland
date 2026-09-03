import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { DataTexture, FloatType, LinearFilter, NearestFilter, RGBAFormat, UnsignedByteType, Vector2 } from 'three'
import { uniform } from 'three/tsl'
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js'
import { compileComputeNode, createShaderTexture, shaderSources, validateShaderSources } from '@three-flatland/tsl-test'
import {
  DDA_FIXED_RADIANCE_CASCADES_CONFIG,
  RadianceCascades,
  RADIANCE_CASCADES_PRESETS,
  createRadianceCascadesConfig,
} from './RadianceCascades'

describe('RadianceCascades', () => {
  function exportComputeShader(label: string, source: string | null): void {
    const directory = process.env.THREE_FLATLAND_SHADER_EXPORT_DIR
    if (!directory || !source) return
    mkdirSync(directory, { recursive: true })
    writeFileSync(`${directory}/${label}-compute.wgsl`, source)
  }

  function createLightsTexture(): DataTexture {
    const texture = new DataTexture(new Float32Array(4 * 4), 1, 4, RGBAFormat, FloatType)
    texture.needsUpdate = true
    return texture
  }

  it('provides tuned quality presets with override support', () => {
    expect(RADIANCE_CASCADES_PRESETS.fast.baseRayCount).toBe(4)
    expect(RADIANCE_CASCADES_PRESETS.balanced.baseRayCount).toBe(16)
    expect(RADIANCE_CASCADES_PRESETS.balanced.maxAutoCascadeResolution).toBe(512)
    expect(RADIANCE_CASCADES_PRESETS.fast.raymarchSteps).toBe(24)
    expect(RADIANCE_CASCADES_PRESETS.balanced.raymarchSteps).toBe(24)
    expect(RADIANCE_CASCADES_PRESETS.quality.raymarchSteps).toBe(48)
    expect(RADIANCE_CASCADES_PRESETS.balanced.intervalOverlap).toBe(0.1)
    expect(RADIANCE_CASCADES_PRESETS.balanced.mipBlur).toBe(0)
    expect(RADIANCE_CASCADES_PRESETS.balanced.mipStrength).toBe(0)
    expect(RADIANCE_CASCADES_PRESETS.balanced.wideDownsampleFactor).toBe(2)
    expect(RADIANCE_CASCADES_PRESETS.quality.wideDownsampleFactor).toBe(2)
    expect(RADIANCE_CASCADES_PRESETS.quality.wideLevels).toBe(2)

    expect(createRadianceCascadesConfig('balanced', { mipStrength: 0.1 })).toMatchObject({
      baseRayCount: 16,
      raymarchSteps: 24,
      mipBlur: 0,
      mipStrength: 0.1,
      wideDownsampleFactor: 2,
    })
  })

  it('uses four-pixel transport reconstructed onto a two-pixel DDA lighting grid', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 512,
    })

    radiance.init(360, 240, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _cascadeRTs: Array<{
        width: number
        height: number
        texture: { type: number; minFilter: number; magFilter: number }
      }>
      _finalRadianceRT: { width: number; height: number; texture: { minFilter: number; magFilter: number } }
      _emissiveRadianceRT: {
        texture: { generateMipmaps: boolean; minFilter: number }
      }
    }
    expect(radiance.requiresSdf).toBe(false)
    expect(radiance.ddaHierarchyLevel).toBe(2)
    expect(radiance.ddaPixelSize).toBe(4)
    expect(radiance.ddaResolvePixelSize).toBe(2)
    expect(radiance.config.baseRayCount).toBe(4)
    expect(radiance.ddaWebGpuAccelerationEnabled).toBe(true)
    expect(radiance.ddaExecutionPath).toBe('auto')
    expect(radiance.resolvedDdaExecutionPath).toBe('fragment')
    expect(internals._cascadeRTs).toHaveLength(4)
    // 360×240 / 4 = a 90×60 visible integer grid. One 8-cell guard page
    // produces 98×68 output cells; cascade atlases pad that to 104×72 so all
    // four hierarchy levels retain integral direction blocks without
    // rephasing when the camera scrolls inside the page.
    expect(internals._cascadeRTs.every((target) => target.width === 208 && target.height === 144)).toBe(true)
    expect(internals._cascadeRTs.every((target) => target.texture.type === UnsignedByteType)).toBe(true)
    expect(internals._cascadeRTs.every((target) => target.texture.minFilter === LinearFilter)).toBe(true)
    expect(internals._finalRadianceRT.width).toBe(196)
    expect(internals._finalRadianceRT.height).toBe(136)
    expect(internals._finalRadianceRT.texture.magFilter).toBe(NearestFilter)
    expect(internals._emissiveRadianceRT.texture.generateMipmaps).toBe(false)
    expect(internals._emissiveRadianceRT.texture.minFilter).toBe(NearestFilter)
    expect(radiance.cascadeStorageBytesPerTexel).toBe(4)
    expect(radiance.estimatedCascadeStorageBytes).toBe(4 * 208 * 144 * 4)
    expect(radiance.estimatedRaymarchSampleCount).toBeGreaterThan(radiance.estimatedRaymarchTexelCount)

    radiance.dispose()
  })

  it('exposes independent hard and forced DDA acceleration gates', () => {
    const radiance = new RadianceCascades(DDA_FIXED_RADIANCE_CASCADES_CONFIG)

    radiance.ddaWebGpuAccelerationEnabled = false
    radiance.ddaExecutionPath = 'webgpu-subgroup'

    expect(radiance.ddaWebGpuAccelerationEnabled).toBe(false)
    expect(radiance.ddaExecutionPath).toBe('webgpu-subgroup')
    expect(radiance.resolvedDdaExecutionPath).toBe('fragment')
    radiance.dispose()
  })

  it('changes DDA RC transport resolution without changing the angular budget', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 512,
    })
    radiance.init(360, 240, createLightsTexture(), uniform(0))

    radiance.ddaPixelSize = 8
    const internals = radiance as unknown as {
      _cascadeRTs: Array<{ width: number; height: number }>
      _finalRadianceRT: { width: number; height: number }
    }
    expect(internals._cascadeRTs[0]).toMatchObject({ width: 112, height: 80 })
    expect(internals._finalRadianceRT).toMatchObject({ width: 212, height: 152 })

    radiance.dispose()
  })

  it('keeps the DDA grid tied to processing pixels when world bounds change', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 512,
    })
    radiance.init(360, 240, createLightsTexture(), uniform(0))
    const texture = radiance.finalRadianceTexture

    radiance.setWorldBounds(new Vector2(180, 360), new Vector2(-90, -180))

    const internals = radiance as unknown as {
      _cascadeRTs: Array<{ width: number; height: number }>
      _finalRadianceRT: { width: number; height: number }
    }
    expect(internals._cascadeRTs[0]).toMatchObject({ width: 208, height: 144 })
    expect(internals._finalRadianceRT).toMatchObject({ width: 196, height: 136 })
    expect(radiance.finalRadianceTexture).toBe(texture)

    radiance.dispose()
  })

  it('bounds automatic cascade intervals with an explicit transport distance', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 512,
      maxTransportDistance: 96,
    })
    radiance.init(640, 360, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _intervalOffsetNodes: Array<{ value: number }>
      _intervalRangeNodes: Array<{ value: number }>
      _ddaMaxSteps: (cascadeIndex: number) => number
    }
    const last = radiance.cascadeCount - 1
    const transportEnd = internals._intervalOffsetNodes[last]!.value + internals._intervalRangeNodes[last]!.value
    expect(transportEnd).toBeCloseTo(96)

    const boundedSteps = internals._ddaMaxSteps(last)
    radiance.maxTransportDistance = 192
    expect(radiance.maxTransportDistance).toBe(192)
    expect(internals._ddaMaxSteps(last)).toBeGreaterThan(boundedSteps)

    radiance.maxTransportDistance = -1
    expect(radiance.maxTransportDistance).toBe(0)
    radiance.dispose()
  })

  it('derives DDA RC work from the processing surface without a transport cap', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 64,
      maxAutoCascadeResolution: 64,
    })
    radiance.init(360, 240, createLightsTexture(), uniform(0))
    radiance.setProcessingSize(1280, 720)

    const internals = radiance as unknown as {
      _cascadeRTs: Array<{ width: number; height: number }>
      _finalRadianceRT: { width: number; height: number }
    }
    expect(internals._finalRadianceRT).toMatchObject({ width: 656, height: 376 })
    expect(internals._cascadeRTs[0]).toMatchObject({ width: 656, height: 384 })
    radiance.dispose()
  })

  it('changes the resolved lighting grid without rebuilding DDA transport', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 512,
    })
    radiance.init(360, 240, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _cascadeRTs: Array<{ width: number; height: number }>
      _finalRadianceRT: { width: number; height: number; texture: unknown }
    }
    const cascade0 = internals._cascadeRTs[0]
    const finalTexture = internals._finalRadianceRT.texture

    radiance.ddaResolvePixelSize = 4
    expect(internals._cascadeRTs[0]).toBe(cascade0)
    expect(internals._cascadeRTs[0]).toMatchObject({ width: 208, height: 144 })
    expect(internals._finalRadianceRT).toMatchObject({ width: 98, height: 68 })
    expect(internals._finalRadianceRT.texture).toBe(finalTexture)

    radiance.ddaResolvePixelSize = 1
    expect(internals._cascadeRTs[0]).toBe(cascade0)
    expect(internals._finalRadianceRT).toMatchObject({ width: 392, height: 272 })
    radiance.dispose()
  })

  it('rolls the guarded DDA window only on the coarsest cascade page', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeResolution: 512,
      ddaPixelSize: 4,
      cascadeCount: 4,
    })
    radiance.init(640, 360, createLightsTexture(), uniform(0))

    const internals = radiance as unknown as {
      _worldSize: Vector2
      _worldOffset: Vector2
    }
    const scale = new Vector2()
    const offset = new Vector2()

    radiance.setWorldBounds(new Vector2(640, 360), new Vector2(2, 6))
    expect(internals._worldSize.toArray()).toEqual([672, 392])
    expect(internals._worldOffset.toArray()).toEqual([0, 0])
    radiance.getVisibleUvTransform(scale, offset)
    expect(scale.x).toBeCloseTo(640 / 672)
    expect(scale.y).toBeCloseTo(360 / 392)
    expect(offset.x).toBeCloseTo(2 / 672)
    expect(offset.y).toBeCloseTo(6 / 392)

    const worldPoint = new Vector2(128, 144)
    const screenUvAfterFlipY = new Vector2((worldPoint.x - 2) / 640, (worldPoint.y - 6) / 360)
    expect(screenUvAfterFlipY.x * scale.x + offset.x).toBeCloseTo(worldPoint.x / 672)
    expect(screenUvAfterFlipY.y * scale.y + offset.y).toBeCloseTo(worldPoint.y / 392)

    radiance.setWorldBounds(new Vector2(640, 360), new Vector2(31, 31))
    expect(internals._worldOffset.toArray()).toEqual([0, 0])
    radiance.setWorldBounds(new Vector2(640, 360), new Vector2(32, 32))
    expect(internals._worldOffset.toArray()).toEqual([32, 32])
    radiance.getVisibleUvTransform(scale, offset)
    const rolledScreenUvAfterFlipY = new Vector2((worldPoint.x - 32) / 640, (worldPoint.y - 32) / 360)
    expect(rolledScreenUvAfterFlipY.x * scale.x + offset.x).toBeCloseTo((worldPoint.x - 32) / 672)
    expect(rolledScreenUvAfterFlipY.y * scale.y + offset.y).toBeCloseTo((worldPoint.y - 32) / 392)

    radiance.dispose()
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

    const cascadeRTs = (radiance as unknown as { _cascadeRTs: Array<{ width: number; height: number }> })._cascadeRTs
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

    const finalRT = (radiance as unknown as { _finalRadianceRT: { width: number; height: number } })._finalRadianceRT
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
    const finalRT = (radiance as unknown as { _finalRadianceRT: { width: number; height: number } })._finalRadianceRT
    expect(finalRT.width).toBe(128)
    expect(finalRT.height).toBe(128)
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
      _mipBlurNode: { value: number }
      _mipStrengthNode: { value: number }
    }

    radiance.raymarchSteps = 999
    radiance.intervalOverlap = 99
    radiance.filterRadius = -1
    radiance.filterStrength = 99
    radiance.mipBlur = 99
    radiance.mipStrength = -1
    radiance.wideDownsampleFactor = 99
    expect(radiance.raymarchSteps).toBe(96)
    expect(radiance.intervalOverlap).toBe(0.45)
    expect(radiance.filterRadius).toBe(0)
    expect(radiance.filterStrength).toBe(1)
    expect(radiance.mipBlur).toBe(1)
    expect(radiance.mipStrength).toBe(0)
    expect(radiance.wideDownsampleFactor).toBe(4)
    expect(internals._filterRadiusNode.value).toBe(0)
    expect(internals._filterStrengthNode.value).toBe(1)
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

  it('counts the reset dispatch required by each WebGPU DDA cascade', () => {
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeCount: 4,
      ddaHierarchyLevel: 2,
      filterRadius: 0,
      filterStrength: 0,
      mipStrength: 0,
    })
    const internals = radiance as unknown as {
      _setResolvedDdaExecutionPath(path: 'fragment' | 'webgpu-workgroup', fallbackReason: null): void
    }

    expect(radiance.estimatedPassCount).toBe(8)
    internals._setResolvedDdaExecutionPath('webgpu-workgroup', null)
    expect(radiance.estimatedPassCount).toBe(12)
    radiance.dispose()
  })

  it('compiles the integrated shared DDA builder for both WebGPU execution paths', async () => {
    const lights = createShaderTexture()
    const occlusion = createShaderTexture()
    const radiance = new RadianceCascades({
      ...DDA_FIXED_RADIANCE_CASCADES_CONFIG,
      cascadeCount: 2,
      baseRayCount: 4,
      ddaPixelSize: 4,
      ddaHierarchyLevel: 2,
    })
    radiance.init(16, 16, lights, uniform(0))
    radiance.setProcessingSize(16, 16)
    radiance.setOcclusionTexture(occlusion)

    const internals = radiance as unknown as {
      _setResolvedDdaExecutionPath(path: 'webgpu-workgroup' | 'webgpu-subgroup', fallbackReason: null): void
      _ensureDdaComputeResources(): void
      _ddaWorkgroupHierarchy: { computeNodes: readonly ComputeNode[] }
      _ddaWorkgroupCascades: Array<{ resetNode: ComputeNode; computeNode: ComputeNode }>
      _ddaSubgroupCascades: Array<{ resetNode: ComputeNode; computeNode: ComputeNode }>
    }

    internals._setResolvedDdaExecutionPath('webgpu-workgroup', null)
    internals._ensureDdaComputeResources()
    const workgroupPrograms = [
      ...internals._ddaWorkgroupHierarchy.computeNodes.map((node) => compileComputeNode(node)),
      ...internals._ddaWorkgroupCascades.flatMap(({ resetNode, computeNode }) => [
        compileComputeNode(resetNode),
        compileComputeNode(computeNode),
      ]),
    ]
    for (let index = 0; index < workgroupPrograms.length; index++) {
      const program = workgroupPrograms[index]!
      expect(program.diagnostics).toEqual([])
      exportComputeShader(`rc-dda-workgroup-${index}`, program.computeShader)
    }
    await validateShaderSources(
      workgroupPrograms.flatMap((program, index) => shaderSources(program, `radiance-workgroup-${index}`))
    )

    internals._setResolvedDdaExecutionPath('webgpu-subgroup', null)
    internals._ensureDdaComputeResources()
    for (let index = 0; index < internals._ddaSubgroupCascades.length; index++) {
      const { resetNode, computeNode } = internals._ddaSubgroupCascades[index]!
      const reset = compileComputeNode(resetNode)
      const subgroup = compileComputeNode(computeNode, { features: ['subgroups'] })
      expect(reset.diagnostics).toEqual([])
      expect(subgroup.diagnostics).toEqual([])
      expect(subgroup.computeShader).toContain('subgroupBallot(')
      expect(subgroup.computeShader).toContain('subgroupExclusiveAdd(')
      expect(subgroup.computeShader).not.toMatch(/if \( instanceIndex >=/)
      exportComputeShader(`rc-dda-subgroup-${index}`, subgroup.computeShader)
      await validateShaderSources(shaderSources(reset, 'radiance-subgroup-reset'))
    }

    radiance.dispose()
    lights.dispose()
    occlusion.dispose()
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
    }
    const initialRange = internals._intervalRangeNodes[0]!.value

    radiance.setWorldBounds(new Vector2(180, 240), new Vector2(-90, -120))

    expect(internals._intervalOffsetNodes.map((node) => node.value)).toEqual([
      0,
      internals._intervalRangeNodes[0]!.value,
      internals._intervalRangeNodes[0]!.value + internals._intervalRangeNodes[1]!.value,
    ])
    expect(internals._intervalRangeNodes[0]!.value).toBeCloseTo(initialRange * 2)
    expect(internals._intervalRangeNodes[1]!.value).toBeCloseTo(internals._intervalRangeNodes[0]!.value * 4)
    expect(internals._intervalRangeNodes[2]!.value).toBeCloseTo(internals._intervalRangeNodes[1]!.value * 4)
    radiance.raymarchSteps = 64
    expect(radiance.raymarchSteps).toBe(64)
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
