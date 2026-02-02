import { vec2, vec3, vec4, float, floor, mod } from 'three/tsl'
import type { TSLNode, FloatInput, Vec3Input } from '../types'

/**
 * LCD pixel grid effect.
 * Simulates the visible pixel structure of LCD/TFT displays like GBA.
 *
 * @param inputColor - Input color (vec4)
 * @param uv - UV coordinates
 * @param resolution - Display resolution (default: 240 for GBA)
 * @param gridIntensity - Grid line darkness (default: 0.15)
 * @param subpixelIntensity - Subpixel structure visibility (default: 0.1)
 * @returns Color with LCD grid effect
 *
 * @example
 * const gba = lcdGrid(inputColor, uv, 240, 0.15)
 */
export function lcdGrid(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 240,
  gridIntensity: FloatInput = 0.15,
  subpixelIntensity: FloatInput = 0.1
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const gridNode = typeof gridIntensity === 'number' ? float(gridIntensity) : gridIntensity
  const subpixelNode = typeof subpixelIntensity === 'number' ? float(subpixelIntensity) : subpixelIntensity

  // Position within pixel
  const pixelPos = uv.mul(resNode).fract()

  // Grid lines (thin dark lines between pixels)
  const gridX = pixelPos.x.lessThan(0.1).or(pixelPos.x.greaterThan(0.9))
  const gridY = pixelPos.y.lessThan(0.1).or(pixelPos.y.greaterThan(0.9))
  const isGrid = gridX.or(gridY)
  const gridDarken = isGrid.select(float(1).sub(gridNode), float(1))

  // Subpixel structure (vertical RGB stripes within each pixel)
  const subCol = mod(floor(pixelPos.x.mul(3)), float(3))
  const isRSub = subCol.lessThan(1)
  const isGSub = subCol.greaterThanEqual(1).and(subCol.lessThan(2))
  const isBSub = subCol.greaterThanEqual(2)

  const reduce = float(1).sub(subpixelNode)
  const subR = isRSub.select(float(1), reduce)
  const subG = isGSub.select(float(1), reduce)
  const subB = isBSub.select(float(1), reduce)

  const color = vec3(
    inputColor.r.mul(subR),
    inputColor.g.mul(subG),
    inputColor.b.mul(subB)
  ).mul(gridDarken)

  return vec4(color, inputColor.a)
}

/**
 * Game Boy DMG-style dot matrix display.
 * Simulates the distinctive square-pixel LCD look of the original Game Boy.
 *
 * When input is a TextureNode (has .sample()), it pixelates by snapping UVs
 * to pixel centers. When input is a computed color, applies pixel grid only.
 *
 * Pixel edges are slightly soft to simulate the slow LCD crystal response
 * time characteristic of Game Boy hardware.
 *
 * @param input - Input color (TSLNode) or texture node (for pixelated sampling)
 * @param uv - UV coordinates
 * @param resolution - Pixel resolution (default: 160 for GB)
 * @param pixelFill - Fill ratio of pixel within cell (default: 0.85)
 * @param backgroundColor - Color of LCD background between pixels
 * @returns Color with dot matrix effect
 */
export function dotMatrix(
  input: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 160,
  pixelFill: FloatInput = 0.85,
  backgroundColor: Vec3Input = [0.6, 0.7, 0.4]
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const fillNode = typeof pixelFill === 'number' ? float(pixelFill) : pixelFill
  const bgVec = Array.isArray(backgroundColor) ? vec3(...backgroundColor) : backgroundColor

  // Pixelate: snap UV to nearest pixel center for blocky look
  const pixelatedUV = floor(uv.mul(resNode)).add(0.5).div(resNode)

  // Get the input color — if input supports .sample(), pixelate by snapping UVs
  const inputColor = typeof input.sample === 'function'
    ? input.sample(pixelatedUV)
    : input

  // Position within each pixel cell (0 to 1)
  const pixelPos = uv.mul(resNode).fract()

  // Square pixel with gap between cells
  // fillNode controls how much of the cell the pixel occupies (0.85 = 85%)
  const halfGap = float(1).sub(fillNode).mul(0.5)
  const upperEdge = float(1).sub(halfGap)

  // Soft edges simulate slow LCD crystal response time
  const soft = float(0.06)
  const maskX = pixelPos.x.smoothstep(halfGap.sub(soft), halfGap.add(soft))
    .mul(float(1).sub(pixelPos.x.smoothstep(upperEdge.sub(soft), upperEdge.add(soft))))
  const maskY = pixelPos.y.smoothstep(halfGap.sub(soft), halfGap.add(soft))
    .mul(float(1).sub(pixelPos.y.smoothstep(upperEdge.sub(soft), upperEdge.add(soft))))
  const inPixel = maskX.mul(maskY)

  // Mix between background and pixel color
  const pixelColor = bgVec.mix(inputColor.rgb, inPixel)

  return vec4(pixelColor, inputColor.a)
}

