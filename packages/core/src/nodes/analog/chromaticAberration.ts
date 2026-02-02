import { vec2, vec4, float } from 'three/tsl'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Chromatic aberration effect - separates RGB channels.
 * Simulates lens imperfection or analog video artifacts.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param amount - Separation amount in UV space (default: 0.005)
 * @param angle - Separation angle in radians (default: 0 = horizontal)
 * @returns Color with chromatic aberration
 *
 * @example
 * const aberrated = chromaticAberration(texture, uv, 0.005)
 */
export function chromaticAberration(
  tex: TSLNode,
  uv: TSLNode,
  amount: FloatInput = 0.005,
  angle: FloatInput = 0
): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount
  const angleNode = typeof angle === 'number' ? float(angle) : angle

  // Direction of aberration
  const dir = vec2(angleNode.cos(), angleNode.sin())

  // Sample each channel at different offsets
  const r = tex.sample(uv.add(dir.mul(amountNode))).r
  const g = tex.sample(uv).g
  const b = tex.sample(uv.sub(dir.mul(amountNode))).b
  const a = tex.sample(uv).a

  return vec4(r, g, b, a)
}

/**
 * Radial chromatic aberration - increases toward edges.
 * More realistic lens distortion simulation.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param amount - Maximum aberration at edges
 * @param center - Center point of the effect
 * @returns Color with radial chromatic aberration
 */
export function chromaticAberrationRadial(
  tex: TSLNode,
  uv: TSLNode,
  amount: FloatInput = 0.01,
  center: Vec2Input = [0.5, 0.5]
): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount
  const centerVec = Array.isArray(center) ? vec2(...center) : center

  // Distance from center
  const toCenter = uv.sub(centerVec)
  const dist = toCenter.length()

  // Aberration increases with distance
  const scaledAmount = amountNode.mul(dist)

  // Direction is radial (from center)
  const dir = toCenter.normalize()

  const r = tex.sample(uv.add(dir.mul(scaledAmount))).r
  const g = tex.sample(uv).g
  const b = tex.sample(uv.sub(dir.mul(scaledAmount))).b
  const a = tex.sample(uv).a

  return vec4(r, g, b, a)
}

/**
 * Asymmetric chromatic aberration with separate RGB offsets.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param redOffset - Red channel offset
 * @param blueOffset - Blue channel offset
 * @returns Color with custom chromatic aberration
 */
export function chromaticAberrationCustom(
  tex: TSLNode,
  uv: TSLNode,
  redOffset: Vec2Input = [0.003, 0],
  blueOffset: Vec2Input = [-0.003, 0]
): TSLNode {
  const redVec = Array.isArray(redOffset) ? vec2(...redOffset) : redOffset
  const blueVec = Array.isArray(blueOffset) ? vec2(...blueOffset) : blueOffset

  const r = tex.sample(uv.add(redVec)).r
  const g = tex.sample(uv).g
  const b = tex.sample(uv.add(blueVec)).b
  const a = tex.sample(uv).a

  return vec4(r, g, b, a)
}

/**
 * Pulsing/animated chromatic aberration.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param time - Animation time
 * @param baseAmount - Base aberration amount
 * @param pulseAmount - Additional pulse amount
 * @param speed - Animation speed
 * @returns Animated chromatic aberration
 */
export function chromaticAberrationPulse(
  tex: TSLNode,
  uv: TSLNode,
  time: TSLNode | FloatInput,
  baseAmount: FloatInput = 0.002,
  pulseAmount: FloatInput = 0.003,
  speed: FloatInput = 2
): TSLNode {
  const timeNode = typeof time === 'number' ? float(time) : time
  const baseNode = typeof baseAmount === 'number' ? float(baseAmount) : baseAmount
  const pulseNode = typeof pulseAmount === 'number' ? float(pulseAmount) : pulseAmount
  const speedNode = typeof speed === 'number' ? float(speed) : speed

  const pulse = timeNode.mul(speedNode).sin().mul(0.5).add(0.5)
  const amount = baseNode.add(pulseNode.mul(pulse))

  return chromaticAberration(tex, uv, amount, 0)
}
