import { vec4, float, If, Discard } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Discard pixels with alpha below a threshold.
 * Useful for hard-edged transparency (pixel art, text).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param threshold - Alpha threshold (pixels below this are discarded)
 * @returns Color unchanged, or discarded if below threshold
 *
 * @example
 * // Discard nearly transparent pixels
 * alphaTest(texture(tex, uv()), 0.5)
 *
 * @example
 * // Animated alpha cutoff
 * alphaTest(texture(tex, uv()), thresholdUniform)
 */
export function alphaTest(inputColor: TSLNode, threshold: FloatInput): TSLNode {
  const thresholdNode = typeof threshold === 'number' ? float(threshold) : threshold

  If(inputColor.a.lessThan(thresholdNode), () => {
    Discard()
  })

  return inputColor
}

/**
 * Discard pixels with alpha below threshold and set remaining alpha to 1.
 * Creates a hard mask effect.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param threshold - Alpha threshold
 * @returns Opaque color if above threshold, discarded otherwise
 */
export function alphaTestOpaque(inputColor: TSLNode, threshold: FloatInput): TSLNode {
  const thresholdNode = typeof threshold === 'number' ? float(threshold) : threshold

  If(inputColor.a.lessThan(thresholdNode), () => {
    Discard()
  })

  return vec4(inputColor.rgb, float(1))
}
