import { vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput } from '../types'

/**
 * Multiply alpha by a mask texture's value.
 * The mask texture's red channel (or luminance) is used as the mask value.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param maskTex - Mask texture (uses red channel)
 * @param maskUV - UV coordinates for mask sampling
 * @param strength - Mask strength (0 = no mask, 1 = full mask)
 * @returns Color with masked alpha
 *
 * @example
 * // Apply mask texture
 * alphaMask(texture(tex, uv()), maskTexture, uv())
 *
 * @example
 * // Partial mask effect
 * alphaMask(texture(tex, uv()), maskTexture, uv(), 0.5)
 */
export function alphaMask(
  inputColor: TSLNode,
  maskTex: Texture,
  maskUV: TSLNode,
  strength: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Sample mask texture (use red channel)
  const maskValue = sampleTexture(maskTex, maskUV).r

  // Interpolate between original alpha and masked alpha
  const maskedAlpha = inputColor.a.mul(maskValue)
  const finalAlpha = inputColor.a.mix(maskedAlpha, strengthNode)

  return vec4(inputColor.rgb, finalAlpha)
}

/**
 * Multiply alpha by a mask value (single float instead of texture).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param mask - Mask value (0-1)
 * @returns Color with masked alpha
 *
 * @example
 * // Fade sprite by 50%
 * alphaMaskValue(texture(tex, uv()), 0.5)
 */
export function alphaMaskValue(inputColor: TSLNode, mask: FloatInput): TSLNode {
  const maskNode = typeof mask === 'number' ? float(mask) : mask

  return vec4(inputColor.rgb, inputColor.a.mul(maskNode))
}

/**
 * Invert mask and apply to alpha (areas with high mask value become transparent).
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param maskTex - Mask texture (uses red channel, inverted)
 * @param maskUV - UV coordinates for mask sampling
 * @param strength - Mask strength
 * @returns Color with inverted mask applied to alpha
 */
export function alphaMaskInvert(
  inputColor: TSLNode,
  maskTex: Texture,
  maskUV: TSLNode,
  strength: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Sample mask texture and invert
  const maskValue = float(1).sub(sampleTexture(maskTex, maskUV).r)

  // Interpolate between original alpha and masked alpha
  const maskedAlpha = inputColor.a.mul(maskValue)
  const finalAlpha = inputColor.a.mix(maskedAlpha, strengthNode)

  return vec4(inputColor.rgb, finalAlpha)
}
