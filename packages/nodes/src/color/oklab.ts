import { vec4, mat3, cbrt, Fn, sRGBTransferEOTF, sRGBTransferOETF } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'

// --- Ottosson matrices ---

// M1: Linear sRGB -> LMS
const M1 = mat3(
  0.4122214708,
  0.5363325363,
  0.0514459929,
  0.2119034982,
  0.6806995451,
  0.1073969566,
  0.0883024619,
  0.2817188376,
  0.6299787005
)

// M2: LMS' (cube-rooted) -> OKLAB
const M2 = mat3(
  0.2104542553,
  0.793617785,
  -0.0040720468,
  1.9779984951,
  -2.428592205,
  0.4505937099,
  0.0259040371,
  0.7827717662,
  -0.808675766
)

// M1_INV: LMS -> Linear sRGB
const M1_INV = mat3(
  +4.0767416621,
  -3.3077115913,
  +0.2309699292,
  -1.2684380046,
  +2.6097574011,
  -0.3413193965,
  -0.0041960863,
  -0.7034186147,
  +1.707614701
)

// M2_INV: OKLAB -> LMS'
const M2_INV = mat3(
  1.0,
  +0.3963377774,
  +0.2158037573,
  1.0,
  -0.1055613458,
  -0.0638541728,
  1.0,
  -0.0894841775,
  -1.291485548
)

/**
 * Element-wise cube root via three's `cbrt` (`sign(x) * pow(abs(x), 1/3)`).
 * `@types/three` types `cbrt` scalar-only, but the runtime is component-wise;
 * the narrow cast adapts the typed surface without changing emitted shader math.
 */
const cbrt3 = (v: Node<'vec3'>): Node<'vec3'> => cbrt(v as unknown as Node<'float'>) as unknown as Node<'vec3'>

// --- Shared conversion cores (Fn so repeated calls emit shader fn invocations) ---

/**
 * `@types/three` omits Fn's array-inputs overload under some module
 * resolutions (the examples' `source`-condition path only sees the
 * object-inputs form); the runtime supports array destructure. Single
 * adapter cast, same pattern as `cbrt3` above.
 */
const fnVec3 = Fn as unknown as (cb: (args: [Node<'vec3'>]) => Node<'vec3'>) => (v: Node<'vec3'>) => Node<'vec3'>

/** Linear sRGB rgb -> OKLAB lab (vec3 core). */
const linearToOklabCore = fnVec3(([rgb]) => {
  const lms = M1.mul(rgb)
  const lms_ = cbrt3(lms)
  return M2.mul(lms_)
})

/** OKLAB lab -> linear sRGB rgb (vec3 core). */
const oklabToLinearCore = fnVec3(([lab]) => {
  const lms_ = M2_INV.mul(lab)
  const lms = lms_.mul(lms_).mul(lms_) // cube
  return M1_INV.mul(lms)
})

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
  return vec4(linearToOklabCore(inputColor.rgb), inputColor.a)
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
  return vec4(oklabToLinearCore(lab.rgb), lab.a)
}

/**
 * Convert sRGB (gamma-encoded) color to OKLAB.
 * Applies the exact IEC 61966-2-1 sRGB->linear transfer (`sRGBTransferEOTF`)
 * first. Input rgb is clamped to [0,1] — display sRGB is bounded by definition
 * and this avoids pow-on-negative undefined behavior.
 *
 * @param inputColor - sRGB color (vec4, alpha preserved)
 * @returns vec4(L, a, b, alpha)
 *
 * @example
 * rgbToOklab(texture(tex, uv()))
 */
export function rgbToOklab(inputColor: Node<'vec4'>): Node<'vec4'> {
  const linear = sRGBTransferEOTF(inputColor.rgb.clamp(0, 1)) as Node<'vec3'>
  return vec4(linearToOklabCore(linear), inputColor.a)
}

/**
 * Convert OKLAB to sRGB (gamma-encoded).
 * Applies the exact IEC 61966-2-1 linear->sRGB transfer (`sRGBTransferOETF`),
 * clamping the linear result to [0,1] first.
 *
 * @param lab - OKLAB color as vec4(L, a, b, alpha)
 * @returns sRGB color as vec4(r, g, b, alpha)
 *
 * @example
 * oklabToRgb(oklabColor)
 */
export function oklabToRgb(lab: Node<'vec4'>): Node<'vec4'> {
  const linear = oklabToLinearCore(lab.rgb)
  const srgb = sRGBTransferOETF(linear.clamp(0, 1)) as Node<'vec3'>
  return vec4(srgb, lab.a)
}
