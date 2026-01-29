import { vec2, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Simple box blur with uniform weights.
 * Faster than Gaussian but produces more blocky results.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param radius - Blur radius in UV space
 * @param samples - Number of samples per axis (default: 3)
 * @returns Blurred color
 *
 * @example
 * const blurred = blurBox(texture, uv, 0.01, 5)
 */
export function blurBox(
  tex: Texture,
  uv: TSLNode,
  radius: FloatInput = 0.01,
  samples: number = 3
): TSLNode {
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  let result: TSLNode = vec4(0, 0, 0, 0)
  const halfSize = Math.floor(samples / 2)
  const totalSamples = samples * samples

  for (let x = -halfSize; x <= halfSize; x++) {
    for (let y = -halfSize; y <= halfSize; y++) {
      const offset = vec2(x, y).div(float(halfSize)).mul(radiusNode)
      result = result.add(sampleTexture(tex, uv.add(offset)))
    }
  }

  return result.div(float(totalSamples))
}

/**
 * Directional box blur.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Blur direction
 * @param radius - Blur radius
 * @param samples - Number of samples
 * @returns Blurred color
 */
export function blurBoxDirectional(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input = [1, 0],
  radius: FloatInput = 0.01,
  samples: number = 5
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  let result: TSLNode = vec4(0, 0, 0, 0)
  const halfSize = Math.floor(samples / 2)

  for (let i = -halfSize; i <= halfSize; i++) {
    const offset = dirVec.mul(radiusNode).mul(float(i / halfSize))
    result = result.add(sampleTexture(tex, uv.add(offset)))
  }

  return result.div(float(samples))
}

/**
 * Fast 3x3 box blur.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Size of one texel
 * @returns Blurred color
 */
export function blurBox3x3(tex: Texture, uv: TSLNode, texelSize: Vec2Input = [1 / 512, 1 / 512]): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  const offsets = [
    vec2(-1, -1),
    vec2(0, -1),
    vec2(1, -1),
    vec2(-1, 0),
    vec2(0, 0),
    vec2(1, 0),
    vec2(-1, 1),
    vec2(0, 1),
    vec2(1, 1),
  ]

  let result: TSLNode = vec4(0, 0, 0, 0)

  for (const offset of offsets) {
    result = result.add(sampleTexture(tex, uv.add(offset.mul(texel))))
  }

  return result.div(9)
}

/**
 * Variable-size box blur with smooth edges.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param radius - Blur radius
 * @param softness - Edge softness (0 = sharp box, 1 = smooth falloff)
 * @param samples - Number of samples per axis
 * @returns Blurred color
 */
export function blurBoxSmooth(
  tex: Texture,
  uv: TSLNode,
  radius: FloatInput = 0.01,
  softness: FloatInput = 0.5,
  samples: number = 5
): TSLNode {
  const radiusNode = typeof radius === 'number' ? float(radius) : radius
  const softnessNode = typeof softness === 'number' ? float(softness) : softness

  let result: TSLNode = vec4(0, 0, 0, 0)
  let totalWeight: TSLNode = float(0)
  const halfSize = Math.floor(samples / 2)

  for (let x = -halfSize; x <= halfSize; x++) {
    for (let y = -halfSize; y <= halfSize; y++) {
      const normalizedOffset = vec2(x, y).div(float(halfSize))
      const offset = normalizedOffset.mul(radiusNode)

      // Weight based on distance from center
      const dist = normalizedOffset.length()
      const weight = float(1).sub(dist.mul(softnessNode)).clamp(0, 1)

      result = result.add(sampleTexture(tex, uv.add(offset)).mul(weight))
      totalWeight = totalWeight.add(weight)
    }
  }

  return result.div(totalWeight)
}
