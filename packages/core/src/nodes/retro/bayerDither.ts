import { vec4, float, floor, mod, int, select, positionLocal } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * 2x2 Bayer matrix normalized to 0-1 range.
 * Pattern: [0, 2]
 *          [3, 1] / 4
 */
function getBayer2x2(x: TSLNode, y: TSLNode): TSLNode {
  const ix = mod(x, int(2))
  const iy = mod(y, int(2))

  // Compute index: y * 2 + x
  const index = iy.mul(int(2)).add(ix)

  // Bayer 2x2 values: [0, 2, 3, 1] / 4
  return select(
    index.equal(int(0)),
    float(0 / 4),
    select(
      index.equal(int(1)),
      float(2 / 4),
      select(index.equal(int(2)), float(3 / 4), float(1 / 4))
    )
  )
}

/**
 * 4x4 Bayer matrix normalized to 0-1 range.
 */
function getBayer4x4(x: TSLNode, y: TSLNode): TSLNode {
  const ix = mod(x, int(4))
  const iy = mod(y, int(4))

  // Compute index: y * 4 + x
  const index = iy.mul(int(4)).add(ix)

  // 4x4 Bayer matrix values (normalized)
  // [ 0, 8, 2,10] / 16
  // [12, 4,14, 6] / 16
  // [ 3,11, 1, 9] / 16
  // [15, 7,13, 5] / 16
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

  // Build nested select chain for lookup
  let result: TSLNode = float(values[15])
  for (let i = 14; i >= 0; i--) {
    result = select(index.equal(int(i)), float(values[i]), result)
  }

  return result
}

/**
 * 8x8 Bayer matrix normalized to 0-1 range.
 */
function getBayer8x8(x: TSLNode, y: TSLNode): TSLNode {
  const ix = mod(x, int(8))
  const iy = mod(y, int(8))

  // Compute index: y * 8 + x
  const index = iy.mul(int(8)).add(ix)

  // 8x8 Bayer matrix values (normalized)
  const values = [
    0 / 64,
    32 / 64,
    8 / 64,
    40 / 64,
    2 / 64,
    34 / 64,
    10 / 64,
    42 / 64,
    48 / 64,
    16 / 64,
    56 / 64,
    24 / 64,
    50 / 64,
    18 / 64,
    58 / 64,
    26 / 64,
    12 / 64,
    44 / 64,
    4 / 64,
    36 / 64,
    14 / 64,
    46 / 64,
    6 / 64,
    38 / 64,
    60 / 64,
    28 / 64,
    52 / 64,
    20 / 64,
    62 / 64,
    30 / 64,
    54 / 64,
    22 / 64,
    3 / 64,
    35 / 64,
    11 / 64,
    43 / 64,
    1 / 64,
    33 / 64,
    9 / 64,
    41 / 64,
    51 / 64,
    19 / 64,
    59 / 64,
    27 / 64,
    49 / 64,
    17 / 64,
    57 / 64,
    25 / 64,
    15 / 64,
    47 / 64,
    7 / 64,
    39 / 64,
    13 / 64,
    45 / 64,
    5 / 64,
    37 / 64,
    63 / 64,
    31 / 64,
    55 / 64,
    23 / 64,
    61 / 64,
    29 / 64,
    53 / 64,
    21 / 64,
  ]

  // Build nested select chain for lookup
  let result: TSLNode = float(values[63])
  for (let i = 62; i >= 0; i--) {
    result = select(index.equal(int(i)), float(values[i]), result)
  }

  return result
}

/**
 * Apply 2x2 Bayer matrix ordered dithering.
 * Creates a coarse dither pattern - good for very low resolution retro effects.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param levels - Number of color levels per channel (default: 2 = binary)
 * @param scale - Scale of dither pattern (default: 1)
 * @param screenCoord - Screen coordinates (use UV * textureSize for per-sprite)
 * @returns Dithered color
 *
 * @example
 * // Binary dithering on sprite
 * bayerDither2x2(color, 2, 1, uv().mul(textureSize))
 */
