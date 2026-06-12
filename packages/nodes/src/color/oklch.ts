import { vec4, float, atan, cos, sin } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import type { FloatInput } from '../types'
import { linearRgbToOklab, oklabToLinearRgb, rgbToOklab, oklabToRgb } from './oklab'

const TWO_PI = float(Math.PI * 2)

/** Convert OKLAB vec4(L,a,b,alpha) to OKLCH vec4(L,C,H,alpha). H in radians. */
function oklabToOklchNode(lab: Node<'vec4'>): Node<'vec4'> {
  const L = lab.x
  const a = lab.y
  const b = lab.z
  const C = a.mul(a).add(b.mul(b)).sqrt()
  // atan2 returns [-PI, PI], wrap to [0, 2*PI]
  const rawH = atan(b, a)
  const H = rawH.add(TWO_PI).mod(TWO_PI)
  return vec4(L, C, H, lab.a)
}

/** Convert OKLCH vec4(L,C,H,alpha) to OKLAB vec4(L,a,b,alpha). H in radians. */
function oklchToOklabNode(lch: Node<'vec4'>): Node<'vec4'> {
  const L = lch.x
  const C = lch.y
  const H = lch.z
  const a = C.mul(cos(H))
  const b = C.mul(sin(H))
  return vec4(L, a, b, lch.a)
}

/**
 * Convert linear sRGB to OKLCH polar coordinates.
 *
 * @param inputColor - Linear RGB color (vec4, alpha preserved)
 * @returns vec4(L, C, H, alpha) where H is in radians (0 to 2*PI)
 *
 * @example
 * linearRgbToOklch(someLinearColor)
 */
export function linearRgbToOklch(inputColor: Node<'vec4'>): Node<'vec4'> {
  return oklabToOklchNode(linearRgbToOklab(inputColor))
}

/**
 * Convert OKLCH to linear sRGB.
 *
 * @param lch - OKLCH as vec4(L, C, H, alpha), H in radians
 * @returns Linear RGB color as vec4(r, g, b, alpha)
 *
 * @example
 * oklchToLinearRgb(oklchColor)
 */
export function oklchToLinearRgb(lch: Node<'vec4'>): Node<'vec4'> {
  return oklabToLinearRgb(oklchToOklabNode(lch))
}

/**
 * Convert sRGB to OKLCH.
 *
 * @param inputColor - sRGB color (vec4, alpha preserved)
 * @returns vec4(L, C, H, alpha), H in radians
 *
 * @example
 * rgbToOklch(texture(tex, uv()))
 */
export function rgbToOklch(inputColor: Node<'vec4'>): Node<'vec4'> {
  return oklabToOklchNode(rgbToOklab(inputColor))
}

/**
 * Convert OKLCH to sRGB.
 *
 * @param lch - OKLCH as vec4(L, C, H, alpha), H in radians
 * @returns sRGB color as vec4(r, g, b, alpha)
 *
 * @example
 * oklchToRgb(oklchColor)
 */
export function oklchToRgb(lch: Node<'vec4'>): Node<'vec4'> {
  return oklabToRgb(oklchToOklabNode(lch))
}

/**
 * Perceptually uniform hue shift using OKLCH.
 * Unlike the Rodrigues rotation in hueShift(), this operates in a perceptually
 * uniform space and produces visually equal hue steps.
 *
 * @param inputColor - Input color (vec4 with alpha, sRGB)
 * @param angle - Hue shift angle in radians
 * @returns Color with shifted hue (sRGB)
 *
 * @example
 * // Shift hue by 90 degrees in perceptually uniform space
 * oklchHueShift(texture(tex, uv()), Math.PI / 2)
 */
export function oklchHueShift(inputColor: Node<'vec4'>, angle: FloatInput): Node<'vec4'> {
  const angleNode = typeof angle === 'number' ? float(angle) : angle
  const lch = rgbToOklch(inputColor)
  const shifted = vec4(lch.x, lch.y, lch.z.add(angleNode), lch.a)
  return oklchToRgb(shifted)
}

/**
 * Adjust chroma (saturation) in OKLCH space.
 * Perceptually uniform saturation adjustment.
 *
 * @param inputColor - Input color (vec4 with alpha, sRGB)
 * @param amount - Chroma multiplier (0 = grayscale, 1 = original, >1 = more saturated)
 * @returns Color with adjusted chroma (sRGB)
 *
 * @example
 * // Desaturate to grayscale
 * oklchSaturate(texture(tex, uv()), 0)
 *
 * @example
 * // Boost saturation by 50%
 * oklchSaturate(texture(tex, uv()), 1.5)
 */
export function oklchSaturate(inputColor: Node<'vec4'>, amount: FloatInput): Node<'vec4'> {
  const amountNode = typeof amount === 'number' ? float(amount) : amount
  const lch = rgbToOklch(inputColor)
  const adjusted = vec4(lch.x, lch.y.mul(amountNode), lch.z, lch.a)
  return oklchToRgb(adjusted)
}

/**
 * Adjust lightness in OKLCH space.
 * Perceptually uniform lightness adjustment.
 *
 * @param inputColor - Input color (vec4 with alpha, sRGB)
 * @param amount - Lightness offset (-1 to 1, 0 = no change)
 * @returns Color with adjusted lightness (sRGB)
 *
 * @example
 * // Brighten in perceptually uniform space
 * oklchLightness(texture(tex, uv()), 0.2)
 */
export function oklchLightness(inputColor: Node<'vec4'>, amount: FloatInput): Node<'vec4'> {
  const amountNode = typeof amount === 'number' ? float(amount) : amount
  const lch = rgbToOklch(inputColor)
  const adjusted = vec4(lch.x.add(amountNode), lch.y, lch.z, lch.a)
  return oklchToRgb(adjusted)
}
