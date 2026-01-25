import { vec2, float, cos, sin } from 'three/tsl'
import type { TSLNode, Vec2Input, FloatInput } from '../types'

/**
 * Rotate UV coordinates around a pivot point.
 *
 * @param inputUV - The UV coordinates to transform
 * @param angle - Rotation angle in radians (or TSL node)
 * @param pivot - Pivot point for rotation (default: [0.5, 0.5] = center)
 * @returns Rotated UV coordinates
 *
 * @example
 * // Rotate UV by 45 degrees around center
 * uvRotate(uv(), Math.PI / 4)
 *
 * @example
 * // Animate rotation with uniform
 * uvRotate(uv(), angleUniform, [0.5, 0.5])
 */
export function uvRotate(
  inputUV: TSLNode,
  angle: FloatInput,
  pivot: Vec2Input = [0.5, 0.5]
): TSLNode {
  const angleNode = typeof angle === 'number' ? float(angle) : angle
  const pivotVec = Array.isArray(pivot) ? vec2(...pivot) : pivot

  // Translate to pivot
  const centered = inputUV.sub(pivotVec)

  // Apply 2D rotation matrix
  const cosA = cos(angleNode)
  const sinA = sin(angleNode)

  const rotatedX = centered.x.mul(cosA).sub(centered.y.mul(sinA))
  const rotatedY = centered.x.mul(sinA).add(centered.y.mul(cosA))

  // Translate back from pivot
  return vec2(rotatedX, rotatedY).add(pivotVec)
}
