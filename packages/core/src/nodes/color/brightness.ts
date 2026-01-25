import { vec3, vec4, float, clamp } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Adjust brightness by adding a value to all color channels.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param amount - Brightness adjustment (-1 to 1, 0 = no change)
 * @returns Color with adjusted brightness
 *
 * @example
 * // Brighten by 20%
 * brightness(texture(tex, uv()), 0.2)
 *
 * @example
 * // Darken
 * brightness(texture(tex, uv()), -0.3)
 */
export function brightness(inputColor: TSLNode, amount: FloatInput): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount

  // Add brightness value to all channels
  const adjustedRGB = inputColor.rgb.add(vec3(amountNode, amountNode, amountNode))

  return vec4(adjustedRGB, inputColor.a)
}

/**
 * Adjust brightness multiplicatively (exposure-like).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param factor - Brightness factor (1 = no change, >1 = brighter, <1 = darker)
 * @returns Color with adjusted brightness
 *
 * @example
 * // Double brightness
 * brightnessMultiply(texture(tex, uv()), 2)
 */
export function brightnessMultiply(inputColor: TSLNode, factor: FloatInput): TSLNode {
  const factorNode = typeof factor === 'number' ? float(factor) : factor

  return vec4(inputColor.rgb.mul(factorNode), inputColor.a)
}

/**
 * Adjust brightness with clamping to prevent overflow.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param amount - Brightness adjustment (-1 to 1)
 * @returns Color with adjusted brightness, clamped to 0-1
 */
export function brightnessClamped(inputColor: TSLNode, amount: FloatInput): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount

  const adjustedRGB = clamp(
    inputColor.rgb.add(vec3(amountNode, amountNode, amountNode)),
    float(0),
    float(1)
  )

  return vec4(adjustedRGB, inputColor.a)
}
