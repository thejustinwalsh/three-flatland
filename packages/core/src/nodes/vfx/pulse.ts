import { vec2, vec3, vec4, float, sin, cos } from 'three/tsl'
import type { TSLNode, FloatInput, Vec3Input, Vec2Input } from '../types'

/**
 * Apply pulsing glow effect that modulates brightness over time.
 *
 * @param inputColor - Base color (vec4)
 * @param time - Animation time
 * @param speed - Pulse speed (default: 2)
 * @param minBrightness - Minimum brightness multiplier (default: 0.8)
 * @param maxBrightness - Maximum brightness multiplier (default: 1.2)
 * @returns Pulsing color
 *
 * @example
 * const pulsing = pulse(inputColor, time, 2, 0.8, 1.2)
 */
export function pulse(
  inputColor: TSLNode,
  time: TSLNode | FloatInput,
  speed: FloatInput = 2,
  minBrightness: FloatInput = 0.8,
  maxBrightness: FloatInput = 1.2
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const minNode = typeof minBrightness === 'number' ? float(minBrightness) : minBrightness
  const maxNode = typeof maxBrightness === 'number' ? float(maxBrightness) : maxBrightness

  // Smooth sine pulse
  const t = sin(timeNode.mul(speedNode)).mul(0.5).add(0.5)
  const brightness = minNode.mix(maxNode, t)

  return vec4(inputColor.rgb.mul(brightness), inputColor.a)
}

/**
 * Pulsing glow that adds color rather than multiplying.
 *
 * @param inputColor - Base color
 * @param time - Animation time
 * @param glowColor - Color to pulse
 * @param speed - Pulse speed
 * @param intensity - Maximum glow intensity
 * @returns Color with pulsing glow
 */
export function pulseGlow(
  inputColor: TSLNode,
  time: TSLNode | FloatInput,
  glowColor: Vec3Input = [1, 1, 1],
  speed: FloatInput = 2,
  intensity: FloatInput = 0.5
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const colorVec = Array.isArray(glowColor) ? vec3(...glowColor) : glowColor
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const t = sin(timeNode.mul(speedNode)).mul(0.5).add(0.5)
  const glow = colorVec.mul(t).mul(intensityNode)

  return vec4(inputColor.rgb.add(glow), inputColor.a)
}

/**
 * Heartbeat-style pulse with quick beat and pause.
 *
 * @param inputColor - Base color
 * @param time - Animation time
 * @param speed - Animation speed
 * @param intensity - Pulse intensity
 * @returns Color with heartbeat pulse
 */
export function pulseHeartbeat(
  inputColor: TSLNode,
  time: TSLNode | FloatInput,
  speed: FloatInput = 1,
  intensity: FloatInput = 0.3
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Create heartbeat pattern: two quick pulses then pause
  const t = timeNode.mul(speedNode).mod(2)

  // First beat at t=0
  const beat1 = t.mul(8).sub(0.5).mul(-4).exp()
  // Second beat at t=0.3
  const beat2 = t.sub(0.3).mul(8).sub(0.5).mul(-4).exp()

  const pulse = beat1.add(beat2).clamp(0, 1).mul(intensityNode)
  const brightness = float(1).add(pulse)

  return vec4(inputColor.rgb.mul(brightness), inputColor.a)
}

/**
 * Radial pulse emanating from center.
 *
 * @param inputColor - Base color
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param center - Pulse center (default: [0.5, 0.5])
 * @param speed - Pulse speed
 * @param intensity - Pulse intensity
 * @param glowColor - Color of the pulse wave
 * @returns Color with radial pulse
 */
export function pulseRadial(
  inputColor: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  center: Vec2Input = [0.5, 0.5],
  speed: FloatInput = 1,
  intensity: FloatInput = 0.5,
  glowColor: Vec3Input = [1, 1, 1]
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const colorVec = Array.isArray(glowColor) ? vec3(...glowColor) : glowColor

  const centerVec = Array.isArray(center) ? vec2(float(center[0]), float(center[1])) : center

  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()

  // Expanding ring
  const ringPos = timeNode.mul(speedNode).mod(1)
  const ring = dist.sub(ringPos).abs()
  const ringIntensity = float(1).sub(ring.mul(10).clamp(0, 1)).mul(intensityNode)

  return vec4(inputColor.rgb.add(colorVec.mul(ringIntensity)), inputColor.a)
}

/**
 * Color cycling pulse effect.
 *
 * @param inputColor - Base color
 * @param time - Animation time
 * @param speed - Color cycle speed
 * @param saturation - Color saturation (default: 0.5)
 * @returns Color with cycling hue
 */
export function pulseRainbow(
  inputColor: TSLNode,
  time: TSLNode | FloatInput,
  speed: FloatInput = 0.5,
  saturation: FloatInput = 0.5
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed
  const satNode = typeof saturation === 'number' ? float(saturation) : saturation

  const hue = timeNode.mul(speedNode)

  const r = sin(hue.mul(6.28)).mul(0.5).add(0.5)
  const g = sin(hue.mul(6.28).add(2.094)).mul(0.5).add(0.5)
  const b = sin(hue.mul(6.28).add(4.189)).mul(0.5).add(0.5)

  const rainbow = vec3(r, g, b)
  const mixed = inputColor.rgb.mix(rainbow, satNode)

  return vec4(mixed, inputColor.a)
}
