import { vec3, vec4, float, floor } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

// DMG (Game Boy) green palette - 4 shades
const DMG_PALETTE = [
  [0.608, 0.737, 0.059], // Lightest (off-white/light green)
  [0.545, 0.675, 0.059], // Light
  [0.188, 0.384, 0.188], // Dark
  [0.059, 0.22, 0.059], // Darkest
]

// Game Boy Pocket palette - 4 gray shades
const POCKET_PALETTE = [
  [0.78, 0.82, 0.73], // Lightest
  [0.55, 0.6, 0.52], // Light
  [0.33, 0.38, 0.31], // Dark
  [0.11, 0.15, 0.09], // Darkest
]

// Virtual Boy palette - 4 red/black shades
const VB_PALETTE = [
  [1.0, 0.0, 0.0], // Brightest red
  [0.66, 0.0, 0.0], // Medium red
  [0.33, 0.0, 0.0], // Dark red
  [0.0, 0.0, 0.0], // Black
]

/**
 * Convert color to DMG Game Boy palette.
 * Uses the iconic green shades of the original DMG-01.
 *
 * @param inputColor - Input color (vec4)
 * @param contrast - Palette contrast adjustment (default: 1)
 * @returns Color mapped to DMG palette
 *
 * @example
 * const gameboy = dmgPalette(inputColor)
 */
export function dmgPalette(inputColor: TSLNode, contrast: FloatInput = 1): TSLNode {
  const contrastNode = typeof contrast === 'number' ? float(contrast) : contrast

  // Convert to grayscale
  const luma = inputColor.r.mul(0.299).add(inputColor.g.mul(0.587)).add(inputColor.b.mul(0.114))

  // Apply contrast
  const adjusted = luma.sub(0.5).mul(contrastNode).add(0.5).clamp(0, 1)

  // Quantize to 4 levels (0, 1, 2, 3)
  const level = floor(adjusted.mul(3.99)).clamp(0, 3)

  // Map to DMG colors using conditional selection
  const c0 = vec3(...DMG_PALETTE[0]!)
  const c1 = vec3(...DMG_PALETTE[1]!)
  const c2 = vec3(...DMG_PALETTE[2]!)
  const c3 = vec3(...DMG_PALETTE[3]!)

  const color = level
    .lessThan(1)
    .select(c3, level.lessThan(2).select(c2, level.lessThan(3).select(c1, c0)))

  return vec4(color, inputColor.a)
}

/**
 * Convert color to Game Boy Pocket palette.
 * Uses gray shades instead of green.
 *
 * @param inputColor - Input color
 * @param contrast - Contrast adjustment
 * @returns Color mapped to Pocket palette
 */
export function pocketPalette(inputColor: TSLNode, contrast: FloatInput = 1): TSLNode {
  const contrastNode = typeof contrast === 'number' ? float(contrast) : contrast

  const luma = inputColor.r.mul(0.299).add(inputColor.g.mul(0.587)).add(inputColor.b.mul(0.114))
  const adjusted = luma.sub(0.5).mul(contrastNode).add(0.5).clamp(0, 1)
  const level = floor(adjusted.mul(3.99)).clamp(0, 3)

  const c0 = vec3(...POCKET_PALETTE[0]!)
  const c1 = vec3(...POCKET_PALETTE[1]!)
  const c2 = vec3(...POCKET_PALETTE[2]!)
  const c3 = vec3(...POCKET_PALETTE[3]!)

  const color = level
    .lessThan(1)
    .select(c3, level.lessThan(2).select(c2, level.lessThan(3).select(c1, c0)))

  return vec4(color, inputColor.a)
}

/**
 * Convert color to NES/Famicom PPU palette (2C02).
 * Maps to the closest of 54 available colors.
 *
 * @param inputColor - Input color
 * @param saturation - Color saturation (default: 1)
 * @returns Color approximating NES PPU output
 */
export function ppuPalette(inputColor: TSLNode, saturation: FloatInput = 1): TSLNode {
  const satNode = typeof saturation === 'number' ? float(saturation) : saturation

  // NES PPU has 64 colors but only 54 are unique (some are duplicates/black)
  // We'll approximate by quantizing to the characteristic NES color space

  // Quantize each channel to NES-like levels
  // NES has roughly 4 brightness levels and 12 hue phases
  const r = floor(inputColor.r.mul(satNode).mul(3.99)).div(4)
  const g = floor(inputColor.g.mul(satNode).mul(3.99)).div(4)
  const b = floor(inputColor.b.mul(satNode).mul(3.99)).div(4)

  // NES colors have a slight warmth/vintage feel
  const warmR = r.mul(1.1).clamp(0, 1)
  const warmG = g.mul(0.95)
  const warmB = b.mul(0.9)

  return vec4(warmR, warmG, warmB, inputColor.a)
}

/**
 * Convert color to Sega Genesis/Mega Drive 9-bit palette.
 * VDP outputs 512 possible colors (3 bits per channel).
 *
 * @param inputColor - Input color
 * @returns Color quantized to 9-bit color space
 */
