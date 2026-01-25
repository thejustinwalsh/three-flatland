import { vec3, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput } from '../types'

// Standard luminance weights (Rec. 709)
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

/**
 * Remap colors using a gradient texture (LUT) based on luminance.
 * The gradient texture should be a horizontal strip where left = dark, right = bright.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param gradientTex - Horizontal gradient texture for color lookup
 * @param strength - Effect strength (0 = original, 1 = fully remapped)
 * @returns Color remapped through gradient
 *
 * @example
 * // Remap colors through a fire gradient
 * colorRemap(texture(tex, uv()), fireGradientTexture)
 *
 * @example
 * // Partial remap with uniform
 * colorRemap(texture(tex, uv()), gradientTex, strengthUniform)
 */
export function colorRemap(
  inputColor: TSLNode,
  gradientTex: Texture,
  strength: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Calculate luminance
  const lumaWeights = vec3(LUMA_R, LUMA_G, LUMA_B)
  const luminance = inputColor.rgb.dot(lumaWeights)

  // Sample gradient at luminance position (use center of texture vertically)
  const gradientUV = vec3(luminance, float(0.5), float(0))
  const remappedColor = sampleTexture(gradientTex, gradientUV.xy)

  // Mix original with remapped based on strength
  const mixedRGB = inputColor.rgb.mix(remappedColor.rgb, strengthNode)

  return vec4(mixedRGB, inputColor.a)
}

/**
 * Remap colors using a custom channel for lookup instead of luminance.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param gradientTex - Horizontal gradient texture for color lookup
 * @param lookupValue - Custom value for gradient lookup (0-1)
 * @param strength - Effect strength (0 = original, 1 = fully remapped)
 * @returns Color remapped through gradient
 *
 * @example
 * // Remap based on red channel
 * colorRemapCustom(texture(tex, uv()), gradientTex, inputColor.r)
 */
export function colorRemapCustom(
  inputColor: TSLNode,
  gradientTex: Texture,
  lookupValue: FloatInput,
  strength: FloatInput = 1
): TSLNode {
  const lookupNode = typeof lookupValue === 'number' ? float(lookupValue) : lookupValue
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Sample gradient at lookup position
  const gradientUV = vec3(lookupNode, float(0.5), float(0))
  const remappedColor = sampleTexture(gradientTex, gradientUV.xy)

  // Mix original with remapped based on strength
  const mixedRGB = inputColor.rgb.mix(remappedColor.rgb, strengthNode)

  return vec4(mixedRGB, inputColor.a)
}
