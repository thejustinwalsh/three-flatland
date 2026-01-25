import { vec4, float, cos, sin, mat3 } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Shift the hue of a color using a rotation matrix in RGB space.
 * This is more efficient than RGB->HSV->RGB conversion.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param angle - Hue shift angle in radians (0 to 2*PI for full cycle)
 * @returns Color with shifted hue
 *
 * @example
 * // Shift hue by 90 degrees
 * hueShift(texture(tex, uv()), Math.PI / 2)
 *
 * @example
 * // Animate rainbow effect
 * hueShift(texture(tex, uv()), timeUniform)
 */
export function hueShift(inputColor: TSLNode, angle: FloatInput): TSLNode {
  const angleNode = typeof angle === 'number' ? float(angle) : angle

  // Rodrigues' rotation formula for rotating around the (1,1,1) axis
  // This preserves luminance better than naive RGB rotation
  const cosA = cos(angleNode)
  const sinA = sin(angleNode)

  // Rotation matrix around (1,1,1) normalized axis
  // Based on: https://www.chilliant.com/rgb2hsv.html
  const k = float(1).div(float(3))
  const sqrt3 = float(1.732050808)

  // Matrix components
  const a = cosA.add(float(1).sub(cosA).mul(k))
  const b = k.mul(float(1).sub(cosA)).sub(sinA.div(sqrt3))
  const c = k.mul(float(1).sub(cosA)).add(sinA.div(sqrt3))

  // Build rotation matrix
  const rotMat = mat3(
    a, b, c,
    c, a, b,
    b, c, a
  )

  // Apply rotation
  const rotatedRGB = rotMat.mul(inputColor.rgb)

  return vec4(rotatedRGB, inputColor.a)
}

/**
 * Shift hue by a normalized amount (0-1 maps to 0-360 degrees).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param amount - Hue shift amount (0-1, wraps around)
 * @returns Color with shifted hue
 *
 * @example
 * // Shift hue by 25%
 * hueShiftNormalized(texture(tex, uv()), 0.25)
 */
export function hueShiftNormalized(inputColor: TSLNode, amount: FloatInput): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount
  const angle = amountNode.mul(float(Math.PI * 2))
  return hueShift(inputColor, angle)
}
