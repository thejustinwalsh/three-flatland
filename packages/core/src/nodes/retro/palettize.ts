import { vec3, vec4, float, floor, mod, int, select, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput } from '../types'

// Standard luminance weights (Rec. 709)
const LUMA_R = 0.2126
const LUMA_G = 0.7152
const LUMA_B = 0.0722

/**
 * Map colors to nearest match in a palette texture.
 * Palette should be a 1D horizontal texture (Nx1 pixels).
 *
 * This function samples the palette by computing the luminance of the input color
 * and using it to index into the palette texture.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param paletteTex - Palette texture (horizontal strip)
 * @param strength - Effect strength (0 = original, 1 = fully palettized)
 * @returns Color snapped to palette
 *
 * @example
 * // Apply GameBoy palette
 * palettize(color, gbPaletteTexture)
 *
 * @example
 * // Partial palette effect
 * palettize(color, retroPalette, 0.5)
 */
export function palettize(
  inputColor: TSLNode,
  paletteTex: Texture,
  strength: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Calculate luminance
  const lumaWeights = vec3(LUMA_R, LUMA_G, LUMA_B)
  const luminance = inputColor.rgb.dot(lumaWeights)

  // Sample palette at luminance position (center of texture vertically)
  const paletteUV = vec3(luminance, float(0.5), float(0))
  const paletteColor = sampleTexture(paletteTex, paletteUV.xy)

  // Mix original with palettized based on strength
  const mixedRGB = inputColor.rgb.mix(paletteColor.rgb, strengthNode)

  return vec4(mixedRGB, inputColor.a)
}

/**
 * Get 4x4 Bayer threshold for dithering (internal helper).
 */
function getBayer4x4(x: TSLNode, y: TSLNode): TSLNode {
  const ix = mod(x, int(4))
  const iy = mod(y, int(4))
  const index = iy.mul(int(4)).add(ix)

  const values = [
    0 / 16,
    8 / 16,
    2 / 16,
    10 / 16,
    12 / 16,
    4 / 16,
    14 / 16,
    6 / 16,
    3 / 16,
    11 / 16,
    1 / 16,
    9 / 16,
    15 / 16,
    7 / 16,
    13 / 16,
    5 / 16,
  ]

  let result: TSLNode = float(values[15])
  for (let i = 14; i >= 0; i--) {
    result = select(index.equal(int(i)), float(values[i]), result)
  }

  return result
}

/**
 * Map colors to palette with dithering for smoother transitions.
 * Uses Bayer matrix dithering to blend between palette colors.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param paletteTex - Palette texture (horizontal strip)
 * @param paletteSize - Number of colors in palette
 * @param dither - Dither strength between palette colors (0-1, default: 0.5)
 * @param screenCoord - Screen coordinates for dithering pattern
 * @returns Color snapped to palette with dithering
 *
 * @example
 * // GameBoy 4-color palette with dithering
 * palettizeDithered(color, gbPalette, 4, 0.5, uv().mul(textureSize))
 *
 * @example
 * // C64 palette with strong dithering
 * palettizeDithered(color, c64Palette, 16, 0.8, screenCoord)
 */
export function palettizeDithered(
  inputColor: TSLNode,
  paletteTex: Texture,
  paletteSize: FloatInput,
  dither: FloatInput = 0.5,
  screenCoord?: TSLNode
): TSLNode {
  const paletteSizeNode = typeof paletteSize === 'number' ? float(paletteSize) : paletteSize
  const ditherNode = typeof dither === 'number' ? float(dither) : dither

  // Calculate luminance
  const lumaWeights = vec3(LUMA_R, LUMA_G, LUMA_B)
  const luminance = inputColor.rgb.dot(lumaWeights)

  // Get dither threshold
  const coord = screenCoord ?? float(0)
  const x = floor(coord.x ?? coord).toInt()
  const y = floor(coord.y ?? float(0)).toInt()
  const threshold = getBayer4x4(x, y)

  // Add dither offset to luminance (scaled by palette step size)
  const stepSize = float(1).div(paletteSizeNode.sub(float(1)))
  const ditherOffset = threshold.sub(float(0.5)).mul(stepSize).mul(ditherNode)
  const ditheredLuminance = luminance.add(ditherOffset).clamp(0, 1)

  // Sample palette at dithered position
  const paletteUV = vec3(ditheredLuminance, float(0.5), float(0))
  const paletteColor = sampleTexture(paletteTex, paletteUV.xy)

  return vec4(paletteColor.rgb, inputColor.a)
}

/**
 * Find nearest color in palette by comparing RGB distance.
 * More accurate than luminance-based but more expensive.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param paletteTex - Palette texture (horizontal strip)
 * @param paletteSize - Number of colors in palette (max 16)
 * @returns Color snapped to nearest palette color
 *
 * @example
 * // Find nearest color in 8-color palette
 * palettizeNearest(color, palette8, 8)
 */
export function palettizeNearest(
  inputColor: TSLNode,
  paletteTex: Texture,
  paletteSize: number
): TSLNode {
  // Limit to reasonable palette size to avoid massive shader
  const size = Math.min(paletteSize, 16)

  // Sample first palette color as initial best match
  let bestColor: TSLNode = sampleTexture(paletteTex, vec3(float(0.5 / size), float(0.5), float(0)).xy)
  let bestDiff = inputColor.rgb.sub(bestColor.rgb)
  let bestDist: TSLNode = bestDiff.dot(bestDiff)

  // Check each palette color
  for (let i = 1; i < size; i++) {
    const u = (i + 0.5) / size
    const sampleColor = sampleTexture(paletteTex, vec3(float(u), float(0.5), float(0)).xy)
    const diff = inputColor.rgb.sub(sampleColor.rgb)
    const dist = diff.dot(diff)

    // Update best if this is closer
    const isBetter = dist.lessThan(bestDist)
    bestColor = isBetter.select(sampleColor, bestColor) as TSLNode
    bestDist = isBetter.select(dist, bestDist) as TSLNode
  }

  return vec4(bestColor.rgb, inputColor.a)
}
