import { describe, it, expect } from 'vitest'
import { Color } from 'three'
import { isInGamut, gamutMapOklch, clampOklch } from './gamut'
import { colorToOklch } from './conversions'

describe('isInGamut', () => {
  it('sRGB primaries are in gamut', () => {
    // Use actual converted values for red
    const red = colorToOklch(new Color(1, 0, 0))
    expect(isInGamut(red.L, red.C, red.h)).toBe(true)
  })

  it('white and black are in gamut', () => {
    expect(isInGamut(1, 0, 0)).toBe(true)
    expect(isInGamut(0, 0, 0)).toBe(true)
  })

  it('very high chroma is out of gamut', () => {
    expect(isInGamut(0.5, 0.5, 120)).toBe(false)
  })

  it('zero chroma is always in gamut for valid lightness', () => {
    expect(isInGamut(0.5, 0, 0)).toBe(true)
    expect(isInGamut(0.0, 0, 0)).toBe(true)
    expect(isInGamut(1.0, 0, 0)).toBe(true)
  })
})

describe('gamutMapOklch', () => {
  it('in-gamut colors pass through unchanged', () => {
    const result = gamutMapOklch(0.7, 0.1, 180)
    expect(result.L).toBe(0.7)
    expect(result.C).toBeCloseTo(0.1, 3)
    expect(result.h).toBe(180)
  })

  it('out-of-gamut colors are mapped to gamut', () => {
    const result = gamutMapOklch(0.5, 0.5, 120)
    expect(isInGamut(result.L, result.C, result.h)).toBe(true)
  })

  it('preserves lightness and hue', () => {
    const result = gamutMapOklch(0.5, 0.5, 120)
    expect(result.L).toBe(0.5)
    expect(result.h).toBe(120)
  })

  it('reduces chroma for out-of-gamut colors', () => {
    const result = gamutMapOklch(0.5, 0.5, 120)
    expect(result.C).toBeLessThan(0.5)
    expect(result.C).toBeGreaterThan(0)
  })
})

describe('clampOklch', () => {
  it('clamps lightness to 0..1', () => {
    expect(clampOklch(-0.5, 0.1, 180).L).toBe(0)
    expect(clampOklch(1.5, 0.1, 180).L).toBe(1)
  })

  it('clamps chroma to non-negative', () => {
    expect(clampOklch(0.5, -0.1, 180).C).toBe(0)
  })

  it('wraps hue to 0..360', () => {
    expect(clampOklch(0.5, 0.1, -30).h).toBeCloseTo(330, 5)
    expect(clampOklch(0.5, 0.1, 400).h).toBeCloseTo(40, 5)
  })
})
