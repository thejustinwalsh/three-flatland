import { vec3, vec4, float } from 'three/tsl'
import type { TSLNode, Vec3Input, FloatInput } from '../types'

/**
 * Apply a color tint by multiplying with the input color.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param tintColor - Tint color as [r, g, b] (0-1 range) or TSL node
 * @param strength - Tint strength (0 = no tint, 1 = full tint, default: 1)
 * @returns Tinted color
 *
 * @example
 * // Apply red tint
 * tint(texture(tex, uv()), [1, 0, 0])
 *
 * @example
 * // Partial tint with uniform
 * tint(texture(tex, uv()), tintColorUniform, 0.5)
 */
export function tint(
  inputColor: TSLNode,
  tintColor: Vec3Input,
  strength: FloatInput = 1
): TSLNode {
  const tintVec = Array.isArray(tintColor) ? vec3(...tintColor) : tintColor
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Mix original RGB with tinted RGB based on strength
  const tintedRGB = inputColor.rgb.mul(tintVec)
  const mixedRGB = inputColor.rgb.mix(tintedRGB, strengthNode)

  return vec4(mixedRGB, inputColor.a)
}

/**
 * Apply an additive color tint (adds color rather than multiplying).
 * Useful for "flash" effects like damage feedback.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param addColor - Color to add as [r, g, b] (0-1 range) or TSL node
 * @param strength - Effect strength (0 = no effect, 1 = full effect)
 * @returns Color with additive tint
 *
 * @example
 * // Flash white on hit
 * tintAdditive(texture(tex, uv()), [1, 1, 1], hitFlashUniform)
 */
export function tintAdditive(
  inputColor: TSLNode,
  addColor: Vec3Input,
  strength: FloatInput = 1
): TSLNode {
  const addVec = Array.isArray(addColor) ? vec3(...addColor) : addColor
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Add color scaled by strength
  const addedRGB = inputColor.rgb.add(addVec.mul(strengthNode))

  return vec4(addedRGB, inputColor.a)
}
