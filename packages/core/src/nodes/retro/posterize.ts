import { vec4, float, floor } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Posterize color to create flat, comic-book style bands.
 * This is semantically equivalent to quantize but with artist-friendly naming.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param bands - Number of color bands (2-16 typical)
 * @returns Posterized color
 *
 * @example
 * // Create comic-book style with 4 bands
 * posterize(texture(tex, uv()), 4)
 *
 * @example
 * // Subtle posterization with 8 bands
 * posterize(color, 8)
 *
 * @example
 * // Dynamic posterization with uniform
 * posterize(color, bandsUniform)
 */
export function posterize(inputColor: TSLNode, bands: FloatInput): TSLNode {
  const bandsNode = typeof bands === 'number' ? float(bands) : bands

  // Same formula as quantize: floor(color * bands) / (bands - 1)
  const bandsMinusOne = bandsNode.sub(float(1))
  const posterizedRGB = floor(inputColor.rgb.mul(bandsNode)).div(bandsMinusOne)

  return vec4(posterizedRGB, inputColor.a)
}

/**
 * Posterize with gamma correction for more perceptually uniform bands.
 * Applies gamma before quantization and inverse gamma after.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param bands - Number of color bands (2-16 typical)
 * @param gamma - Gamma value (default: 2.2 for sRGB)
 * @returns Posterized color with gamma correction
 *
 * @example
 * // Gamma-corrected posterization
 * posterizeGamma(color, 4)
 *
 * @example
 * // Custom gamma
 * posterizeGamma(color, 4, 1.8)
 */
export function posterizeGamma(
  inputColor: TSLNode,
  bands: FloatInput,
  gamma: FloatInput = 2.2
): TSLNode {
  const bandsNode = typeof bands === 'number' ? float(bands) : bands
  const gammaNode = typeof gamma === 'number' ? float(gamma) : gamma

  // Convert to linear space
  const linearRGB = inputColor.rgb.pow(gammaNode)

  // Posterize in linear space
  const bandsMinusOne = bandsNode.sub(float(1))
  const posterizedRGB = floor(linearRGB.mul(bandsNode)).div(bandsMinusOne)

  // Convert back to gamma space
  const inverseGamma = float(1).div(gammaNode)
  const finalRGB = posterizedRGB.pow(inverseGamma)

  return vec4(finalRGB, inputColor.a)
}
