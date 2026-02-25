import { vec2, float, floor } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { Vec2Input, FloatInput } from '../types'

/**
 * Pixelate UV coordinates by snapping to a pixel grid.
 *
 * @param inputUV - The UV coordinates to transform
 * @param resolution - Pixel grid resolution as [width, height] or vec2 node
 * @param pivot - Center point for pixelation (default: [0.5, 0.5] = center)
 * @returns Pixelated UV coordinates (snapped to grid centers)
 *
 * @example
 * // Pixelate to 16x16 grid (centered)
 * pixelate(uv(), [16, 16])
 *
 * @example
 * // Animate pixelation with uniform (stays centered)
 * pixelate(uv(), resolutionUniform)
 *
 * @example
 * // Pixelate from top-left corner
 * pixelate(uv(), [16, 16], [0, 1])
 */
export function pixelate(inputUV: Node<'vec2'>, resolution: Vec2Input, pivot: Vec2Input = [0.5, 0.5]): Node<'vec2'> {
  const resVec = Array.isArray(resolution) ? vec2(...resolution) : resolution
  const pivotVec = Array.isArray(pivot) ? vec2(...pivot) : pivot

  // Offset UV so pivot is at origin, pixelate, then offset back
  const centered = inputUV.sub(pivotVec)
  const pixelUV = floor(centered.mul(resVec)).div(resVec)
  const halfPixel = float(0.5).div(resVec)

  return pixelUV.add(halfPixel).add(pivotVec)
}

/**
 * Pixelate UV coordinates with a single pixel size value.
 *
 * @param inputUV - The UV coordinates to transform
 * @param pixelSize - Size of pixels (higher = more pixelated)
 * @returns Pixelated UV coordinates
 *
 * @example
 * // Pixelate with 8 pixel size
 * pixelateBySize(uv(), 8)
 */
export function pixelateBySize(inputUV: Node<'vec2'>, pixelSize: FloatInput): Node<'vec2'> {
  const size = typeof pixelSize === 'number' ? float(pixelSize) : pixelSize

  // Convert pixel size to resolution (inverse relationship)
  const resolution = float(1).div(size)

  return pixelate(inputUV, vec2(resolution, resolution))
}
