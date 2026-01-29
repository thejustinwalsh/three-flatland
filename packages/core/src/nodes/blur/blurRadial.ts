import { vec2, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Radial blur (zoom blur) emanating from a center point.
 * Creates a motion blur effect as if zooming in/out.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param center - Center point of the blur (default: [0.5, 0.5])
 * @param strength - Blur strength (default: 0.1)
 * @param samples - Number of blur samples (default: 8)
 * @returns Radially blurred color
 *
 * @example
 * const zoomed = blurRadial(texture, uv, [0.5, 0.5], 0.1)
 */
export function blurRadial(
  tex: Texture,
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  strength: FloatInput = 0.1,
  samples: number = 8
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Direction from center to current pixel
  const toPixel = uv.sub(centerVec)

  let result: TSLNode = vec4(0, 0, 0, 0)

  for (let i = 0; i < samples; i++) {
    const t = float(i / (samples - 1))
    const scale = float(1).sub(t.mul(strengthNode))
    const sampleUV = centerVec.add(toPixel.mul(scale))
    result = result.add(sampleTexture(tex, sampleUV))
  }

  return result.div(float(samples))
}

/**
 * Radial blur with distance-based intensity.
 * Blur strength increases with distance from center.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param center - Center point
 * @param strength - Base blur strength
 * @param samples - Number of samples
 * @param falloff - How much blur increases with distance
 * @returns Radially blurred color
 */
export function blurRadialDistance(
  tex: Texture,
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  strength: FloatInput = 0.1,
  samples: number = 8,
  falloff: FloatInput = 2
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const falloffNode = typeof falloff === 'number' ? float(falloff) : falloff

  const toPixel = uv.sub(centerVec)
  const dist = toPixel.length()

  // Blur increases with distance from center
  const localStrength = strengthNode.mul(dist.mul(falloffNode))

  let result: TSLNode = vec4(0, 0, 0, 0)

  for (let i = 0; i < samples; i++) {
    const t = float(i / (samples - 1))
    const scale = float(1).sub(t.mul(localStrength))
    const sampleUV = centerVec.add(toPixel.mul(scale))
    result = result.add(sampleTexture(tex, sampleUV))
  }

  return result.div(float(samples))
}

/**
 * Spin blur - circular motion blur around a center point.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param center - Center of rotation
 * @param angle - Total rotation angle in radians
 * @param samples - Number of samples
 * @returns Spin-blurred color
 */
export function blurSpin(
  tex: Texture,
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  angle: FloatInput = 0.1,
  samples: number = 8
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const angleNode = typeof angle === 'number' ? float(angle) : angle

  const toPixel = uv.sub(centerVec)

  let result: TSLNode = vec4(0, 0, 0, 0)

  for (let i = 0; i < samples; i++) {
    const t = float(i / (samples - 1)).sub(0.5).mul(2) // -1 to 1
    const rotation = angleNode.mul(t)

    const cosR = rotation.cos()
    const sinR = rotation.sin()

    const rotated = vec2(
      toPixel.x.mul(cosR).sub(toPixel.y.mul(sinR)),
      toPixel.x.mul(sinR).add(toPixel.y.mul(cosR))
    )

    result = result.add(sampleTexture(tex, centerVec.add(rotated)))
  }

  return result.div(float(samples))
}

/**
 * Focus blur - sharp in center, blurred at edges.
 * Simulates depth of field or tilt-shift effect.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param center - Focus center point
 * @param focusRadius - Radius of sharp focus area
 * @param blurAmount - Maximum blur at edges
 * @param samples - Blur quality
 * @returns Focus-blurred color
 */
export function blurFocus(
  tex: Texture,
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  focusRadius: FloatInput = 0.2,
  blurAmount: FloatInput = 0.02,
  samples: number = 5
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const focusNode = typeof focusRadius === 'number' ? float(focusRadius) : focusRadius
  const blurNode = typeof blurAmount === 'number' ? float(blurAmount) : blurAmount

  const dist = uv.sub(centerVec).length()
  const blurFactor = dist.sub(focusNode).div(focusNode).clamp(0, 1)
  const localBlur = blurNode.mul(blurFactor)

  let result: TSLNode = vec4(0, 0, 0, 0)
  const halfSize = Math.floor(samples / 2)
  const totalSamples = samples * samples

  for (let x = -halfSize; x <= halfSize; x++) {
    for (let y = -halfSize; y <= halfSize; y++) {
      const offset = vec2(x, y).div(float(halfSize)).mul(localBlur)
      result = result.add(sampleTexture(tex, uv.add(offset)))
    }
  }

  return result.div(float(totalSamples))
}
