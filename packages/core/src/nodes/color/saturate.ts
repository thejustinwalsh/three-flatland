import { vec3, vec4, float } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

// Standard luminance weights (Rec. 709)
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

/**
 * Adjust saturation by mixing with grayscale (luminance).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param amount - Saturation amount (0 = grayscale, 1 = original, >1 = oversaturated)
 * @returns Color with adjusted saturation
 *
 * @example
 * // Desaturate to grayscale (petrified effect)
 * saturate(texture(tex, uv()), 0)
 *
 * @example
 * // Boost saturation
 * saturate(texture(tex, uv()), 1.5)
 */
export function saturate(inputColor: TSLNode, amount: FloatInput): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount

  // Calculate luminance
  const lumaWeights = vec3(LUMA_R, LUMA_G, LUMA_B)
  const luminance = inputColor.rgb.dot(lumaWeights)
  const grayscale = vec3(luminance, luminance, luminance)

  // Mix between grayscale and original color
  const saturatedRGB = grayscale.mix(inputColor.rgb, amountNode)

  return vec4(saturatedRGB, inputColor.a)
}

/**
 * Convert color to grayscale using luminance weights.
 * Shorthand for saturate(color, 0).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @returns Grayscale color
 *
 * @example
 * grayscale(texture(tex, uv()))
 */
export function grayscale(inputColor: TSLNode): TSLNode {
  return saturate(inputColor, 0)
}
