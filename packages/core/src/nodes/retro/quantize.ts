import { vec4, float, floor } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Quantize color to discrete levels per channel.
 * Creates a retro/pixel art look by reducing the number of possible colors.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param levels - Number of levels per channel (2-256)
 * @returns Quantized color
 *
 * @example
 * // 8 levels per channel (512 colors)
 * quantize(texture(tex, uv()), 8)
 *
 * @example
 * // Binary colors per channel (8 colors total)
 * quantize(color, 2)
 *
 * @example
 * // Using a uniform for dynamic control
 * quantize(color, levelsUniform)
 */
export function quantize(inputColor: TSLNode, levels: FloatInput): TSLNode {
  const levelsNode = typeof levels === 'number' ? float(levels) : levels

  // Quantize formula: floor(color * levels) / (levels - 1)
  // This ensures we get exactly `levels` discrete values from 0 to 1
  const levelsMinusOne = levelsNode.sub(float(1))
  const quantizedRGB = floor(inputColor.rgb.mul(levelsNode)).div(levelsMinusOne)

  return vec4(quantizedRGB, inputColor.a)
}

/**
 * Quantize color with different levels for each RGB channel.
 * Useful for specific retro palettes like 3-3-2 (8-bit color).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param rLevels - Number of levels for red channel
 * @param gLevels - Number of levels for green channel
 * @param bLevels - Number of levels for blue channel
 * @returns Quantized color
 *
 * @example
 * // 8-bit color (3-3-2 format: 8R, 8G, 4B)
 * quantizeRGB(color, 8, 8, 4)
 *
 * @example
 * // 16-bit high color (5-6-5 format)
 * quantizeRGB(color, 32, 64, 32)
 */
export function quantizeRGB(
  inputColor: TSLNode,
  rLevels: FloatInput,
  gLevels: FloatInput,
  bLevels: FloatInput
): TSLNode {
  const rNode = typeof rLevels === 'number' ? float(rLevels) : rLevels
  const gNode = typeof gLevels === 'number' ? float(gLevels) : gLevels
  const bNode = typeof bLevels === 'number' ? float(bLevels) : bLevels

  // Quantize each channel separately
  const quantizedR = floor(inputColor.r.mul(rNode)).div(rNode.sub(float(1)))
  const quantizedG = floor(inputColor.g.mul(gNode)).div(gNode.sub(float(1)))
  const quantizedB = floor(inputColor.b.mul(bNode)).div(bNode.sub(float(1)))

  return vec4(quantizedR, quantizedG, quantizedB, inputColor.a)
}
