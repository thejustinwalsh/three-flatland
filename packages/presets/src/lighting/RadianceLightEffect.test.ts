import { describe, expect, it, vi } from 'vitest'
import { HierarchicalRadianceLightEffect } from './HierarchicalRadianceLightEffect'
import { RadianceLightEffect } from './RadianceLightEffect'

describe.each([
  ['RadianceLightEffect', RadianceLightEffect],
  ['HierarchicalRadianceLightEffect', HierarchicalRadianceLightEffect],
] as const)('%s current LightEffect API integration', (_name, EffectClass) => {
  it('uses the shared world-bound nodes instead of per-instance duplicates', () => {
    expect(Object.keys(EffectClass.lightSchema)).toEqual(['radianceIntensity', 'radiance'])
  })

  it('does not reinterpret processing-surface pixels as world dimensions', () => {
    const effect = new EffectClass()
    const resize = vi.spyOn(effect.radiance, 'resize')

    effect.resize(1920, 1080)

    expect(resize).not.toHaveBeenCalled()
    effect.dispose()
  })
})
