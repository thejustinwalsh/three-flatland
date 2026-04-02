import type { Oklch } from './conversions'
import { oklchToOklab, oklabToLinearRgb } from './conversions'

/**
 * Check if an OKLCH color is within the sRGB gamut.
 * Tests whether converting to linear RGB produces values in [0, 1].
 */
export function isInGamut(L: number, C: number, h: number, epsilon = 1e-6): boolean {
  const lab = oklchToOklab(L, C, h)
  const rgb = oklabToLinearRgb(lab.L, lab.a, lab.b)
  return (
    rgb.r >= -epsilon && rgb.r <= 1 + epsilon &&
    rgb.g >= -epsilon && rgb.g <= 1 + epsilon &&
    rgb.b >= -epsilon && rgb.b <= 1 + epsilon
  )
}

/**
 * Map an OKLCH color to the sRGB gamut by reducing chroma while
 * preserving lightness and hue. Uses binary search on chroma
 * (CSS Color Level 4 recommended approach).
 */
export function gamutMapOklch(L: number, C: number, h: number): Oklch {
  if (isInGamut(L, C, h)) return { L, C, h }

  let lo = 0
  let hi = C

  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2
    if (isInGamut(L, mid, h)) {
      lo = mid
    } else {
      hi = mid
    }
  }

  return { L, C: lo, h }
}

/**
 * Quick clamp OKLCH values to valid ranges.
 * Lightness to [0, 1], chroma to [0, max]. Not perceptually optimal.
 */
export function clampOklch(L: number, C: number, h: number): Oklch {
  return {
    L: Math.max(0, Math.min(1, L)),
    C: Math.max(0, C),
    h: ((h % 360) + 360) % 360,
  }
}
