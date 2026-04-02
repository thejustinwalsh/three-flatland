import { describe, it, expect } from 'vitest'
import { Color } from 'three'
import {
  srgbToLinear,
  linearToSrgb,
  linearRgbToOklab,
  oklabToLinearRgb,
  oklabToOklch,
  oklchToOklab,
  colorToOklab,
  colorToOklch,
  oklabToColor,
  oklchToColor,
} from './conversions'

const EPSILON = 1e-4

describe('srgbToLinear / linearToSrgb', () => {
  it('maps 0 to 0 and 1 to 1', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(srgbToLinear(1)).toBeCloseTo(1, 10)
    expect(linearToSrgb(0)).toBe(0)
    expect(linearToSrgb(1)).toBeCloseTo(1, 10)
  })

  it('roundtrips correctly', () => {
    for (const v of [0, 0.04, 0.1, 0.25, 0.5, 0.75, 1.0]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 10)
    }
  })

  it('converts 0.5 sRGB to approximately 0.214 linear', () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214, 2)
  })
})

describe('linearRgbToOklab / oklabToLinearRgb', () => {
  it('converts black correctly', () => {
    const lab = linearRgbToOklab(0, 0, 0)
    expect(lab.L).toBeCloseTo(0, 5)
    expect(lab.a).toBeCloseTo(0, 5)
    expect(lab.b).toBeCloseTo(0, 5)
  })

  it('converts white correctly', () => {
    const lab = linearRgbToOklab(1, 1, 1)
    expect(lab.L).toBeCloseTo(1, 3)
    expect(lab.a).toBeCloseTo(0, 3)
    expect(lab.b).toBeCloseTo(0, 3)
  })

  it('converts linear red to known OKLAB values', () => {
    const lab = linearRgbToOklab(1, 0, 0)
    expect(lab.L).toBeCloseTo(0.6280, 3)
    expect(lab.a).toBeCloseTo(0.2249, 3)
    expect(lab.b).toBeCloseTo(0.1260, 3)
  })

  it('roundtrips for primary colors', () => {
    const colors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, 0.5, 0.5],
      [0.2, 0.7, 0.3],
    ] as const

    for (const [r, g, b] of colors) {
      const lab = linearRgbToOklab(r, g, b)
      const rgb = oklabToLinearRgb(lab.L, lab.a, lab.b)
      expect(rgb.r).toBeCloseTo(r, 4)
      expect(rgb.g).toBeCloseTo(g, 4)
      expect(rgb.b).toBeCloseTo(b, 4)
    }
  })
})

describe('oklabToOklch / oklchToOklab', () => {
  it('achromatic colors have chroma near 0', () => {
    const lch = oklabToOklch(0.5, 0, 0)
    expect(lch.C).toBeCloseTo(0, 5)
  })

  it('roundtrips correctly', () => {
    const testCases = [
      { L: 0.7, a: 0.1, b: 0.05 },
      { L: 0.3, a: -0.08, b: 0.12 },
      { L: 0.9, a: 0.0, b: -0.1 },
    ]

    for (const { L, a, b } of testCases) {
      const lch = oklabToOklch(L, a, b)
      const lab = oklchToOklab(lch.L, lch.C, lch.h)
      expect(lab.L).toBeCloseTo(L, 6)
      expect(lab.a).toBeCloseTo(a, 6)
      expect(lab.b).toBeCloseTo(b, 6)
    }
  })

  it('hue is in range 0..360', () => {
    const lch = oklabToOklch(0.5, -0.1, -0.1)
    expect(lch.h).toBeGreaterThanOrEqual(0)
    expect(lch.h).toBeLessThan(360)
  })
})

describe('colorToOklab / oklabToColor', () => {
  it('roundtrips for sRGB colors', () => {
    const colors = [
      new Color(1, 0, 0),
      new Color(0, 1, 0),
      new Color(0, 0, 1),
      new Color(0.5, 0.5, 0.5),
      new Color(1, 1, 1),
      new Color(0, 0, 0),
    ]

    for (const color of colors) {
      const lab = colorToOklab(color)
      const result = oklabToColor(lab.L, lab.a, lab.b)
      expect(result.r).toBeCloseTo(color.r, 3)
      expect(result.g).toBeCloseTo(color.g, 3)
      expect(result.b).toBeCloseTo(color.b, 3)
    }
  })

  it('accepts a reusable target color', () => {
    const target = new Color()
    const result = oklabToColor(0.5, 0, 0, target)
    expect(result).toBe(target)
  })
})

describe('colorToOklch / oklchToColor', () => {
  it('roundtrips for sRGB colors', () => {
    const colors = [
      new Color(1, 0, 0),
      new Color(0, 1, 0),
      new Color(0, 0, 1),
      new Color(0.8, 0.4, 0.2),
    ]

    for (const color of colors) {
      const lch = colorToOklch(color)
      const result = oklchToColor(lch.L, lch.C, lch.h)
      expect(result.r).toBeCloseTo(color.r, 3)
      expect(result.g).toBeCloseTo(color.g, 3)
      expect(result.b).toBeCloseTo(color.b, 3)
    }
  })

  it('clamps out-of-gamut values', () => {
    // Very high chroma can produce out-of-gamut
    const result = oklchToColor(0.5, 0.4, 120)
    expect(result.r).toBeGreaterThanOrEqual(0)
    expect(result.r).toBeLessThanOrEqual(1)
    expect(result.g).toBeGreaterThanOrEqual(0)
    expect(result.g).toBeLessThanOrEqual(1)
    expect(result.b).toBeGreaterThanOrEqual(0)
    expect(result.b).toBeLessThanOrEqual(1)
  })

  it('accepts a reusable target color', () => {
    const target = new Color()
    const result = oklchToColor(0.7, 0.15, 180, target)
    expect(result).toBe(target)
  })
})
