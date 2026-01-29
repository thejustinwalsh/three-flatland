import { vec2, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Gaussian blur using a 5-tap kernel.
 * Provides smooth, natural-looking blur with minimal samples.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Blur direction (use [1,0] for horizontal, [0,1] for vertical)
 * @param radius - Blur radius in UV space (default: 0.01)
 * @returns Blurred color
 *
 * @example
 * // Two-pass Gaussian blur (horizontal then vertical)
 * const blurH = blurGaussian(texture, uv, [1, 0], 0.01)
 * const blurV = blurGaussian(blurH, uv, [0, 1], 0.01)
 */
export function blurGaussian(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input = [1, 0],
  radius: FloatInput = 0.01
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  // 5-tap Gaussian weights (sigma ≈ 1)
  const weights = [0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216] as const
  const offsets = [0, 1, 2, 3, 4] as const

  // Center sample
  let result: TSLNode = sampleTexture(tex, uv).mul(weights[0])

  // Symmetric samples
  for (let i = 1; i < weights.length; i++) {
    const w = weights[i]!
    const o = offsets[i]!
    const offset = dirVec.mul(radiusNode).mul(float(o))
    const sample1 = sampleTexture(tex, uv.add(offset))
    const sample2 = sampleTexture(tex, uv.sub(offset))
    result = result.add(sample1.add(sample2).mul(w))
  }

  return result
}

/**
 * Higher quality 9-tap Gaussian blur.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Blur direction
 * @param radius - Blur radius
 * @returns Blurred color
 */
export function blurGaussian9(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input = [1, 0],
  radius: FloatInput = 0.01
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const radiusNode = typeof radius === 'number' ? float(radius) : radius

  // 9-tap Gaussian weights
  const weights = [0.102, 0.099, 0.089, 0.073, 0.054, 0.036, 0.021, 0.011, 0.004] as const
  const offsets = [0, 1.5, 3.5, 5.5, 7.5, 9.5, 11.5, 13.5, 15.5] as const

  let result: TSLNode = sampleTexture(tex, uv).mul(weights[0])

  for (let i = 1; i < weights.length; i++) {
    const w = weights[i]!
    const o = offsets[i]!
    const offset = dirVec.mul(radiusNode).mul(float(o / 4))
    const sample1 = sampleTexture(tex, uv.add(offset))
    const sample2 = sampleTexture(tex, uv.sub(offset))
    result = result.add(sample1.add(sample2).mul(w))
  }

  return result
}

/**
 * Simple two-pass Gaussian blur helper.
 * Applies horizontal then vertical blur.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param radius - Blur radius
 * @param texelSize - Size of one texel (for proper scaling)
 * @returns Blurred color
 */
export function blurGaussian2Pass(
  tex: Texture,
  uv: TSLNode,
  radius: FloatInput = 0.01,
  texelSize: Vec2Input = [1 / 512, 1 / 512]
): TSLNode {
  const radiusNode = typeof radius === 'number' ? float(radius) : radius
  const texelVec = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  // This is a simplified version - in practice, you'd use two render passes
  // For single-pass approximation, sample in a + pattern
  const weights = [0.2270270270, 0.3162162162, 0.0702702703] as const

  let result: TSLNode = sampleTexture(tex, uv).mul(weights[0])

  const offsets = [
    vec2(1, 0),
    vec2(-1, 0),
    vec2(0, 1),
    vec2(0, -1),
    vec2(1, 1),
    vec2(-1, -1),
    vec2(1, -1),
    vec2(-1, 1),
  ]

  for (let i = 0; i < 4; i++) {
    const offset = offsets[i]!.mul(texelVec).mul(radiusNode.mul(100))
    result = result.add(sampleTexture(tex, uv.add(offset)).mul(weights[1] / 4))
  }

  for (let i = 4; i < 8; i++) {
    const offset = offsets[i]!.mul(texelVec).mul(radiusNode.mul(100))
    result = result.add(sampleTexture(tex, uv.add(offset)).mul(weights[2] / 4))
  }

  return result
}
