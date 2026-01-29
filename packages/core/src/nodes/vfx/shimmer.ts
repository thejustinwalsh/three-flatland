import { vec3, vec4, float, sin, cos } from 'three/tsl'
import type { TSLNode, FloatInput, Vec3Input } from '../types'

/**
 * Add shimmer/shine effect - a moving highlight across the surface.
 * Creates a metallic or glossy appearance.
 *
 * @param inputColor - Base color (vec4)
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param angle - Shimmer angle in radians (default: 0.785 = 45°)
 * @param speed - Animation speed (default: 1)
 * @param intensity - Shimmer brightness (default: 0.5)
 * @param shimmerColor - Color of the shimmer highlight
 * @param width - Width of shimmer band (default: 0.1)
 * @returns Color with shimmer effect
 *
 * @example
 * const shiny = shimmer(inputColor, uv, time, Math.PI/4, 1, 0.5, [1, 1, 1])
 */
export function shimmer(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  angle: FloatInput = 0.785,
  speed: FloatInput = 1,
  intensity: FloatInput = 0.5,
  shimmerColor: Vec3Input = [1, 1, 1],
  width: FloatInput = 0.1
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const angleNode = typeof angle === 'number' ? float(angle) : angle
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const colorVec = Array.isArray(shimmerColor) ? vec3(...shimmerColor) : shimmerColor
  const widthNode = typeof width === 'number' ? float(width) : width

  // Project UV onto shimmer direction
  const dir = cos(angleNode).mul(uv.x).add(sin(angleNode).mul(uv.y))

  // Moving shimmer position (wraps around)
  const shimmerPos = timeNode.mul(speedNode).mod(2).sub(0.5)

  // Distance from shimmer line
  const dist = dir.sub(shimmerPos).abs()

  // Smooth shimmer falloff
  const shimmerIntensity = float(1)
    .sub(dist.div(widthNode).clamp(0, 1))
    .pow(2)
    .mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(shimmerIntensity))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Wave shimmer effect - multiple shimmering waves.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param waves - Number of shimmer waves (default: 3)
 * @param speed - Animation speed
 * @param intensity - Shimmer intensity
 * @param shimmerColor - Shimmer color
 * @returns Color with wave shimmer
 */
export function shimmerWave(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  waves: FloatInput = 3,
  speed: FloatInput = 1,
  intensity: FloatInput = 0.3,
  shimmerColor: Vec3Input = [1, 1, 1]
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const wavesNode = typeof waves === 'number' ? float(waves) : waves
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const colorVec = Array.isArray(shimmerColor) ? vec3(...shimmerColor) : shimmerColor

  // Multiple sine waves at different phases
  const wave1 = sin(uv.x.mul(6.28).mul(wavesNode).add(timeNode.mul(speedNode))).mul(0.5).add(0.5)
  const wave2 = sin(
    uv.x
      .mul(6.28)
      .mul(wavesNode.mul(0.7))
      .add(timeNode.mul(speedNode.mul(1.3)))
  )
    .mul(0.5)
    .add(0.5)

  const combined = wave1.mul(wave2).pow(3).mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(combined))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Holographic shimmer with rainbow effect.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param speed - Animation speed
 * @param intensity - Effect intensity
 * @returns Color with holographic shimmer
 */
export function shimmerHolographic(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  speed: FloatInput = 1,
  intensity: FloatInput = 0.4
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Angle-based color separation (holographic diffraction)
  const angle = uv.x.add(uv.y).mul(10).add(timeNode.mul(speedNode))

  const r = sin(angle).mul(0.5).add(0.5)
  const g = sin(angle.add(2.094)).mul(0.5).add(0.5)
  const b = sin(angle.add(4.189)).mul(0.5).add(0.5)

  // Modulate by shimmer band
  const shimmerBand = sin(uv.x.sub(uv.y).mul(3).add(timeNode.mul(speedNode.mul(2))))
    .mul(0.5)
    .add(0.5)
    .pow(4)

  const holoColor = vec3(r, g, b).mul(shimmerBand).mul(intensityNode)

  const finalRGB = inputColor.rgb.add(holoColor)

  return vec4(finalRGB, inputColor.a)
}

/**
 * Metallic shine effect based on viewing angle simulation.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param time - Animation time (for subtle movement)
 * @param intensity - Shine intensity
 * @param shineColor - Color of metallic highlight
 * @returns Color with metallic shine
 */
export function shimmerMetallic(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput = 0,
  intensity: FloatInput = 0.5,
  shineColor: Vec3Input = [1, 1, 1]
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const colorVec = Array.isArray(shineColor) ? vec3(...shineColor) : shineColor

  // Simulate viewing angle based on UV
  const viewAngle = uv.x.sub(0.5).mul(2)

  // Metallic fresnel-like effect
  const fresnel = float(1).sub(viewAngle.abs()).pow(3)

  // Add subtle movement
  const movement = sin(timeNode.mul(0.5)).mul(0.1).add(1)

  const shine = fresnel.mul(movement).mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(shine))

  return vec4(finalRGB, inputColor.a)
}
