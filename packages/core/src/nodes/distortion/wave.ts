import { vec2, float, sin, cos } from 'three/tsl'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Apply horizontal wave distortion to UV coordinates.
 * Creates a wavy effect like looking through water or heat haze.
 *
 * @param uv - Input UV coordinates
 * @param amplitude - Wave amplitude in UV space (default: 0.02)
 * @param frequency - Wave frequency (default: 10)
 * @param time - Animation time for moving waves
 * @param speed - Animation speed multiplier (default: 1)
 * @returns Distorted UV coordinates
 *
 * @example
 * const distortedUV = waveHorizontal(uv, 0.02, 10, time)
 * const color = texture(tex, distortedUV)
 */
export function waveHorizontal(
  uv: TSLNode,
  amplitude: FloatInput = 0.02,
  frequency: FloatInput = 10,
  time: TSLNode | FloatInput = 0,
  speed: FloatInput = 1
): TSLNode {
  const ampNode = typeof amplitude === 'number' ? float(amplitude) : amplitude
  const freqNode = typeof frequency === 'number' ? float(frequency) : frequency
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  // Horizontal offset based on Y coordinate
  const offset = sin(uv.y.mul(freqNode).add(timeNode.mul(speedNode))).mul(ampNode)

  return vec2(uv.x.add(offset), uv.y)
}

/**
 * Apply vertical wave distortion to UV coordinates.
 *
 * @param uv - Input UV coordinates
 * @param amplitude - Wave amplitude in UV space
 * @param frequency - Wave frequency
 * @param time - Animation time
 * @param speed - Animation speed multiplier
 * @returns Distorted UV coordinates
 */
export function waveVertical(
  uv: TSLNode,
  amplitude: FloatInput = 0.02,
  frequency: FloatInput = 10,
  time: TSLNode | FloatInput = 0,
  speed: FloatInput = 1
): TSLNode {
  const ampNode = typeof amplitude === 'number' ? float(amplitude) : amplitude
  const freqNode = typeof frequency === 'number' ? float(frequency) : frequency
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  // Vertical offset based on X coordinate
  const offset = sin(uv.x.mul(freqNode).add(timeNode.mul(speedNode))).mul(ampNode)

  return vec2(uv.x, uv.y.add(offset))
}

/**
 * Apply radial wave distortion emanating from center.
 * Creates a pulsing distortion effect.
 *
 * @param uv - Input UV coordinates
 * @param center - Center point of the wave effect (default: [0.5, 0.5])
 * @param amplitude - Wave amplitude
 * @param frequency - Wave frequency
 * @param time - Animation time
 * @param speed - Animation speed
 * @returns Distorted UV coordinates
 *
 * @example
 * const distortedUV = waveRadial(uv, [0.5, 0.5], 0.03, 15, time)
 */
export function waveRadial(
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  amplitude: FloatInput = 0.02,
  frequency: FloatInput = 10,
  time: TSLNode | FloatInput = 0,
  speed: FloatInput = 1
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const ampNode = typeof amplitude === 'number' ? float(amplitude) : amplitude
  const freqNode = typeof frequency === 'number' ? float(frequency) : frequency
  const timeNode = typeof time === 'number' ? float(time) : time
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  // Direction from center
  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()
  const dir = toCenter.normalize()

  // Radial wave offset
  const offset = sin(dist.mul(freqNode).sub(timeNode.mul(speedNode))).mul(ampNode)

  return uv.add(dir.mul(offset))
}

/**
 * Apply ripple distortion from a point (like a droplet in water).
 * Creates expanding circular waves that fade with distance.
 *
 * @param uv - Input UV coordinates
 * @param center - Center point of the ripple
 * @param amplitude - Wave amplitude
 * @param frequency - Wave frequency
 * @param time - Animation time (controls ripple expansion)
 * @param decay - How quickly ripples fade with distance (default: 2)
 * @param speed - Animation speed
 * @returns Distorted UV coordinates
 *
 * @example
 * // Ripple from click position
 * const distortedUV = waveRipple(uv, clickPos, 0.05, 20, time, 3)
 */
export function waveRipple(
  uv: TSLNode,
  center: Vec2Input = [0.5, 0.5],
  amplitude: FloatInput = 0.03,
  frequency: FloatInput = 20,
  time: TSLNode | FloatInput = 0,
  decay: FloatInput = 2,
  speed: FloatInput = 1
): TSLNode {
  const centerVec = Array.isArray(center) ? vec2(...center) : center
  const ampNode = typeof amplitude === 'number' ? float(amplitude) : amplitude
  const freqNode = typeof frequency === 'number' ? float(frequency) : frequency
  const timeNode = typeof time === 'number' ? float(time) : time
  const decayNode = typeof decay === 'number' ? float(decay) : decay
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()
  const dir = toCenter.normalize()

  // Expanding wave with decay
  const wave = sin(dist.mul(freqNode).sub(timeNode.mul(speedNode)))
  const fadeout = float(1).div(float(1).add(dist.mul(decayNode)))
  const offset = wave.mul(ampNode).mul(fadeout)

  return uv.add(dir.mul(offset))
}

/**
 * Combine multiple wave effects for complex water-like distortion.
 *
 * @param uv - Input UV coordinates
 * @param amplitude - Overall amplitude
 * @param time - Animation time
 * @returns Complex wave-distorted UV coordinates
 */
export function waveWater(
  uv: TSLNode,
  amplitude: FloatInput = 0.01,
  time: TSLNode | FloatInput = 0
): TSLNode {
  const ampNode = typeof amplitude === 'number' ? float(amplitude) : amplitude
  const timeNode = typeof time === 'number' ? float(time) : time

  // Combine multiple wave frequencies for organic look
  const offsetX = sin(uv.y.mul(8).add(timeNode))
    .add(sin(uv.y.mul(15).add(timeNode.mul(1.3))))
    .mul(ampNode.mul(0.5))

  const offsetY = cos(uv.x.mul(10).add(timeNode.mul(0.8)))
    .add(cos(uv.x.mul(18).add(timeNode.mul(1.1))))
    .mul(ampNode.mul(0.5))

  return vec2(uv.x.add(offsetX), uv.y.add(offsetY))
}