export function bayerDither2x2(
  inputColor: TSLNode,
  levels: FloatInput = 2,
  scale: FloatInput = 1,
  screenCoord?: TSLNode
): TSLNode {
  const levelsNode = typeof levels === 'number' ? float(levels) : levels
  const scaleNode = typeof scale === 'number' ? float(scale) : scale

  // Default to positionLocal.xy if no coord provided
  const coord: TSLNode = screenCoord ?? positionLocal.xy
  const scaledCoord: TSLNode = coord.div(scaleNode)

  const x = floor(scaledCoord.x).toInt()
  const y = floor(scaledCoord.y).toInt()

  const threshold = getBayer2x2(x, y)

  // Apply dithering: add threshold offset before quantization
  const levelsMinusOne = levelsNode.sub(float(1))
  const ditheredRGB = floor(
    inputColor.rgb.mul(levelsMinusOne).add(threshold)
  ).div(levelsMinusOne)

  return vec4(ditheredRGB, inputColor.a)
}

/**
 * Apply 4x4 Bayer matrix ordered dithering.
 * Standard dither pattern - good balance of quality and retro aesthetic.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param levels - Number of color levels per channel (default: 2 = binary)
 * @param scale - Scale of dither pattern (default: 1)
 * @param screenCoord - Screen coordinates (use UV * textureSize for per-sprite)
 * @returns Dithered color
 *
 * @example
 * // 4-level dithering for retro look
 * bayerDither4x4(color, 4, 1, uv().mul(textureSize))
 */
export function bayerDither4x4(
  inputColor: TSLNode,
  levels: FloatInput = 2,
  scale: FloatInput = 1,
  screenCoord?: TSLNode
): TSLNode {
  const levelsNode = typeof levels === 'number' ? float(levels) : levels
  const scaleNode = typeof scale === 'number' ? float(scale) : scale

  // Default to positionLocal.xy if no coord provided
  const coord: TSLNode = screenCoord ?? positionLocal.xy
  const scaledCoord: TSLNode = coord.div(scaleNode)

  const x = floor(scaledCoord.x).toInt()
  const y = floor(scaledCoord.y).toInt()

  const threshold = getBayer4x4(x, y)

  const levelsMinusOne = levelsNode.sub(float(1))
  const ditheredRGB = floor(
    inputColor.rgb.mul(levelsMinusOne).add(threshold)
  ).div(levelsMinusOne)

  return vec4(ditheredRGB, inputColor.a)
}

/**
 * Apply 8x8 Bayer matrix ordered dithering.
 * Fine dither pattern - smoother gradients while maintaining retro feel.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param levels - Number of color levels per channel (default: 2 = binary)
 * @param scale - Scale of dither pattern (default: 1)
 * @param screenCoord - Screen coordinates (use UV * textureSize for per-sprite)
 * @returns Dithered color
 *
 * @example
 * // 8-level dithering for smoother retro effect
 * bayerDither8x8(color, 8, 1, uv().mul(textureSize))
 */
export function bayerDither8x8(
  inputColor: TSLNode,
  levels: FloatInput = 2,
  scale: FloatInput = 1,
  screenCoord?: TSLNode
): TSLNode {
  const levelsNode = typeof levels === 'number' ? float(levels) : levels
  const scaleNode = typeof scale === 'number' ? float(scale) : scale

  // Default to positionLocal.xy if no coord provided
  const coord: TSLNode = screenCoord ?? positionLocal.xy
  const scaledCoord: TSLNode = coord.div(scaleNode)

  const x = floor(scaledCoord.x).toInt()
  const y = floor(scaledCoord.y).toInt()

  const threshold = getBayer8x8(x, y)

  const levelsMinusOne = levelsNode.sub(float(1))
  const ditheredRGB = floor(
    inputColor.rgb.mul(levelsMinusOne).add(threshold)
  ).div(levelsMinusOne)

  return vec4(ditheredRGB, inputColor.a)
}

/**
 * Apply Bayer matrix ordered dithering (defaults to 4x4).
 * Alias for bayerDither4x4 as it's the most commonly used pattern.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param levels - Number of color levels per channel (default: 2 = binary)
 * @param scale - Scale of dither pattern (default: 1)
 * @param screenCoord - Screen coordinates (use UV * textureSize for per-sprite)
 * @returns Dithered color
 *
 * @example
 * // Binary dithering (2-color)
 * bayerDither(texture(tex, uv()), 2, 1, screenUV.mul(resolution))
 *
 * @example
 * // 4-level dithering for retro look
 * bayerDither(color, 4)
 */
export function bayerDither(
  inputColor: TSLNode,
  levels: FloatInput = 2,
  scale: FloatInput = 1,
  screenCoord?: TSLNode
): TSLNode {
  return bayerDither4x4(inputColor, levels, scale, screenCoord)
}
