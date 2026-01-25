import { vec3, vec4, float } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Adjust contrast by scaling color values around a midpoint.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param amount - Contrast factor (1 = no change, >1 = more contrast, <1 = less contrast)
 * @param midpoint - Center point for scaling (default: 0.5)
 * @returns Color with adjusted contrast
 *
 * @example
 * // Increase contrast
 * contrast(texture(tex, uv()), 1.5)
 *
 * @example
 * // Decrease contrast (flatten)
 * contrast(texture(tex, uv()), 0.5)
 */
export function contrast(
  inputColor: TSLNode,
  amount: FloatInput,
  midpoint: FloatInput = 0.5
): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount
  const midpointNode = typeof midpoint === 'number' ? float(midpoint) : midpoint

  // Scale around midpoint: (color - midpoint) * amount + midpoint
  const midpointVec = vec3(midpointNode, midpointNode, midpointNode)
  const adjustedRGB = inputColor.rgb.sub(midpointVec).mul(amountNode).add(midpointVec)

  return vec4(adjustedRGB, inputColor.a)
}

/**
 * Apply S-curve contrast (smoother, more natural-looking).
 * Uses smoothstep for a sigmoid-like curve.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param amount - Contrast intensity (0 = no change, 1 = maximum)
 * @returns Color with S-curve contrast
 */
export function contrastSCurve(inputColor: TSLNode, amount: FloatInput): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount

  // Compute S-curve: 3x^2 - 2x^3 (smoothstep formula)
  // Then mix with original based on amount
  const smoothed = inputColor.rgb.mul(inputColor.rgb).mul(float(3).sub(inputColor.rgb.mul(float(2))))
  const adjustedRGB = inputColor.rgb.mix(smoothed, amountNode)

  return vec4(adjustedRGB, inputColor.a)
}
