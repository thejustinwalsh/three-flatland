import { vec2, vec3, vec4, float, floor, texture as sampleTexture, If, Discard, smoothstep } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec3Input } from '../types'

export interface DissolveOptions {
  /** Dissolve progress (0 = fully visible, 1 = fully dissolved) */
  progress: FloatInput
  /** Noise texture for dissolve pattern */
  noiseTex: Texture
  /** Edge glow color as [r, g, b] (default: [1, 0.5, 0] = orange) */
  edgeColor?: Vec3Input
  /** Width of the glowing edge (default: 0.1) */
  edgeWidth?: FloatInput
  /** Scale of noise UV (default: 1) */
  noiseScale?: FloatInput
}

/**
 * Dissolve effect using a noise texture.
 * Creates a burning/disintegration effect with a glowing edge.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param options - Dissolve configuration
 * @returns Color with dissolve effect applied
 *
 * @example
 * // Basic dissolve
 * dissolve(texture(tex, uv()), uv(), {
 *   progress: 0.5,
 *   noiseTex: noiseTexture,
 * })
 *
 * @example
 * // Dissolve with custom edge color
 * dissolve(texture(tex, uv()), uv(), {
 *   progress: dissolveUniform,
 *   noiseTex: noiseTexture,
 *   edgeColor: [0, 1, 0.5],
 *   edgeWidth: 0.15,
 * })
 */
export function dissolve(
  inputColor: TSLNode,
  inputUV: TSLNode,
  options: DissolveOptions
): TSLNode {
  const {
    progress,
    noiseTex,
    edgeColor = [1, 0.5, 0],
    edgeWidth = 0.1,
    noiseScale = 1,
  } = options

  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const edgeColorVec = Array.isArray(edgeColor) ? vec3(...edgeColor) : edgeColor
  const edgeWidthNode = typeof edgeWidth === 'number' ? float(edgeWidth) : edgeWidth
  const noiseScaleNode = typeof noiseScale === 'number' ? float(noiseScale) : noiseScale

  // Sample noise texture
  const noiseUV = inputUV.mul(noiseScaleNode)
  const noiseValue = sampleTexture(noiseTex, noiseUV).r

  // Calculate dissolve threshold
  // When progress = 0, threshold = 0 (nothing dissolved)
  // When progress = 1, threshold = 1 (everything dissolved)
  const threshold = progressNode

  // Discard pixels below threshold
  If(noiseValue.lessThan(threshold), () => {
    Discard()
  })

  // Calculate edge glow
  // Edge is where noise is just above threshold
  const edgeStart = threshold
  const edgeEnd = threshold.add(edgeWidthNode)
  const edgeIntensity = float(1).sub(smoothstep(edgeStart, edgeEnd, noiseValue))

  // Mix edge color with original
  const finalRGB = inputColor.rgb.mix(edgeColorVec, edgeIntensity.mul(inputColor.a))

  return vec4(finalRGB, inputColor.a)
}

/**
 * Simple dissolve without edge glow.
 * More performant when edge effect isn't needed.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param progress - Dissolve progress (0-1)
 * @param noiseTex - Noise texture for dissolve pattern
 * @returns Color with simple dissolve effect
 */
export function dissolveSimple(
  inputColor: TSLNode,
  inputUV: TSLNode,
  progress: FloatInput,
  noiseTex: Texture
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress

  // Sample noise texture
  const noiseValue = sampleTexture(noiseTex, inputUV).r

  // Discard pixels below threshold
  If(noiseValue.lessThan(progressNode), () => {
    Discard()
  })

  return inputColor
}

/**
 * Pixelated dissolve effect - blocks disappear together in a pixel grid.
 * Creates a retro/8-bit style dissolve effect perfect for pixel art.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates (raw, not frame-mapped)
 * @param progress - Dissolve progress (0-1)
 * @param noiseTex - Noise texture for dissolve pattern
 * @param pixelCount - Number of pixels in the grid (default: 16)
 * @returns Color with pixelated dissolve effect
 *
 * @example
 * // Basic pixelated dissolve
 * dissolvePixelated(color, uv(), dissolveProgress, noiseTexture)
 *
 * @example
 * // Coarser 8x8 pixel grid
 * dissolvePixelated(color, uv(), dissolveProgress, noiseTexture, 8)
 */
export function dissolvePixelated(
  inputColor: TSLNode,
  inputUV: TSLNode,
  progress: FloatInput,
  noiseTex: Texture,
  pixelCount: FloatInput = 16
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const pixelCountNode = typeof pixelCount === 'number' ? float(pixelCount) : pixelCount

  // Pixelate the UV coordinates for blocky dissolve pattern
  const resolution = vec2(pixelCountNode, pixelCountNode)
  const pixelatedUV = floor(inputUV.mul(resolution)).div(resolution)

  // Sample noise at pixelated UV for blocky pattern
  const noiseValue = sampleTexture(noiseTex, pixelatedUV).r

  // Discard dissolved pixels
  If(noiseValue.lessThan(progressNode), () => {
    Discard()
  })

  return inputColor
}

/**
 * Directional dissolve (wipe effect with noise).
 * Combines a directional gradient with noise for a more organic wipe.
 *
 * @param inputColor - The input color (vec4 with alpha)
 * @param inputUV - The UV coordinates
 * @param progress - Dissolve progress (0-1)
 * @param noiseTex - Noise texture
 * @param direction - Wipe direction: 'left', 'right', 'up', 'down'
 * @param noiseStrength - How much noise affects the wipe (0-1)
 * @returns Color with directional dissolve effect
 */
export function dissolveDirectional(
  inputColor: TSLNode,
  inputUV: TSLNode,
  progress: FloatInput,
  noiseTex: Texture,
  direction: 'left' | 'right' | 'up' | 'down' = 'right',
  noiseStrength: FloatInput = 0.3
): TSLNode {
  const progressNode = typeof progress === 'number' ? float(progress) : progress
  const noiseStrengthNode = typeof noiseStrength === 'number' ? float(noiseStrength) : noiseStrength

  // Sample noise
  const noiseValue = sampleTexture(noiseTex, inputUV).r

  // Calculate directional gradient
  let gradient: TSLNode
  switch (direction) {
    case 'left':
      gradient = float(1).sub(inputUV.x)
      break
    case 'right':
      gradient = inputUV.x
      break
    case 'up':
      gradient = inputUV.y
      break
    case 'down':
      gradient = float(1).sub(inputUV.y)
      break
  }

  // Combine gradient with noise
  const combinedValue = gradient.mul(float(1).sub(noiseStrengthNode)).add(noiseValue.mul(noiseStrengthNode))

  // Discard based on progress
  If(combinedValue.lessThan(progressNode), () => {
    Discard()
  })

  return inputColor
}
