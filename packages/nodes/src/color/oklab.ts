import { vec3, vec4, float, mat3 } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

// --- Ottosson matrices ---

// M1: Linear sRGB -> LMS
const M1 = mat3(
  0.4122214708, 0.5363325363, 0.0514459929,
  0.2119034982, 0.6806995451, 0.1073969566,
  0.0883024619, 0.2817188376, 0.6299787005,
)

// M2: LMS' (cube-rooted) -> OKLAB
const M2 = mat3(
  0.2104542553, 0.7936177850, -0.0040720468,
  1.9779984951, -2.4285922050, 0.4505937099,
  0.0259040371, 0.7827717662, -0.8086757660,
)

// M1_INV: LMS -> Linear sRGB
const M1_INV = mat3(
  +4.0767416621, -3.3077115913, +0.2309699292,
  -1.2684380046, +2.6097574011, -0.3413193965,
  -0.0041960863, -0.7034186147, +1.7076147010,
)

// M2_INV: OKLAB -> LMS'
const M2_INV = mat3(
  1.0, +0.3963377774, +0.2158037573,
  1.0, -0.1055613458, -0.0638541728,
  1.0, -0.0894841775, -1.2914855480,
)

/** Safe cube root that handles negative values: sign(x) * pow(abs(x), 1/3). */
function cbrt(x: Node<'vec3'>): Node<'vec3'> {
  const third = vec3(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0)
  return x.sign().mul(x.abs().pow(third))
}

/** sRGB -> linear transfer function (per-channel). */
function srgbTransferIn(c: Node<'vec3'>): Node<'vec3'> {
  // Approximation: pow(c, 2.2)
  const gamma = vec3(2.2, 2.2, 2.2)
  return c.pow(gamma)
}

/** linear -> sRGB transfer function (per-channel). */
function srgbTransferOut(c: Node<'vec3'>): Node<'vec3'> {
  // Approximation: pow(c, 1/2.2)
  const invGamma = vec3(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2)
  return c.clamp(0, 1).pow(invGamma)
}

/**
 * Convert linear sRGB to OKLAB color space.
 * Input color should be in linear space (not gamma-encoded sRGB).
 *
 * @param inputColor - Linear RGB color (vec4, alpha preserved)
 * @returns vec4(L, a, b, alpha) where L is 0..1, a and b are roughly -0.5..0.5
 *
 * @example
 * // Convert linear color to OKLAB
 * linearRgbToOklab(someLinearColor)
 */
export function linearRgbToOklab(inputColor: Node<'vec4'>): Node<'vec4'> {
  const lms = M1.mul(inputColor.rgb)
  const lms_ = cbrt(lms)
  const lab = M2.mul(lms_)
  return vec4(lab, inputColor.a)
}

/**
 * Convert OKLAB to linear sRGB.
 *
 * @param lab - OKLAB color as vec4(L, a, b, alpha)
 * @returns Linear RGB color as vec4(r, g, b, alpha)
 *
 * @example
 * oklabToLinearRgb(oklabColor)
 */
export function oklabToLinearRgb(lab: Node<'vec4'>): Node<'vec4'> {
  const lms_ = M2_INV.mul(lab.rgb)
  const lms = lms_.mul(lms_).mul(lms_) // cube
  const rgb = M1_INV.mul(lms)
  return vec4(rgb, lab.a)
}

/**
 * Convert sRGB (gamma-encoded) color to OKLAB.
 * Applies sRGB->linear transfer function first.
 *
 * @param inputColor - sRGB color (vec4, alpha preserved)
 * @returns vec4(L, a, b, alpha)
 *
 * @example
 * rgbToOklab(texture(tex, uv()))
 */
export function rgbToOklab(inputColor: Node<'vec4'>): Node<'vec4'> {
  const linear = vec4(srgbTransferIn(inputColor.rgb), inputColor.a)
  return linearRgbToOklab(linear)
}

/**
 * Convert OKLAB to sRGB (gamma-encoded).
 * Applies linear->sRGB transfer function.
 *
 * @param lab - OKLAB color as vec4(L, a, b, alpha)
 * @returns sRGB color as vec4(r, g, b, alpha)
 *
 * @example
 * oklabToRgb(oklabColor)
 */
export function oklabToRgb(lab: Node<'vec4'>): Node<'vec4'> {
  const linear = oklabToLinearRgb(lab)
  return vec4(srgbTransferOut(linear.rgb), lab.a)
}
