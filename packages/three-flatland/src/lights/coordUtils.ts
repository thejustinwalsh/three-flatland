import { vec2 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Convert world position to UV [0,1] space.
 * worldPos.sub(offset).div(size)
 */
export const worldToUV = (
  worldPos: Node<'vec2'>,
  occSize: Node<'vec2'>,
  occOffset: Node<'vec2'>
): Node<'vec2'> => {
  return vec2(worldPos).sub(occOffset).div(occSize)
}

/**
 * Convert UV [0,1] space to world position.
 * uv.mul(size).add(offset)
 */
export const uvToWorld = (
  uvPos: Node<'vec2'>,
  occSize: Node<'vec2'>,
  occOffset: Node<'vec2'>
): Node<'vec2'> => {
  return vec2(uvPos).mul(occSize).add(occOffset)
}
