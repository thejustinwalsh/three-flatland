import { vec4, float, mix, atan, cos, sin } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { FloatInput } from '../types'
import { rgbToOklab, oklabToRgb } from './oklab'

const TWO_PI = float(Math.PI * 2)

/**
 * Interpolate between two colors in OKLCH space on the GPU.
 * Handles hue wrapping (shortest path around the hue circle).
 *
 * @param colorA - First color (vec4, sRGB)
 * @param colorB - Second color (vec4, sRGB)
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated color (vec4, sRGB)
 *
 * @example
 * // Blend between two colors perceptually
 * oklchLerp(color1, color2, mixUniform)
 */
export function oklchLerp(
  colorA: Node<'vec4'>,
  colorB: Node<'vec4'>,
  t: FloatInput,
): Node<'vec4'> {
  const tNode = typeof t === 'number' ? float(t) : t

  const labA = rgbToOklab(colorA)
  const labB = rgbToOklab(colorB)

  // Convert to polar (LCH)
  const cA = labA.y.mul(labA.y).add(labA.z.mul(labA.z)).sqrt()
  const cB = labB.y.mul(labB.y).add(labB.z.mul(labB.z)).sqrt()
  const hA = atan(labA.z, labA.y)
  const hB = atan(labB.z, labB.y)

  // Shortest-path hue interpolation
  const rawDh = hB.sub(hA)
  const dh = rawDh.add(float(Math.PI)).mod(TWO_PI).sub(float(Math.PI))

  // Interpolate L, C, H
  const L = mix(labA.x, labB.x, tNode)
  const C = mix(cA, cB, tNode)
  const H = hA.add(dh.mul(tNode))

  // Convert back to OKLAB
  const a = C.mul(cos(H))
  const b = C.mul(sin(H))
  const alpha = mix(colorA.a, colorB.a, tNode)

  return oklabToRgb(vec4(L, a, b, alpha))
}

/**
 * Interpolate in OKLAB space (no polar hue).
 * Simpler and faster than OKLCH lerp, good for similar colors.
 *
 * @param colorA - First color (vec4, sRGB)
 * @param colorB - Second color (vec4, sRGB)
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated color (vec4, sRGB)
 *
 * @example
 * oklabLerp(color1, color2, 0.5)
 */
export function oklabLerp(
  colorA: Node<'vec4'>,
  colorB: Node<'vec4'>,
  t: FloatInput,
): Node<'vec4'> {
  const tNode = typeof t === 'number' ? float(t) : t

  const labA = rgbToOklab(colorA)
  const labB = rgbToOklab(colorB)

  const L = mix(labA.x, labB.x, tNode)
  const a = mix(labA.y, labB.y, tNode)
  const b = mix(labA.z, labB.z, tNode)
  const alpha = mix(colorA.a, colorB.a, tNode)

  return oklabToRgb(vec4(L, a, b, alpha))
}
