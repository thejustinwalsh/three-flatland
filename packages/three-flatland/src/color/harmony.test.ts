import { describe, it, expect } from 'vitest'
import { Color } from 'three'
import { complementary, analogous, triadic, splitComplementary, tetradic } from './harmony'
import { colorToOklch } from './conversions'

// Use a low-chroma color so all hue rotations stay in gamut.
// High-chroma colors (like pure red) go out of gamut when rotated,
// and sRGB clamping distorts hue in the roundtrip.
const BASE = new Color(0.55, 0.5, 0.5)

describe('complementary', () => {
  it('shifts hue by approximately 180 degrees', () => {
    const comp = complementary(BASE)
    const baseLch = colorToOklch(BASE)
    const compLch = colorToOklch(comp)

    const hueDiff = Math.abs(baseLch.h - compLch.h)
    expect(Math.min(hueDiff, 360 - hueDiff)).toBeCloseTo(180, 0)
  })

  it('preserves lightness and chroma', () => {
    const comp = complementary(BASE)
    const baseLch = colorToOklch(BASE)
    const compLch = colorToOklch(comp)

    expect(compLch.L).toBeCloseTo(baseLch.L, 1)
    expect(compLch.C).toBeCloseTo(baseLch.C, 1)
  })

  it('accepts a reusable target', () => {
    const target = new Color()
    const result = complementary(new Color(1, 0, 0), target)
    expect(result).toBe(target)
  })
})

describe('analogous', () => {
  it('returns 3 colors', () => {
    const result = analogous(BASE)
    expect(result).toHaveLength(3)
  })

  it('center color matches input', () => {
    const [, center] = analogous(BASE)
    expect(center.r).toBeCloseTo(BASE.r, 5)
    expect(center.g).toBeCloseTo(BASE.g, 5)
    expect(center.b).toBeCloseTo(BASE.b, 5)
  })
})

describe('triadic', () => {
  it('returns 3 colors with approximately 120 degree spacing', () => {
    const [c1, c2, c3] = triadic(BASE)
    const lch1 = colorToOklch(c1)
    const lch2 = colorToOklch(c2)
    const lch3 = colorToOklch(c3)

    const diff12 = Math.abs(lch2.h - lch1.h)
    const diff23 = Math.abs(lch3.h - lch2.h)
    expect(Math.min(diff12, 360 - diff12)).toBeCloseTo(120, 0)
    expect(Math.min(diff23, 360 - diff23)).toBeCloseTo(120, 0)
  })
})

describe('splitComplementary', () => {
  it('returns 3 colors', () => {
    expect(splitComplementary(BASE)).toHaveLength(3)
  })
})

describe('tetradic', () => {
  it('returns 4 colors with approximately 90 degree spacing', () => {
    const colors = tetradic(BASE)
    expect(colors).toHaveLength(4)

    const hues = colors.map((c) => colorToOklch(c).h)
    for (let i = 0; i < 3; i++) {
      const diff = Math.abs(hues[i + 1] - hues[i])
      expect(Math.min(diff, 360 - diff)).toBeCloseTo(90, 0)
    }
  })
})
