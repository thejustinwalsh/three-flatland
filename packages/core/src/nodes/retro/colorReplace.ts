import { vec3, vec4, float } from 'three/tsl'
import type { TSLNode, FloatInput, Vec3Input } from '../types'

/**
 * Replace a target color with a new color.
 * Uses smooth tolerance for anti-aliased sprites (smooth falloff at edges).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param targetColor - Color to find and replace (RGB tuple or vec3 node)
 * @param replaceColor - Color to replace with (RGB tuple or vec3 node)
 * @param tolerance - Match tolerance (default: 0.1)
 * @returns Color with replacement applied
 *
 * @example
 * // Swap red for blue
 * colorReplace(color, [1, 0, 0], [0, 0, 1], 0.1)
 *
 * @example
 * // Create team color variants with uniform
 * colorReplace(color, baseColor, teamColorUniform, 0.15)
 */
export function colorReplace(
  inputColor: TSLNode,
  targetColor: Vec3Input,
  replaceColor: Vec3Input,
  tolerance: FloatInput = 0.1
): TSLNode {
  const targetNode = Array.isArray(targetColor)
    ? vec3(targetColor[0], targetColor[1], targetColor[2])
    : targetColor
  const replaceNode = Array.isArray(replaceColor)
    ? vec3(replaceColor[0], replaceColor[1], replaceColor[2])
    : replaceColor
  const toleranceNode = typeof tolerance === 'number' ? float(tolerance) : tolerance

  // Calculate distance from target color
  const diff = inputColor.rgb.sub(targetNode)
  const distance = diff.dot(diff).sqrt()

  // Smooth falloff: 1 at center, 0 at tolerance edge
  const factor = float(1).sub(distance.div(toleranceNode)).clamp(0, 1)

  // Mix between original and replacement based on factor
  const mixedRGB = inputColor.rgb.mix(replaceNode, factor)

  return vec4(mixedRGB, inputColor.a)
}

/**
 * Replace a target color with a new color using hard cutoff (no blending).
 * Good for pixel art with exact color matching.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param targetColor - Color to find and replace (RGB tuple or vec3 node)
 * @param replaceColor - Color to replace with (RGB tuple or vec3 node)
 * @param tolerance - Match tolerance (default: 0.01)
 * @returns Color with replacement applied
 *
 * @example
 * // Exact color swap for pixel art
 * colorReplaceHard(color, [1, 0, 0], [0, 0, 1], 0.01)
 */
export function colorReplaceHard(
  inputColor: TSLNode,
  targetColor: Vec3Input,
  replaceColor: Vec3Input,
  tolerance: FloatInput = 0.01
): TSLNode {
  const targetNode = Array.isArray(targetColor)
    ? vec3(targetColor[0], targetColor[1], targetColor[2])
    : targetColor
  const replaceNode = Array.isArray(replaceColor)
    ? vec3(replaceColor[0], replaceColor[1], replaceColor[2])
    : replaceColor
  const toleranceNode = typeof tolerance === 'number' ? float(tolerance) : tolerance

  // Calculate distance from target color
  const diff = inputColor.rgb.sub(targetNode)
  const distance = diff.dot(diff).sqrt()

  // Hard cutoff: 1 if within tolerance, 0 otherwise
  const isMatch = distance.lessThan(toleranceNode)

  // Select between original and replacement
  const resultRGB = isMatch.select(replaceNode, inputColor.rgb)

  return vec4(resultRGB, inputColor.a)
}

/**
 * Replace multiple colors at once (palette swap).
 * Each source color maps to a corresponding target color.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param sourceColors - Array of colors to find (RGB tuples)
 * @param targetColors - Array of colors to replace with (RGB tuples)
 * @param tolerance - Match tolerance (default: 0.1)
 * @returns Color with all replacements applied
 *
 * @example
 * // Swap entire character palette
 * colorReplaceMultiple(
 *   color,
 *   [[1, 0, 0], [0, 1, 0], [0, 0, 1]],  // Source: red, green, blue
 *   [[1, 0.5, 0], [0, 0.5, 0], [0.5, 0, 1]],  // Target: orange, dark green, purple
 *   0.15
 * )
 */
export function colorReplaceMultiple(
  inputColor: TSLNode,
  sourceColors: [number, number, number][],
  targetColors: [number, number, number][],
  tolerance: FloatInput = 0.1
): TSLNode {
  if (sourceColors.length !== targetColors.length) {
    throw new Error('colorReplaceMultiple: sourceColors and targetColors must have same length')
  }

  const toleranceNode = typeof tolerance === 'number' ? float(tolerance) : tolerance

  // Start with original color
  let resultRGB: TSLNode = inputColor.rgb

  // Apply each replacement in sequence
  for (let i = 0; i < sourceColors.length; i++) {
    const source = sourceColors[i]!
    const target = targetColors[i]!
    const sourceNode = vec3(source[0], source[1], source[2])
    const targetNode = vec3(target[0], target[1], target[2])

    // Calculate distance from source color
    const diff = resultRGB.sub(sourceNode)
    const distance = diff.dot(diff).sqrt()

    // Smooth falloff
    const factor = float(1).sub(distance.div(toleranceNode)).clamp(0, 1)

    // Mix with replacement
    resultRGB = resultRGB.mix(targetNode, factor)
  }

  return vec4(resultRGB, inputColor.a)
}