export function md9bitPalette(inputColor: TSLNode): TSLNode {
  // 3 bits per channel = 8 levels per channel = 512 colors
  const r = floor(inputColor.r.mul(7.99)).div(7)
  const g = floor(inputColor.g.mul(7.99)).div(7)
  const b = floor(inputColor.b.mul(7.99)).div(7)

  return vec4(r, g, b, inputColor.a)
}

/**
 * Convert color to Virtual Boy palette.
 * Red and black only, 4 shades.
 *
 * @param inputColor - Input color
 * @param contrast - Contrast adjustment
 * @returns Color mapped to Virtual Boy palette
 */
export function vbPalette(inputColor: TSLNode, contrast: FloatInput = 1): TSLNode {
  const contrastNode = typeof contrast === 'number' ? float(contrast) : contrast

  const luma = inputColor.r.mul(0.299).add(inputColor.g.mul(0.587)).add(inputColor.b.mul(0.114))
  const adjusted = luma.sub(0.5).mul(contrastNode).add(0.5).clamp(0, 1)
  const level = floor(adjusted.mul(3.99)).clamp(0, 3)

  const c0 = vec3(...VB_PALETTE[0]!)
  const c1 = vec3(...VB_PALETTE[1]!)
  const c2 = vec3(...VB_PALETTE[2]!)
  const c3 = vec3(...VB_PALETTE[3]!)

  const color = level
    .lessThan(1)
    .select(c3, level.lessThan(2).select(c2, level.lessThan(3).select(c1, c0)))

  return vec4(color, inputColor.a)
}

/**
 * Game Boy Color palette simulation.
 * 15-bit color (5 bits per channel) with GBC's characteristic color response.
 *
 * @param inputColor - Input color
 * @returns Color quantized to GBC palette
 */
export function gbcPalette(inputColor: TSLNode): TSLNode {
  // 5 bits per channel = 32 levels = 32768 colors
  const r = floor(inputColor.r.mul(31.99)).div(31)
  const g = floor(inputColor.g.mul(31.99)).div(31)
  const b = floor(inputColor.b.mul(31.99)).div(31)

  // GBC screen has slightly muted, warm colors
  const adjustedR = r.mul(0.95).add(0.02)
  const adjustedG = g.mul(0.92).add(0.03)
  const adjustedB = b.mul(0.88).add(0.02)

  return vec4(adjustedR, adjustedG, adjustedB, inputColor.a)
}

/**
 * SNES/Super Famicom 15-bit palette.
 *
 * @param inputColor - Input color
 * @returns Color quantized to SNES palette
 */
export function snesPalette(inputColor: TSLNode): TSLNode {
  // 5 bits per channel = 32 levels = 32768 colors
  const r = floor(inputColor.r.mul(31.99)).div(31)
  const g = floor(inputColor.g.mul(31.99)).div(31)
  const b = floor(inputColor.b.mul(31.99)).div(31)

  return vec4(r, g, b, inputColor.a)
}

/**
 * CGA 4-color palette (Mode 4, Palette 1).
 * Classic PC palette: black, cyan, magenta, white.
 *
 * @param inputColor - Input color
 * @returns Color mapped to CGA palette
 */
export function cgaPalette(inputColor: TSLNode): TSLNode {
  const luma = inputColor.r.mul(0.299).add(inputColor.g.mul(0.587)).add(inputColor.b.mul(0.114))
  const level = floor(luma.mul(3.99)).clamp(0, 3)

  // CGA Mode 4, Palette 1: Black, Cyan, Magenta, White
  const black = vec3(0, 0, 0)
  const cyan = vec3(0, 1, 1)
  const magenta = vec3(1, 0, 1)
  const white = vec3(1, 1, 1)

  const color = level
    .lessThan(1)
    .select(black, level.lessThan(2).select(cyan, level.lessThan(3).select(magenta, white)))

  return vec4(color, inputColor.a)
}

/**
 * Commodore 64 palette approximation.
 * 16 fixed colors with characteristic look.
 *
 * @param inputColor - Input color
 * @returns Color mapped to C64-like palette
 */
export function c64Palette(inputColor: TSLNode): TSLNode {
  // Quantize to approximate C64's 16 colors
  // Using luminance-based approach with color hints

  const luma = inputColor.r.mul(0.299).add(inputColor.g.mul(0.587)).add(inputColor.b.mul(0.114))

  // Determine dominant color channel
  const maxChannel = inputColor.r.max(inputColor.g).max(inputColor.b)
  const isRed = inputColor.r.greaterThanEqual(maxChannel.mul(0.9))
  const isGreen = inputColor.g.greaterThanEqual(maxChannel.mul(0.9))
  const isBlue = inputColor.b.greaterThanEqual(maxChannel.mul(0.9))

  // Quantize luminance to 4 levels
  const lumaLevel = floor(luma.mul(3.99)).div(4)

  // Create C64-ish colors based on dominant channel and brightness
  let r: TSLNode = lumaLevel
  let g: TSLNode = lumaLevel
  let b: TSLNode = lumaLevel

  // Tint based on dominant channel
  r = isRed.select(lumaLevel.add(0.3).clamp(0, 1), r)
  g = isGreen.select(lumaLevel.add(0.3).clamp(0, 1), g)
  b = isBlue.select(lumaLevel.add(0.3).clamp(0, 1), b)

  return vec4(r, g, b, inputColor.a)
}
