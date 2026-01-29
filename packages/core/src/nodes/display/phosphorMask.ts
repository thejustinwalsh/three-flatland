import { vec2, vec3, vec4, float, floor, mod } from 'three/tsl'
import type { TSLNode, FloatInput } from '../types'

/**
 * Aperture grille phosphor mask (Trinitron-style).
 * Vertical RGB stripes like Sony Trinitron CRTs.
 *
 * @param inputColor - Input color (vec4)
 * @param uv - UV coordinates
 * @param resolution - Horizontal resolution (default: 640)
 * @param intensity - Mask intensity (default: 0.3)
 * @returns Color with aperture grille effect
 *
 * @example
 * const trinitron = phosphorApertureGrille(inputColor, uv, 640, 0.25)
 */
export function phosphorApertureGrille(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 640,
  intensity: FloatInput = 0.3
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  // Position within pixel triplet (0, 1, or 2 for R, G, B)
  const pixelX = floor(uv.x.mul(resNode))
  const subpixel = mod(pixelX, float(3))

  // Determine which color channel is active
  const isR = subpixel.lessThan(1)
  const isG = subpixel.greaterThanEqual(1).and(subpixel.lessThan(2))
  const isB = subpixel.greaterThanEqual(2)

  // Mask each channel (reduce non-active channels)
  const maskR = isR.select(float(1), float(1).sub(intensityNode))
  const maskG = isG.select(float(1), float(1).sub(intensityNode))
  const maskB = isB.select(float(1), float(1).sub(intensityNode))

  const masked = vec3(inputColor.r.mul(maskR), inputColor.g.mul(maskG), inputColor.b.mul(maskB))

  return vec4(masked, inputColor.a)
}

/**
 * Slot mask phosphor pattern.
 * Staggered RGB pattern common in many CRT TVs.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolutionX - Horizontal resolution
 * @param resolutionY - Vertical resolution
 * @param intensity - Mask intensity
 * @returns Color with slot mask effect
 */
export function phosphorSlotMask(
  inputColor: TSLNode,
  uv: TSLNode,
  resolutionX: FloatInput = 640,
  resolutionY: FloatInput = 480,
  intensity: FloatInput = 0.3
): TSLNode {
  const resXNode = typeof resolutionX === 'number' ? float(resolutionX) : resolutionX
  const resYNode = typeof resolutionY === 'number' ? float(resolutionY) : resolutionY
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const pixelX = floor(uv.x.mul(resXNode))
  const pixelY = floor(uv.y.mul(resYNode))

  // Stagger pattern on alternate rows
  const offset = mod(pixelY, float(2)).mul(1.5)
  const subpixel = mod(pixelX.add(offset), float(3))

  const isR = subpixel.lessThan(1)
  const isG = subpixel.greaterThanEqual(1).and(subpixel.lessThan(2))
  const isB = subpixel.greaterThanEqual(2)

  const reduce = float(1).sub(intensityNode)
  const maskR = isR.select(float(1), reduce)
  const maskG = isG.select(float(1), reduce)
  const maskB = isB.select(float(1), reduce)

  const masked = vec3(inputColor.r.mul(maskR), inputColor.g.mul(maskG), inputColor.b.mul(maskB))

  return vec4(masked, inputColor.a)
}

/**
 * Shadow mask phosphor pattern.
 * Triangular/delta arrangement of phosphor dots.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param resolution - Resolution scale
 * @param intensity - Mask intensity
 * @returns Color with shadow mask effect
 */
export function phosphorShadowMask(
  inputColor: TSLNode,
  uv: TSLNode,
  resolution: FloatInput = 300,
  intensity: FloatInput = 0.3
): TSLNode {
  const resNode = typeof resolution === 'number' ? float(resolution) : resolution
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const scaled = uv.mul(resNode)
  const pixelX = floor(scaled.x)
  const pixelY = floor(scaled.y)

  // Delta arrangement offset
  const rowOffset = mod(pixelY, float(2)).mul(0.5)
  const subpixel = mod(pixelX.add(rowOffset), float(3))

  // Soft circular falloff within each phosphor dot
  const localPos = scaled.fract().sub(0.5)
  const distFromCenter = localPos.length().mul(2)
  const phosphorShape = float(1).sub(distFromCenter.clamp(0, 1)).pow(0.5)

  const isR = subpixel.lessThan(1)
  const isG = subpixel.greaterThanEqual(1).and(subpixel.lessThan(2))
  const isB = subpixel.greaterThanEqual(2)

  const reduce = float(1).sub(intensityNode.mul(phosphorShape))
  const full = float(1).sub(intensityNode.mul(0.5).mul(float(1).sub(phosphorShape)))

  const maskR = isR.select(full, reduce)
  const maskG = isG.select(full, reduce)
  const maskB = isB.select(full, reduce)

  const masked = vec3(inputColor.r.mul(maskR), inputColor.g.mul(maskG), inputColor.b.mul(maskB))

  return vec4(masked, inputColor.a)
}

/**
 * Simple RGB stripe mask (lightweight version).
 *
 * @param inputColor - Input color
 * @param screenCoord - Screen coordinates (gl_FragCoord.xy or similar)
 * @param scale - Stripe scale (pixels per color)
 * @param intensity - Effect intensity
 * @returns Color with RGB stripes
 */
export function phosphorSimple(
  inputColor: TSLNode,
  screenCoord: TSLNode,
  scale: FloatInput = 1,
  intensity: FloatInput = 0.2
): TSLNode {
  const scaleNode = typeof scale === 'number' ? float(scale) : scale
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity

  const col = mod(floor(screenCoord.x.div(scaleNode)), float(3))

  const reduce = float(1).sub(intensityNode)
  const maskR = col.lessThan(1).select(float(1), reduce)
  const maskG = col.greaterThanEqual(1).and(col.lessThan(2)).select(float(1), reduce)
  const maskB = col.greaterThanEqual(2).select(float(1), reduce)

  const masked = vec3(inputColor.r.mul(maskR), inputColor.g.mul(maskG), inputColor.b.mul(maskB))

  return vec4(masked, inputColor.a)
}

/**
 * Customizable phosphor mask with configurable pattern.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param maskType - Type: 'aperture', 'slot', or 'shadow'
 * @param resolution - Resolution scale
 * @param intensity - Mask intensity
 * @returns Color with phosphor mask
 */
export function phosphorMask(
  inputColor: TSLNode,
  uv: TSLNode,
  maskType: 'aperture' | 'slot' | 'shadow' = 'aperture',
  resolution: FloatInput = 640,
  intensity: FloatInput = 0.3
): TSLNode {
  switch (maskType) {
    case 'slot':
      return phosphorSlotMask(inputColor, uv, resolution, resolution, intensity)
    case 'shadow':
      return phosphorShadowMask(inputColor, uv, resolution, intensity)
    case 'aperture':
    default:
      return phosphorApertureGrille(inputColor, uv, resolution, intensity)
  }
}
