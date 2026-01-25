import { vec2, float, select } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Flip UV coordinates horizontally and/or vertically.
 *
 * @param inputUV - The UV coordinates to transform
 * @param flipX - Whether to flip horizontally (true/1 = flip, false/0 = normal)
 * @param flipY - Whether to flip vertically (true/1 = flip, false/0 = normal)
 * @returns Flipped UV coordinates
 *
 * @example
 * // Flip horizontally
 * uvFlip(uv(), true, false)
 *
 * @example
 * // Flip based on uniform
 * uvFlip(uv(), flipXUniform, flipYUniform)
 */
export function uvFlip(
  inputUV: TSLNode,
  flipX: boolean | FloatInput = false,
  flipY: boolean | FloatInput = false
): TSLNode {
  // Convert boolean to number for TSL
  const flipXNode =
    typeof flipX === 'boolean' ? float(flipX ? 1 : 0) : typeof flipX === 'number' ? float(flipX) : flipX
  const flipYNode =
    typeof flipY === 'boolean' ? float(flipY ? 1 : 0) : typeof flipY === 'number' ? float(flipY) : flipY

  // When flip is 1, use 1 - uv; when 0, use uv
  const flippedX = select(
    flipXNode.greaterThan(float(0.5)),
    float(1).sub(inputUV.x),
    inputUV.x
  )
  const flippedY = select(
    flipYNode.greaterThan(float(0.5)),
    float(1).sub(inputUV.y),
    inputUV.y
  )

  return vec2(flippedX, flippedY)
}
