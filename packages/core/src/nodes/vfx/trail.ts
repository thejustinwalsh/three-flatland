import { vec2, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Create motion trail effect by sampling previous positions.
 * Samples the texture at offset positions to create a trailing effect.
 *
 * @param tex - Source texture
 * @param uv - Current UV coordinates
 * @param direction - Trail direction (normalized vec2 or [x, y])
 * @param length - Trail length in UV space (default: 0.1)
 * @param samples - Number of trail samples (default: 4)
 * @param falloff - How quickly trail fades (default: 2)
 * @returns Color with motion trail
 *
 * @example
 * // Horizontal motion trail
 * const trailed = trail(texture, uv, [1, 0], 0.1, 4)
 */
export function trail(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input,
  length: FloatInput = 0.1,
  samples: number = 4,
  falloff: FloatInput = 2
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const lengthNode = typeof length === 'number' ? float(length) : length
  const falloffNode = typeof falloff === 'number' ? float(falloff) : falloff

  // Start with the main sample
  let result: TSLNode = sampleTexture(tex, uv)

  // Add trail samples
  for (let i = 1; i <= samples; i++) {
    const t = float(i / samples)
    const offset = dirVec.mul(lengthNode).mul(t)
    const sampleColor = sampleTexture(tex, uv.add(offset))

    // Fade trail with distance
    const weight = float(1).sub(t.pow(falloffNode))

    // Blend using max for additive-like trailing
    result = vec4(result.rgb.max(sampleColor.rgb.mul(weight)), result.a.max(sampleColor.a.mul(weight)))
  }

  return result
}

/**
 * Motion trail with additive blending for glowing trails.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Trail direction
 * @param length - Trail length
 * @param samples - Number of samples
 * @param intensity - Trail intensity
 * @returns Color with additive trail
 */
export function trailAdditive(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input,
  length: FloatInput = 0.1,
  samples: number = 4,
  intensity: FloatInput = 0.5
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const lengthNode = typeof length === 'number' ? float(length) : length
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const mainSample = sampleTexture(tex, uv)
  let trailAccum = mainSample.rgb

  for (let i = 1; i <= samples; i++) {
    const t = float(i / samples)
    const offset = dirVec.mul(lengthNode).mul(t)
    const sampleColor = sampleTexture(tex, uv.add(offset))

    const weight = float(1).sub(t).mul(intensityNode).div(float(samples))
    trailAccum = trailAccum.add(sampleColor.rgb.mul(weight))
  }

  return vec4(trailAccum, mainSample.a)
}

/**
 * Speed lines / motion blur in a direction.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Motion direction
 * @param length - Blur length
 * @param samples - Number of blur samples
 * @returns Motion-blurred color
 */
export function trailBlur(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input,
  length: FloatInput = 0.05,
  samples: number = 8
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const lengthNode = typeof length === 'number' ? float(length) : length

  let colorSumRgb: TSLNode = sampleTexture(tex, uv).rgb
  let colorSumA: TSLNode = sampleTexture(tex, uv).a

  // Sample in both directions for centered blur
  for (let i = 1; i <= samples; i++) {
    const t = float(i / samples)
    const offset = dirVec.mul(lengthNode).mul(t)

    const sample1 = sampleTexture(tex, uv.add(offset))
    const sample2 = sampleTexture(tex, uv.sub(offset))

    colorSumRgb = colorSumRgb.add(sample1.rgb).add(sample2.rgb)
    colorSumA = colorSumA.add(sample1.a).add(sample2.a)
  }

  const totalSamples = float(1 + samples * 2)
  return vec4(colorSumRgb.div(totalSamples), colorSumA.div(totalSamples))
}

/**
 * Create echo/ghost trail using velocity-based offset.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param velocity - Current velocity (determines direction and intensity)
 * @param maxLength - Maximum trail length
 * @param samples - Number of echo samples
 * @param opacity - Trail opacity
 * @returns Color with velocity-based trail
 */
export function trailVelocity(
  tex: Texture,
  uv: TSLNode,
  velocity: TSLNode | Vec2Input,
  maxLength: FloatInput = 0.15,
  samples: number = 4,
  opacity: FloatInput = 0.6
): TSLNode {
  const velVec = Array.isArray(velocity) ? vec2(...velocity) : velocity
  const maxLengthNode = typeof maxLength === 'number' ? float(maxLength) : maxLength
  const opacityNode = typeof opacity === 'number' ? float(opacity) : opacity

  const speed = velVec.length()
  const direction = velVec.normalize()
  const trailLength = speed.clamp(0, 1).mul(maxLengthNode)

  const mainSample = sampleTexture(tex, uv)
  let result: TSLNode = mainSample

  for (let i = 1; i <= samples; i++) {
    const t = float(i / samples)
    const offset = direction.mul(trailLength).mul(t)
    const ghostSample = sampleTexture(tex, uv.add(offset))

    const weight = float(1).sub(t).mul(opacityNode)
    const blended = result.rgb.max(ghostSample.rgb.mul(weight))
    result = vec4(blended, result.a.max(ghostSample.a.mul(weight)))
  }

  return result
}
