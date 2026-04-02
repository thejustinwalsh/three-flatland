import { Color } from 'three'
import { colorToOklab, colorToOklch, oklabToColor, oklchToColor } from './conversions'

/**
 * Interpolate between two colors in OKLCH space.
 * Uses shortest-path hue interpolation to avoid unexpected transitions.
 */
export function lerpOklch(a: Color, b: Color, t: number, target?: Color): Color {
  const lchA = colorToOklch(a)
  const lchB = colorToOklch(b)

  const L = lchA.L + (lchB.L - lchA.L) * t
  const C = lchA.C + (lchB.C - lchA.C) * t

  // Shortest-path hue interpolation
  let dh = lchB.h - lchA.h
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  let h = lchA.h + dh * t
  if (h < 0) h += 360
  if (h >= 360) h -= 360

  return oklchToColor(L, C, h, target)
}

/**
 * Interpolate between two colors in OKLAB space (no polar hue).
 * Good for interpolating between similar colors where hue wrapping is not needed.
 */
export function lerpOklab(a: Color, b: Color, t: number, target?: Color): Color {
  const labA = colorToOklab(a)
  const labB = colorToOklab(b)

  return oklabToColor(
    labA.L + (labB.L - labA.L) * t,
    labA.a + (labB.a - labA.a) * t,
    labA.b + (labB.b - labA.b) * t,
    target,
  )
}

/**
 * Generate an array of N evenly-spaced colors between two colors in OKLCH space.
 */
export function gradientOklch(a: Color, b: Color, steps: number): Color[] {
  const result: Color[] = []
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0 : i / (steps - 1)
    result.push(lerpOklch(a, b, t))
  }
  return result
}
