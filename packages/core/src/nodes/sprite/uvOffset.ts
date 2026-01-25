import { vec2 } from 'three/tsl'
import type { TSLNode, Vec2Input } from '../types'

/**
 * Offset UV coordinates by a given amount.
 *
 * @param inputUV - The UV coordinates to transform
 * @param offset - Offset amount as [x, y] or TSL node
 * @returns Offset UV coordinates
 *
 * @example
 * // Offset UV by 0.1 in both directions
 * uvOffset(uv(), [0.1, 0.1])
 *
 * @example
 * // Animate UV offset with uniform
 * uvOffset(uv(), offsetUniform)
 */
export function uvOffset(inputUV: TSLNode, offset: Vec2Input): TSLNode {
  const offsetVec = Array.isArray(offset) ? vec2(...offset) : offset

  return inputUV.add(offsetVec)
}
