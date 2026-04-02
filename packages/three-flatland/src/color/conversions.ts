import { Color } from 'three'

/** OKLAB color: L (0..1 lightness), a (~-0.5..0.5 green-red), b (~-0.5..0.5 blue-yellow) */
export interface Oklab {
  L: number
  a: number
  b: number
}

/** OKLCH color: L (0..1 lightness), C (0..~0.37 chroma), h (0..360 hue degrees) */
export interface Oklch {
  L: number
  C: number
  h: number
}

// --- sRGB transfer functions ---

/** Convert a single sRGB gamma-encoded component to linear. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Convert a single linear component to sRGB gamma-encoded. */
export function linearToSrgb(c: number): number {
  return c >= 0.0031308
    ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    : 12.92 * c
}

// --- Linear RGB <-> OKLAB ---

/** Convert linear sRGB to OKLAB using Ottosson matrices. */
export function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  // Linear RGB -> LMS
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  // Cube root
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  // LMS' -> OKLAB
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  }
}

/** Convert OKLAB to linear sRGB using inverse Ottosson matrices. */
export function oklabToLinearRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  // OKLAB -> LMS'
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b

  // Cube
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  // LMS -> Linear RGB
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  }
}

// --- OKLAB <-> OKLCH ---

const DEG = 180 / Math.PI
const RAD = Math.PI / 180

/** Convert OKLAB (cartesian) to OKLCH (polar). Hue in degrees 0..360. */
export function oklabToOklch(L: number, a: number, b: number): Oklch {
  const C = Math.sqrt(a * a + b * b)
  let h = Math.atan2(b, a) * DEG
  if (h < 0) h += 360
  return { L, C, h }
}

/** Convert OKLCH (polar) to OKLAB (cartesian). Hue in degrees. */
export function oklchToOklab(L: number, C: number, h: number): Oklab {
  const hRad = h * RAD
  return {
    L,
    a: C * Math.cos(hRad),
    b: C * Math.sin(hRad),
  }
}

// --- High-level: Three.js Color wrappers ---

/** Convert a Three.js Color (sRGB) to OKLAB. */
export function colorToOklab(color: Color): Oklab {
  return linearRgbToOklab(
    srgbToLinear(color.r),
    srgbToLinear(color.g),
    srgbToLinear(color.b),
  )
}

/** Convert a Three.js Color (sRGB) to OKLCH. */
export function colorToOklch(color: Color): Oklch {
  const lab = colorToOklab(color)
  return oklabToOklch(lab.L, lab.a, lab.b)
}

/** Convert OKLAB to a Three.js Color (sRGB). Clamps to 0..1. */
export function oklabToColor(L: number, a: number, b: number, target?: Color): Color {
  const rgb = oklabToLinearRgb(L, a, b)
  const out = target ?? new Color()
  return out.setRGB(
    Math.max(0, Math.min(1, linearToSrgb(rgb.r))),
    Math.max(0, Math.min(1, linearToSrgb(rgb.g))),
    Math.max(0, Math.min(1, linearToSrgb(rgb.b))),
  )
}

/** Convert OKLCH to a Three.js Color (sRGB). Hue in degrees. Clamps to 0..1. */
export function oklchToColor(L: number, C: number, h: number, target?: Color): Color {
  const lab = oklchToOklab(L, C, h)
  return oklabToColor(lab.L, lab.a, lab.b, target)
}
