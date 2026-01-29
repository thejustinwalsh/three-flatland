import { vec2, vec3, vec4, float, floor, fract, sin, cos } from 'three/tsl'
import type { TSLNode, FloatInput, Vec3Input } from '../types'

/**
 * Hash function for pseudo-random sparkle generation.
 * @internal
 */
function sparkleHash(p: TSLNode): TSLNode {
  return fract(sin(p.dot(vec2(127.1, 311.7))).mul(43758.5453))
}

/**
 * Add sparkle/glitter effect to a color.
 * Creates randomly appearing bright spots that twinkle over time.
 *
 * @param inputColor - Base color (vec4)
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param density - Sparkle density (higher = more sparkles, default: 50)
 * @param intensity - Sparkle brightness (default: 2)
 * @param sparkleColor - Color of sparkles (default: white)
 * @param speed - Animation speed (default: 3)
 * @param threshold - Sparkle appearance threshold (default: 0.97)
 * @returns Color with sparkle effect
 *
 * @example
 * const sparkly = sparkle(inputColor, uv, time, 40, 2, [1, 1, 1])
 */
export function sparkle(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  density: FloatInput = 50,
  intensity: FloatInput = 2,
  sparkleColor: Vec3Input = [1, 1, 1],
  speed: FloatInput = 3,
  threshold: FloatInput = 0.97
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const densityNode = typeof density === 'number' ? float(density) : density
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const colorVec = Array.isArray(sparkleColor) ? vec3(...sparkleColor) : sparkleColor
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const thresholdNode = typeof threshold === 'number' ? float(threshold) : threshold

  // Grid cell for sparkle positions
  const cell = floor(uv.mul(densityNode))
  const cellUV = fract(uv.mul(densityNode))

  // Random position within cell
  const randPos = vec2(sparkleHash(cell), sparkleHash(cell.add(vec2(1, 0))))

  // Distance from sparkle center
  const dist = cellUV.sub(randPos).length()

  // Random phase offset for each sparkle
  const phase = sparkleHash(cell.add(vec2(0, 1))).mul(6.28)

  // Pulsing brightness
  const pulse = sin(timeNode.mul(speedNode).add(phase)).mul(0.5).add(0.5)

  // Only show sparkle if random value exceeds threshold
  const showSparkle = sparkleHash(cell.add(vec2(1, 1))).greaterThan(thresholdNode)

  // Sharp falloff for point-like sparkles
  const sparkleIntensity = float(1)
    .sub(dist.mul(4).clamp(0, 1))
    .pow(2)
    .mul(pulse)
    .mul(showSparkle.select(float(1), float(0)))
    .mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(sparkleIntensity))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Animated star sparkle with 4-point star shape.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param density - Sparkle density
 * @param intensity - Sparkle brightness
 * @param sparkleColor - Color of sparkles
 * @returns Color with star sparkle effect
 */
export function sparkleStar(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  density: FloatInput = 30,
  intensity: FloatInput = 1.5,
  sparkleColor: Vec3Input = [1, 1, 1]
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const densityNode = typeof density === 'number' ? float(density) : density
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const colorVec = Array.isArray(sparkleColor) ? vec3(...sparkleColor) : sparkleColor

  const cell = floor(uv.mul(densityNode))
  const cellUV = fract(uv.mul(densityNode)).sub(0.5)

  const phase = sparkleHash(cell).mul(6.28)
  const appear = sparkleHash(cell.add(vec2(1, 1)))

  // Only show some cells
  const show = appear.greaterThan(0.85)

  // Rotating star pattern
  const angle = timeNode.mul(2).add(phase)
  const rotatedUV = vec2(
    cellUV.x.mul(cos(angle)).sub(cellUV.y.mul(sin(angle))),
    cellUV.x.mul(sin(angle)).add(cellUV.y.mul(cos(angle)))
  )

  // 4-point star shape
  const star = rotatedUV.x
    .abs()
    .add(rotatedUV.y.abs())
    .pow(0.5)
    .max(rotatedUV.x.abs().max(rotatedUV.y.abs()).mul(0.7))

  const starIntensity = float(1)
    .sub(star.mul(3))
    .clamp(0, 1)
    .pow(2)
    .mul(show.select(float(1), float(0)))
    .mul(intensityNode)

  const finalRGB = inputColor.rgb.add(colorVec.mul(starIntensity))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Rainbow sparkle effect with color cycling.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param density - Sparkle density
 * @param intensity - Sparkle brightness
 * @returns Color with rainbow sparkle effect
 */
export function sparkleRainbow(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  density: FloatInput = 40,
  intensity: FloatInput = 1.5
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const densityNode = typeof density === 'number' ? float(density) : density
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const cell = floor(uv.mul(densityNode))
  const cellUV = fract(uv.mul(densityNode))

  const randPos = vec2(sparkleHash(cell), sparkleHash(cell.add(vec2(1, 0))))
  const dist = cellUV.sub(randPos).length()

  const phase = sparkleHash(cell.add(vec2(0, 1))).mul(6.28)
  const pulse = sin(timeNode.mul(4).add(phase)).mul(0.5).add(0.5)

  const showSparkle = sparkleHash(cell.add(vec2(1, 1))).greaterThan(0.95)

  // Rainbow color based on time and cell
  const hue = timeNode.mul(0.5).add(sparkleHash(cell).mul(6.28))
  const r = sin(hue).mul(0.5).add(0.5)
  const g = sin(hue.add(2.094)).mul(0.5).add(0.5)
  const b = sin(hue.add(4.189)).mul(0.5).add(0.5)
  const rainbowColor = vec3(r, g, b)

  const sparkleIntensity = float(1)
    .sub(dist.mul(5).clamp(0, 1))
    .pow(3)
    .mul(pulse)
    .mul(showSparkle.select(float(1), float(0)))
    .mul(intensityNode)

  const finalRGB = inputColor.rgb.add(rainbowColor.mul(sparkleIntensity))

  return vec4(finalRGB, inputColor.a)
}
