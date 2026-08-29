import { describe, expect, it, vi } from 'vitest'
import { Vector2 } from 'three'
import { HierarchicalRadianceLightEffect } from './HierarchicalRadianceLightEffect'
import { RadianceLightEffect } from './RadianceLightEffect'
import { DdaFixedRadianceLightEffect } from './DdaFixedRadianceLightEffect'

describe.each([
  ['RadianceLightEffect', RadianceLightEffect, ['radianceIntensity', 'radiance']],
  [
    'DdaFixedRadianceLightEffect',
    DdaFixedRadianceLightEffect,
    ['radianceIntensity', 'lightHeight', 'radianceUvOffset', 'includeAnalyticLights', 'radiance'],
  ],
  ['HierarchicalRadianceLightEffect', HierarchicalRadianceLightEffect, ['radianceIntensity', 'radiance']],
] as const)('%s current LightEffect API integration', (_name, EffectClass, expectedSchema) => {
  it('uses the shared world-bound nodes instead of per-instance duplicates', () => {
    expect(Object.keys(EffectClass.lightSchema)).toEqual(expectedSchema)
  })

  it('does not reinterpret processing-surface pixels as world dimensions', () => {
    const effect = new EffectClass()
    const resize = vi.spyOn(effect.radiance, 'resize')

    effect.resize(1920, 1080)

    expect(resize).not.toHaveBeenCalled()
    effect.dispose()
  })
})

describe('DdaFixedRadianceLightEffect shadow representation', () => {
  it('derives its logical grid from processing-surface pixels', () => {
    const effect = new DdaFixedRadianceLightEffect()
    const setProcessingSize = vi.spyOn(effect.radiance, 'setProcessingSize')

    effect.resize(1280, 720)

    expect(setProcessingSize).toHaveBeenCalledWith(1280, 720)
    effect.dispose()
  })

  it('uses the binary caster mask and canonical packed RC defaults', () => {
    const effect = new DdaFixedRadianceLightEffect()

    expect(effect.shadowPipelineMode).toBe('occlusion')
    expect(effect.includeAnalyticLights).toBe(false)
    expect(effect.radiance.config).toMatchObject({
      traversal: 'dda-fixed',
      ddaPixelSize: 4,
      ddaQuantizationBits: 8,
      ddaBleedThreshold: 0.65,
      ddaPaletteBands: 0,
      mipBlur: 0,
      mipStrength: 0,
      includeAmbient: false,
      includeAnalyticLights: false,
    })

    effect.dispose()
  })

  it('keeps coarse DDA lighting registered while the camera moves within a capture cell', () => {
    const effect = new DdaFixedRadianceLightEffect()
    const worldSize = new Vector2(640, 360)
    const worldOffset = new Vector2(2, 6)
    const shadowCaptureWorldSize = new Vector2(896, 616)
    const shadowCaptureWorldOffset = new Vector2(-128, -128)
    const setWorldBounds = vi.spyOn(effect.radiance, 'setWorldBounds')
    const setTransportBounds = vi.spyOn(effect.radiance, 'setTransportBounds')
    vi.spyOn(effect.radiance, 'generate').mockImplementation(() => {})

    effect.update({
      worldSize,
      worldOffset,
      shadowCaptureWorldSize,
      shadowCaptureWorldOffset,
      occlusionTexture: {},
      renderer: {},
      scene: {},
      camera: {},
    } as never)

    expect(setWorldBounds).toHaveBeenCalledWith(worldSize, new Vector2(0, 0))
    expect(setTransportBounds).toHaveBeenCalledWith(shadowCaptureWorldSize, shadowCaptureWorldOffset)
    expect(effect.radianceUvOffset).toEqual([2 / 640, -6 / 360])

    effect.dispose()
  })
})

describe('HierarchicalRadianceLightEffect shadow representation', () => {
  it('derives integer DDA hierarchy sizing from processing-surface pixels', () => {
    const effect = new HierarchicalRadianceLightEffect()
    const setProcessingSize = vi.spyOn(effect.radiance, 'setProcessingSize')

    effect.resize(1280, 720)

    expect(setProcessingSize).toHaveBeenCalledWith(1280, 720)
    effect.dispose()
  })

  it('uses only the binary caster mask for every DDA traversal', () => {
    const effect = new HierarchicalRadianceLightEffect()

    for (const traversal of ['dda-float', 'dda-integer', 'dda-fixed'] as const) {
      effect.radiance.holographicTraversal = traversal
      expect(effect.shadowPipelineMode).toBe('occlusion')
    }

    effect.dispose()
  })

  it('retains the SDF for sphere-traced and legacy interval modes', () => {
    const effect = new HierarchicalRadianceLightEffect()
    effect.radiance.holographicTraversal = 'sdf'
    expect(effect.shadowPipelineMode).toBe('sdf')

    effect.radiance.holographicTraversal = 'dda-fixed'
    effect.radiance.compositionMode = 'hierarchical'
    expect(effect.shadowPipelineMode).toBe('sdf')

    effect.dispose()
  })
})
