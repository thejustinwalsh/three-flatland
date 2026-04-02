import { Color } from 'three'
import { colorToOklch, oklchToColor } from './conversions'

/**
 * Generate a monochromatic palette by varying lightness in OKLCH space.
 * Preserves the hue and chroma of the base color.
 *
 * @param base - Base color
 * @param count - Number of shades to generate
 * @param range - Lightness range [min, max] (default [0.15, 0.95])
 */
export function monochromaticPalette(
  base: Color,
  count: number,
  range: [number, number] = [0.15, 0.95],
): Color[] {
  const lch = colorToOklch(base)
  const [minL, maxL] = range
  const result: Color[] = []

  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1)
    const L = minL + (maxL - minL) * t
    result.push(oklchToColor(L, lch.C, lch.h))
  }

  return result
}

/**
 * Generate evenly-spaced hues at a given lightness and chroma.
 * Useful for categorical/data visualization palettes.
 *
 * @param count - Number of colors
 * @param lightness - OKLCH lightness (default 0.7)
 * @param chroma - OKLCH chroma (default 0.15)
 */
export function equallySpacedHues(
  count: number,
  lightness = 0.7,
  chroma = 0.15,
): Color[] {
  const result: Color[] = []
  for (let i = 0; i < count; i++) {
    const h = (360 / count) * i
    result.push(oklchToColor(lightness, chroma, h))
  }
  return result
}
