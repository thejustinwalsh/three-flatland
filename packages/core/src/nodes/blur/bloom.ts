import { vec2, vec3, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec3Input, Vec2Input } from '../types'

// Luminance weights (Rec. 709)
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

/**
 * Extract bright areas for bloom effect.
 * Returns only pixels above a brightness threshold.
 *
 * @param inputColor - Input color (vec4)
 * @param threshold - Brightness threshold (0-1, default: 0.8)
 * @param softThreshold - Soft threshold knee (0-1, default: 0.1)
 * @returns Extracted bright areas
 *
 * @example
 * const brights = bloomThreshold(inputColor, 0.8)
 * const blurred = blurKawase(brights, uv, ...)
 * const final = inputColor.add(blurred)
 */
export function bloomThreshold(
  inputColor: TSLNode,
  threshold: FloatInput = 0.8,
  softThreshold: FloatInput = 0.1
): TSLNode {
  const threshNode = typeof threshold === 'number' ? float(threshold) : threshold
  const softNode = typeof softThreshold === 'number' ? float(softThreshold) : softThreshold

  // Calculate luminance
  const luma = inputColor.r
    .mul(LUMA_R)
    .add(inputColor.g.mul(LUMA_G))
    .add(inputColor.b.mul(LUMA_B))

  // Soft threshold for smoother falloff
  const knee = threshNode.mul(softNode)
  const soft = luma.sub(threshNode).add(knee)
  const contribution = soft.div(knee.mul(2)).clamp(0, 1)

  // Full contribution above threshold
  const hard = luma.greaterThan(threshNode).select(float(1), contribution)

  return vec4(inputColor.rgb.mul(hard), inputColor.a)
}

/**
 * Apply bloom effect using pre-blurred bright texture.
 *
 * @param inputColor - Original scene color
 * @param bloomTex - Pre-extracted and blurred bloom texture
 * @param uv - UV coordinates
 * @param intensity - Bloom intensity (default: 1)
 * @param tint - Bloom color tint (default: white)
 * @returns Color with bloom applied
 *
 * @example
 * const final = bloom(sceneColor, bloomBlurredTexture, uv, 1.2, [1, 0.95, 0.9])
 */
export function bloom(
  inputColor: TSLNode,
  bloomTex: Texture,
  uv: TSLNode,
  intensity: FloatInput = 1,
  tint: Vec3Input = [1, 1, 1]
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const tintVec = Array.isArray(tint) ? vec3(...tint) : tint

  const bloomColor = sampleTexture(bloomTex, uv)
  const tintedBloom = bloomColor.rgb.mul(tintVec).mul(intensityNode)

  return vec4(inputColor.rgb.add(tintedBloom), inputColor.a)
}

/**
 * Selective glow based on color matching.
 * Only applies glow to pixels matching a specific color.
 *
 * @param inputColor - Input color
 * @param targetColor - Color to glow
 * @param glowColor - Color of the glow
 * @param tolerance - Color matching tolerance (default: 0.2)
 * @param intensity - Glow intensity
 * @returns Color with selective glow
 */
export function glowSelective(
  inputColor: TSLNode,
  targetColor: Vec3Input,
  glowColor: Vec3Input = [1, 1, 1],
  tolerance: FloatInput = 0.2,
  intensity: FloatInput = 1
): TSLNode {
  const targetVec = Array.isArray(targetColor) ? vec3(...targetColor) : targetColor
  const glowVec = Array.isArray(glowColor) ? vec3(...glowColor) : glowColor
  const toleranceNode = typeof tolerance === 'number' ? float(tolerance) : tolerance
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Color distance
  const diff = inputColor.rgb.sub(targetVec).abs()
  const dist = diff.x.add(diff.y).add(diff.z).div(3)

  // Glow factor based on how close to target color
  const glowFactor = float(1).sub(dist.div(toleranceNode)).clamp(0, 1).mul(intensityNode)

  return vec4(inputColor.rgb.add(glowVec.mul(glowFactor)), inputColor.a)
}

/**
 * Anamorphic bloom - horizontal streak effect.
 * Common in film and sci-fi aesthetics.
 *
 * @param inputColor - Input color
 * @param bloomTex - Horizontally blurred bloom texture
 * @param uv - UV coordinates
 * @param intensity - Streak intensity
 * @param tint - Streak color tint (often slightly colored)
 * @returns Color with anamorphic bloom
 */
