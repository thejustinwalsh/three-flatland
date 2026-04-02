import { Color } from 'three'
import { colorToOklch, oklchToColor } from './conversions'

function rotateHue(h: number, degrees: number): number {
  return ((h + degrees) % 360 + 360) % 360
}

/** Generate the complementary color (180 degree hue shift in OKLCH). */
export function complementary(color: Color, target?: Color): Color {
  const lch = colorToOklch(color)
  return oklchToColor(lch.L, lch.C, rotateHue(lch.h, 180), target)
}

/** Generate analogous colors (base + adjacent hues, default +/- 30 degrees). */
export function analogous(color: Color, angle = 30): [Color, Color, Color] {
  const lch = colorToOklch(color)
  return [
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, -angle)),
    color.clone(),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, angle)),
  ]
}

/** Generate triadic colors (120 degree spacing). */
export function triadic(color: Color): [Color, Color, Color] {
  const lch = colorToOklch(color)
  return [
    color.clone(),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 120)),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 240)),
  ]
}

/** Generate split-complementary colors (150 and 210 degree offsets). */
export function splitComplementary(color: Color): [Color, Color, Color] {
  const lch = colorToOklch(color)
  return [
    color.clone(),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 150)),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 210)),
  ]
}

/** Generate tetradic/square colors (90 degree spacing). */
export function tetradic(color: Color): [Color, Color, Color, Color] {
  const lch = colorToOklch(color)
  return [
    color.clone(),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 90)),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 180)),
    oklchToColor(lch.L, lch.C, rotateHue(lch.h, 270)),
  ]
}
