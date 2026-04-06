import { uint, shiftRight, bitOr } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

/**
 * Calculate root eligibility code from the signs of three control point Y coordinates.
 *
 * Uses the 3 sign bits as a 3-bit index into the lookup table 0x2E74.
 * Returns a value where:
 *   - Bit 0: first root (t1) contributes to winding number
 *   - Bit 8: second root (t2) contributes to winding number
 *
 * Must be called inside a Fn() TSL context.
 *
 * @see https://github.com/EricLengyel/Slug
 */
export function calcRootCode(
  y1: Node<'float'>,
  y2: Node<'float'>,
  y3: Node<'float'>,
) {
  const s1 = uint(y1.lessThan(0.0))
  const s2 = uint(y2.lessThan(0.0))
  const s3 = uint(y3.lessThan(0.0))

  const shift = bitOr(bitOr(s1, s2.shiftLeft(uint(1))), s3.shiftLeft(uint(2)))

  return shiftRight(uint(0x2E74), shift).bitAnd(uint(0x0101))
}