export function bloomAnamorphic(
  inputColor: TSLNode,
  bloomTex: Texture,
  uv: TSLNode,
  intensity: FloatInput = 1,
  tint: Vec3Input = [1, 0.95, 0.9]
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const tintVec = Array.isArray(tint) ? vec3(...tint) : tint

  const bloomColor = sampleTexture(bloomTex, uv)
  const tintedBloom = bloomColor.rgb.mul(tintVec).mul(intensityNode)

  return vec4(inputColor.rgb.add(tintedBloom), inputColor.a)
}

/**
 * Simple single-pass bloom approximation.
 * Samples in a star pattern for quick glow effect.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param threshold - Brightness threshold
 * @param radius - Glow radius
 * @param intensity - Glow intensity
 * @returns Color with bloom approximation
 */
export function bloomSimple(
  tex: Texture,
  uv: TSLNode,
  threshold: FloatInput = 0.7,
  radius: FloatInput = 0.01,
  intensity: FloatInput = 0.5
): TSLNode {
  const threshNode = typeof threshold === 'number' ? float(threshold) : threshold
  const radiusNode = typeof radius === 'number' ? float(radius) : radius
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const center = sampleTexture(tex, uv)

  // Sample in 8 directions
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0.707, 0.707],
    [-0.707, 0.707],
    [0.707, -0.707],
    [-0.707, -0.707],
  ]

  let bloomAccum: TSLNode = vec3(0, 0, 0)

  for (const [ox, oy] of offsets) {
    const sample = sampleTexture(tex, uv.add(vec2(float(ox).mul(radiusNode), float(oy).mul(radiusNode))))
    const luma = sample.r.mul(LUMA_R).add(sample.g.mul(LUMA_G)).add(sample.b.mul(LUMA_B))
    const contribution = luma.sub(threshNode).clamp(0, 1)
    bloomAccum = bloomAccum.add(sample.rgb.mul(contribution))
  }

  const bloom = bloomAccum.div(8).mul(intensityNode)

  return vec4(center.rgb.add(bloom), center.a)
}

/**
 * Vignette effect - darkens edges of the screen.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param intensity - Vignette strength (default: 0.5)
 * @param softness - Edge softness (default: 0.5)
 * @param roundness - Vignette shape roundness (default: 1)
 * @returns Color with vignette
 */
export function vignette(
  inputColor: TSLNode,
  uv: TSLNode,
  intensity: FloatInput = 0.5,
  softness: FloatInput = 0.5,
  roundness: FloatInput = 1
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const softnessNode = typeof softness === 'number' ? float(softness) : softness
  const roundnessNode = typeof roundness === 'number' ? float(roundness) : roundness

  // Distance from center (0,0 at center, 1 at corners for roundness=1)
  const centered = uv.sub(0.5).mul(2)
  const dist = centered.x.abs().pow(roundnessNode).add(centered.y.abs().pow(roundnessNode)).pow(float(1).div(roundnessNode))

  // Vignette falloff
  const vignetteFactor = float(1).sub(dist.mul(intensityNode))
  const smoothed = vignetteFactor.smoothstep(float(0), softnessNode)

  return vec4(inputColor.rgb.mul(smoothed), inputColor.a)
}

/**
 * Film grain effect.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param time - Animation time (for grain variation)
 * @param intensity - Grain intensity (default: 0.1)
 * @param luminanceInfluence - How much luminance affects grain (default: 0.5)
 * @returns Color with film grain
 */
export function filmGrain(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  intensity: FloatInput = 0.1,
  luminanceInfluence: FloatInput = 0.5
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const lumaInfluence = typeof luminanceInfluence === 'number' ? float(luminanceInfluence) : luminanceInfluence

  // Generate noise based on UV and time
  const seed = uv.x.mul(12.9898).add(uv.y.mul(78.233)).add(timeNode)
  const noise = seed.sin().mul(43758.5453).fract().sub(0.5).mul(2)

  // Luminance-based intensity (less grain in dark areas)
  const luma = inputColor.r.mul(LUMA_R).add(inputColor.g.mul(LUMA_G)).add(inputColor.b.mul(LUMA_B))
  const grainIntensity = intensityNode.mul(float(1).sub(luma.mul(lumaInfluence)))

  const grain = noise.mul(grainIntensity)

  return vec4(inputColor.rgb.add(grain), inputColor.a)
}
