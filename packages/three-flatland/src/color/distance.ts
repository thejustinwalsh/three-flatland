import type { Color } from 'three'
import { colorToOklab, srgbToLinear } from './conversions'

/**
 * Perceptual distance between two colors in OKLAB space.
 * Euclidean distance in a perceptually uniform space.
 * Range: 0 (identical) to ~1.4 (maximum).
 */
export function deltaEOklab(a: Color, b: Color): number {
  const labA = colorToOklab(a)
  const labB = colorToOklab(b)
  const dL = labA.L - labB.L
  const da = labA.a - labB.a
  const db = labA.b - labB.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

/**
 * WCAG 2.1 relative luminance from an sRGB color.
 * Uses Rec. 709 coefficients on linearized sRGB values.
 */
export function relativeLuminance(color: Color): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  )
}

/**
 * WCAG 2.1 contrast ratio between two colors.
 * Returns 1 (identical) to 21 (max, black/white).
 */
export function contrastRatio(a: Color, b: Color): number {
  const lA = relativeLuminance(a)
  const lB = relativeLuminance(b)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check WCAG 2.1 conformance level for a foreground/background pair.
 *
 * - AAA: contrast >= 7:1 (enhanced, normal text)
 * - AA: contrast >= 4.5:1 (minimum, normal text)
 * - AA-large: contrast >= 3:1 (minimum, large text / UI components)
 * - fail: contrast < 3:1
 */
export function wcagLevel(
  foreground: Color,
  background: Color,
): 'AAA' | 'AA' | 'AA-large' | 'fail' {
  const ratio = contrastRatio(foreground, background)
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA-large'
  return 'fail'
}
