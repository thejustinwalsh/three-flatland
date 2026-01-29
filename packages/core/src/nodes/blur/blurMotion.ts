import { vec2, vec3, vec4, float, texture as sampleTexture, sin } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Directional motion blur.
 * Simulates motion in a specific direction.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param direction - Motion direction (vec2)
 * @param strength - Blur strength/length (default: 0.05)
 * @param samples - Number of blur samples (default: 8)
 * @returns Motion-blurred color
 *
 * @example
 * // Horizontal motion blur
 * const blurred = blurMotion(texture, uv, [1, 0], 0.05)
 */
export function blurMotion(
  tex: Texture,
  uv: TSLNode,
  direction: Vec2Input,
  strength: FloatInput = 0.05,
  samples: number = 8
): TSLNode {
  const dirVec = Array.isArray(direction) ? vec2(...direction) : direction
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  const normalizedDir = dirVec.normalize()
  let result: TSLNode = vec4(0, 0, 0, 0)

  for (let i = 0; i < samples; i++) {
    const t = float(i / (samples - 1)).sub(0.5).mul(2) // -1 to 1
    const offset = normalizedDir.mul(strengthNode).mul(t)
    result = result.add(sampleTexture(tex, uv.add(offset)))
  }

  return result.div(float(samples))
}

/**
 * Velocity-based motion blur.
 * Blur strength and direction based on velocity vector.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param velocity - Velocity vector (direction and magnitude)
 * @param scale - Velocity to blur scale (default: 1)
 * @param samples - Number of samples
 * @returns Velocity-blurred color
 *
 * @example
 * const blurred = blurMotionVelocity(texture, uv, velocityTexture.rg)
 */
export function blurMotionVelocity(
  tex: Texture,
  uv: TSLNode,
  velocity: TSLNode | Vec2Input,
  scale: FloatInput = 1,
  samples: number = 8
): TSLNode {
  const velVec = Array.isArray(velocity) ? vec2(...velocity) : velocity
  const scaleNode = typeof scale === 'number' ? float(scale) : scale

  const blurVec = velVec.mul(scaleNode)
  let result: TSLNode = vec4(0, 0, 0, 0)

  for (let i = 0; i < samples; i++) {
    const t = float(i / (samples - 1))
    const offset = blurVec.mul(t.sub(0.5))
    result = result.add(sampleTexture(tex, uv.add(offset)))
  }

  return result.div(float(samples))
}

/**
 * Object motion blur with depth consideration.
 * Samples more in the direction of motion.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param velocity - Velocity at this pixel
 * @param maxBlur - Maximum blur length
 * @param samples - Number of samples
 * @returns Motion-blurred color
 */
export function blurMotionObject(
  tex: Texture,
  uv: TSLNode,
  velocity: TSLNode | Vec2Input,
  maxBlur: FloatInput = 0.1,
  samples: number = 8
): TSLNode {
  const velVec = Array.isArray(velocity) ? vec2(...velocity) : velocity
  const maxBlurNode = typeof maxBlur === 'number' ? float(maxBlur) : maxBlur

  const speed = velVec.length()
  const blurLength = speed.clamp(0, maxBlurNode)
  const blurDir = velVec.normalize()

  let result: TSLNode = vec4(0, 0, 0, 0)
  let totalWeight: TSLNode = float(0)

  for (let i = 0; i < samples; i++) {
    const t = float(i / (samples - 1))
    const offset = blurDir.mul(blurLength).mul(t)

    // Weight samples more toward the center
    const weight = float(1).sub(t.sub(0.5).abs().mul(2))

    result = result.add(sampleTexture(tex, uv.add(offset)).mul(weight))
    totalWeight = totalWeight.add(weight)
  }

  return result.div(totalWeight)
}

/**
 * Camera shake blur effect.
 * Simulates the blur from camera vibration.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param intensity - Shake intensity
 * @param samples - Number of samples
 * @param seed - Random seed for shake pattern
 * @returns Shake-blurred color
 */
export function blurShake(
  tex: Texture,
  uv: TSLNode,
  intensity: FloatInput = 0.01,
  samples: number = 5,
  seed: FloatInput = 0
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const seedNode = typeof seed === 'number' ? float(seed) : seed

  let result: TSLNode = vec4(0, 0, 0, 0)

  // Predetermined "random" offsets for shake pattern
  const offsets: Array<[number, number]> = [
    [0.0, 0.0],
    [0.7, 0.3],
    [-0.5, 0.8],
    [0.2, -0.6],
    [-0.8, -0.2],
  ]

  const actualSamples = Math.min(samples, offsets.length)

  for (let i = 0; i < actualSamples; i++) {
    const [ox, oy] = offsets[i]!
    // Add some variation based on seed
    const variation = float(i).add(seedNode).sin()
    const offset = vec2(ox, oy).mul(intensityNode).mul(variation.mul(0.3).add(1))
    result = result.add(sampleTexture(tex, uv.add(offset)))
  }

  return result.div(float(actualSamples))
}

/**
 * Directional speed lines effect.
 * Creates manga/anime style motion lines.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param center - Focus point
 * @param density - Line density
 * @param speed - Animation speed (use time input)
 * @returns Color with speed lines
 */
export function speedLines(
  inputColor: TSLNode,
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  density: FloatInput = 50,
  speed: TSLNode | FloatInput = 0
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const densityNode = typeof density === 'number' ? float(density) : density
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  const toPixel = uv.sub(centerVec)
  const angle = toPixel.y.atan2(toPixel.x)
  const dist = toPixel.length()

  // Create radial lines
  const linePattern = sin(angle.mul(densityNode).add(speedNode))
  const lines = linePattern.mul(0.5).add(0.5).pow(3)

  // Fade lines toward center
  const fade = dist.mul(3).clamp(0, 1)

  const darken = float(1).sub(lines.mul(fade).mul(0.5))

  return vec4(inputColor.rgb.mul(darken), inputColor.a)
}
