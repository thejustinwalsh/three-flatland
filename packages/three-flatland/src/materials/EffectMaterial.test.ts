import { describe, it, expect } from 'vitest'
import { EffectMaterial, computeTier } from './EffectMaterial'

describe('computeTier', () => {
  it('returns 0 for zero or negative floats', () => {
    expect(computeTier(0)).toBe(0)
    expect(computeTier(-1)).toBe(0)
  })

  it('rounds up through the fixed tiers (4, 8, 16)', () => {
    expect(computeTier(1)).toBe(4)
    expect(computeTier(4)).toBe(4)
    expect(computeTier(5)).toBe(8)
    expect(computeTier(8)).toBe(8)
    expect(computeTier(9)).toBe(16)
    expect(computeTier(16)).toBe(16)
  })

  it('rounds up to the next multiple of 4 past 16, up to the 24-float cap', () => {
    expect(computeTier(17)).toBe(20)
    expect(computeTier(20)).toBe(20)
    expect(computeTier(24)).toBe(24)
  })
})

describe('EffectMaterial constructor', () => {
  it('accepts an effectTier at or under the MAX_EFFECT_FLOATS cap', () => {
    expect(() => new EffectMaterial({ effectTier: EffectMaterial.MAX_EFFECT_FLOATS })).not.toThrow()
  })

  it('throws when effectTier exceeds MAX_EFFECT_FLOATS (would need a 9th vertex-buffer binding)', () => {
    expect(() => new EffectMaterial({ effectTier: 32 })).toThrow(/exceeding the cap/)
  })
})