/**
 * LCD ghosting/motion blur effect.
 * Simulates the slow pixel response time of LCD displays.
 *
 * @param currentTex - Current frame texture
 * @param previousTex - Previous frame texture
 * @param uv - UV coordinates
 * @param persistence - Ghost persistence (default: 0.6)
 * @returns Color with ghosting effect
 */
export function lcdGhosting(
  currentTex: TSLNode,
  previousTex: TSLNode,
  uv: TSLNode,
  persistence: FloatInput = 0.6
): TSLNode {
  const persistNode = typeof persistence === 'number' ? float(persistence) : persistence

  const current = currentTex.sample(uv)
  const previous = previousTex.sample(uv)

  // Asymmetric response: faster rise than fall
  const diff = current.rgb.sub(previous.rgb)
  const rising = diff.greaterThan(vec3(0, 0, 0))

  // Faster response for increasing brightness, slower for decreasing
  const riseFactor = float(0.8)
  const fallFactor = persistNode

  const factor = rising.select(riseFactor, fallFactor)
  const blended = previous.rgb.mix(current.rgb, float(1).sub(factor))

  return vec4(blended, current.a)
}

/**
 * Simple LCD persistence effect (single texture version).
 * Creates motion blur by blending with offset samples.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param velocity - Motion direction and speed
 * @param persistence - Ghost amount
 * @returns Color with motion ghosting
 */
export function lcdMotionGhost(
  tex: TSLNode,
  uv: TSLNode,
  velocity: TSLNode,
  persistence: FloatInput = 0.4
): TSLNode {
  const persistNode = typeof persistence === 'number' ? float(persistence) : persistence

  const current = tex.sample(uv)
  const ghost = tex.sample(uv.sub(velocity.mul(0.02)))

  return vec4(current.rgb.add(ghost.rgb.mul(persistNode)), current.a)
}

/**
 * LCD backlight bleed effect.
 * Simulates uneven backlight distribution.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param intensity - Bleed intensity (default: 0.1)
 * @returns Color with backlight bleed
 */
export function lcdBacklightBleed(
  inputColor: TSLNode,
  uv: TSLNode,
  intensity: FloatInput = 0.1
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Uneven lighting pattern (brighter in center, corners darker)
  const centered = uv.sub(0.5).mul(2)
  const dist = centered.length()
  const bleed = float(1).sub(dist.mul(intensityNode))

  return vec4(inputColor.rgb.mul(bleed), inputColor.a)
}

/**
 * Game Boy Pocket LCD effect.
 * Gray-scale LCD simulation with distinctive look.
 *
 * @param inputColor - Input color (will be converted to grayscale)
 * @param uv - UV coordinates
 * @param resolution - Pixel resolution
 * @param contrast - Display contrast
 * @returns Color with GB Pocket LCD effect
 */
export function lcdPocket(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 160,
  contrast: FloatInput = 1.2
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const contrastNode = typeof contrast === 'number' ? float(contrast) : contrast

  // Convert to grayscale
  const luma = inputColor.r.mul(0.299).add(inputColor.g.mul(0.587)).add(inputColor.b.mul(0.114))

  // Apply contrast
  const contrasted = luma.sub(0.5).mul(contrastNode).add(0.5).clamp(0, 1)

  // Dot matrix effect
  const pixelPos = uv.mul(resNode).fract().sub(0.5)
  const dist = pixelPos.length()
  const dotMask = float(1).sub(dist.mul(3)).clamp(0, 1)

  // Pocket LCD colors (gray shades)
  const dark = vec3(0.2, 0.22, 0.2)
  const light = vec3(0.75, 0.78, 0.72)

  const color = dark.mix(light, contrasted.mul(dotMask))

  return vec4(color, inputColor.a)
}

/**
 * Game Boy Color LCD simulation.
 * Slightly different grid pattern than GBA.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolution - Display resolution
 * @param gridIntensity - Grid visibility
 * @returns Color with GBC LCD effect
 */
export function lcdGBC(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 160,
  gridIntensity: FloatInput = 0.2
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const gridNode = typeof gridIntensity === 'number' ? float(gridIntensity) : gridIntensity

  const pixelPos = uv.mul(resNode).fract()

  // Grid pattern (cross-hatch)
  const gridX = pixelPos.x.lessThan(0.08)
  const gridY = pixelPos.y.lessThan(0.08)
  const isGrid = gridX.or(gridY)
  const gridDarken = isGrid.select(float(1).sub(gridNode), float(1))

  // Slight color boost for GBC's more vibrant display
  const boosted = inputColor.rgb.mul(1.1).clamp(0, 1)

  return vec4(boosted.mul(gridDarken), inputColor.a)
}
