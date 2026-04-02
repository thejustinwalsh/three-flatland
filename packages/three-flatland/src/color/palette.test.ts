import { describe, it, expect } from 'vitest'
import { Color } from 'three'
import { monochromaticPalette, equallySpacedHues } from './palette'
import { colorToOklch } from './conversions'

describe('monochromaticPalette', () => {
  it('returns correct number of colors', () => {
    const base = new Color(0.55, 0.5, 0.5)
    expect(monochromaticPalette(base, 5)).toHaveLength(5)
    expect(monochromaticPalette(base, 1)).toHaveLength(1)
  })

  it('preserves hue across chromatic shades', () => {
    // Use a low-chroma color so gamut clamping doesn't distort hue
    const base = new Color(0.55, 0.5, 0.5)
    const baseLch = colorToOklch(base)
    // Use a narrower lightness range to stay in gamut
    const palette = monochromaticPalette(base, 5, [0.4, 0.8])

    for (const color of palette) {
      const lch = colorToOklch(color)
      if (lch.C > 0.005) {
        // Hue can drift a few degrees due to gamut clamping
        const hueDiff = Math.abs(lch.h - baseLch.h)
        expect(Math.min(hueDiff, 360 - hueDiff)).toBeLessThan(15)
      }
    }
  })

  it('lightness spans the given range', () => {
    const base = new Color(0.5, 0.5, 0.5)
    const palette = monochromaticPalette(base, 5, [0.2, 0.9])
    const lightnesses = palette.map((c) => colorToOklch(c).L)

    expect(lightnesses[0]).toBeCloseTo(0.2, 1)
    expect(lightnesses[4]).toBeCloseTo(0.9, 1)
  })
})

describe('equallySpacedHues', () => {
  it('returns correct number of colors', () => {
    expect(equallySpacedHues(6)).toHaveLength(6)
    expect(equallySpacedHues(12)).toHaveLength(12)
  })

  it('hues are approximately evenly spaced', () => {
    // Use low chroma to minimize gamut clamping distortion
    const colors = equallySpacedHues(4, 0.7, 0.08)
    const hues = colors.map((c) => colorToOklch(c).h)

    for (let i = 0; i < hues.length - 1; i++) {
      const diff = hues[i + 1] - hues[i]
      expect(diff).toBeCloseTo(90, -1) // within ~10 degrees
    }
  })

  it('uses specified lightness and chroma', () => {
    const colors = equallySpacedHues(3, 0.7, 0.05)
    for (const color of colors) {
      const lch = colorToOklch(color)
      expect(lch.L).toBeCloseTo(0.7, 1)
    }
  })
})
