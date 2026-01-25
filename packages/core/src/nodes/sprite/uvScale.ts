import { vec2 } from 'three/tsl'
import type { TSLNode, Vec2Input } from '../types'

/**
 * Scale UV coordinates around a pivot point.
 *
 * @param inputUV - The UV coordinates to transform
 * @param scale - Scale factor as [x, y] or TSL node
 * @param pivot - Pivot point for scaling (default: [0.5, 0.5] = center)
 * @returns Scaled UV coordinates
 *
 * @example
 * // Scale UV by 2x around center
 * uvScale(uv(), [2, 2])
 *
 * @example
 * // Scale with uniform for animation
 * uvScale(uv(), scaleUniform, [0.5, 0.5])
 */
export function uvScale(
  inputUV: TSLNode,
  scale: Vec2Input,
  pivot: Vec2Input = [0.5, 0.5]
): TSLNode {
  const scaleVec = Array.isArray(scale) ? vec2(...scale) : scale
  const pivotVec = Array.isArray(pivot) ? vec2(...pivot) : pivot

  // Transform: (uv - pivot) * scale + pivot
  return inputUV.sub(pivotVec).mul(scaleVec).add(pivotVec)
}
