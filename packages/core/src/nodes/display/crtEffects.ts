import { vec2, vec3, vec4, float, texture as sampleTexture, sin, cos } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input, Vec3Input } from '../types'

/**
 * CRT barrel/curvature distortion.
 * Simulates the curved glass of CRT monitors.
 *
 * @param uv - Input UV coordinates
 * @param curvature - Curvature amount (default: 0.1)
 * @returns Distorted UV coordinates
 *
 * @example
 * const curvedUV = crtCurvature(uv, 0.15)
 * const color = texture(tex, curvedUV)
 */
export function crtCurvature(uv: TSLNode, curvature: FloatInput = 0.1): TSLNode {
  const curvNode = typeof curvature === 'number' ? float(curvature) : curvature

  // Center UV at origin (-1 to 1)
  const centered = uv.sub(0.5).mul(2)

  // Calculate distortion
  const r2 = centered.dot(centered)
  const distortion = float(1).add(r2.mul(curvNode))

  const curved = centered.mul(distortion).div(2).add(0.5)

  return curved
}

/**
 * CRT curvature with corner darkening.
 *
 * @param uv - UV coordinates
 * @param curvature - Curvature amount
 * @param cornerDarkness - How much corners darken (default: 0.1)
 * @returns Object with distorted UV and corner mask
 */
export function crtCurvatureWithCorners(
  uv: TSLNode,
  curvature: FloatInput = 0.1,
  cornerDarkness: FloatInput = 0.1
): { uv: TSLNode; cornerMask: TSLNode } {
  const curvNode = typeof curvature === 'number' ? float(curvature) : curvature
  const cornerNode = typeof cornerDarkness === 'number' ? float(cornerDarkness) : cornerDarkness

  const centered = uv.sub(0.5).mul(2)
  const r2 = centered.dot(centered)
  const distortion = float(1).add(r2.mul(curvNode))
  const curved = centered.mul(distortion).div(2).add(0.5)

  // Corner darkening
  const cornerDist = centered.x.abs().max(centered.y.abs())
  const cornerMask = float(1).sub(cornerDist.pow(2).mul(cornerNode))

  return { uv: curved, cornerMask }
}

/**
 * CRT vignette - darkens edges like old CRT displays.
 *
 * @param inputColor - Input color
 * @param uv - UV coordinates
 * @param intensity - Vignette strength (default: 0.3)
 * @param curvature - Edge curvature (default: 2)
 * @returns Color with CRT vignette
 */
export function crtVignette(
  inputColor: TSLNode,
  uv: TSLNode,
  intensity: FloatInput = 0.3,
  curvature: FloatInput = 2
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const curvNode = typeof curvature === 'number' ? float(curvature) : curvature

  // Distance from edges
  const edge = uv.mul(float(1).sub(uv))
  const vignette = edge.x.mul(edge.y).mul(15)
  const vignetted = vignette.pow(intensityNode.mul(curvNode))

  return vec4(inputColor.rgb.mul(vignetted), inputColor.a)
}

/**
 * CRT bloom/phosphor glow effect.
 * Simulates the characteristic glow of phosphor displays.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param intensity - Bloom intensity (default: 0.3)
 * @param spread - Glow spread (default: 0.002)
 * @returns Color with phosphor bloom
 */
export function crtBloom(
  tex: Texture,
  uv: TSLNode,
  intensity: FloatInput = 0.3,
  spread: FloatInput = 0.002
): TSLNode {
  const intensityNode = typeof intensity === 'number' ? float(intensity) : intensity
  const spreadNode = typeof spread === 'number' ? float(spread) : spread

  const center = sampleTexture(tex, uv)

  // Sample neighbors for bloom
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  let bloom: TSLNode = vec3(0, 0, 0)
  for (const [ox, oy] of offsets) {
    const offset = vec2(ox, oy).mul(spreadNode)
    bloom = bloom.add(sampleTexture(tex, uv.add(offset)).rgb)
  }
  bloom = bloom.div(4).mul(intensityNode)

  return vec4(center.rgb.add(bloom), center.a)
}

/**
 * CRT color bleeding/smearing effect.
 * Simulates horizontal color bleeding in composite video.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param amount - Bleeding amount (default: 0.002)
 * @returns Color with bleeding effect
 */
export function crtColorBleed(
  tex: Texture,
  uv: TSLNode,
  amount: FloatInput = 0.002
): TSLNode {
  const amountNode = typeof amount === 'number' ? float(amount) : amount

  // Sample with horizontal offset for each channel
  const r = sampleTexture(tex, uv.sub(vec2(amountNode, 0))).r
  const g = sampleTexture(tex, uv).g
  const b = sampleTexture(tex, uv.add(vec2(amountNode, 0))).b
  const a = sampleTexture(tex, uv).a

  return vec4(r, g, b, a)
}

/**
 * Complete CRT effect combining curvature, scanlines, and mask.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param options - CRT effect options
 * @returns Color with full CRT simulation
 */
export interface CRTOptions {
  /** Barrel curvature amount (default: 0.1) */
  curvature?: FloatInput
  /** Scanline intensity (default: 0.2) */
  scanlineIntensity?: FloatInput
  /** Scanline resolution (default: 240) */
  scanlineRes?: FloatInput
  /** Vignette intensity (default: 0.3) */
  vignetteIntensity?: FloatInput
  /** Phosphor bloom intensity (default: 0.2) */
  bloomIntensity?: FloatInput
  /** Color bleed amount (default: 0.001) */
  colorBleed?: FloatInput
}

export function crtComplete(tex: Texture, uv: TSLNode, options: CRTOptions = {}): TSLNode {
  const {
    curvature = 0.1,
    scanlineIntensity = 0.2,
    scanlineRes = 240,
    vignetteIntensity = 0.3,
    bloomIntensity = 0.2,
    colorBleed = 0.001,
  } = options

  // Apply curvature
  const curvedUV = crtCurvature(uv, curvature)

  // Check if outside screen bounds
  const outsideScreen = curvedUV.x
    .lessThan(0)
    .or(curvedUV.x.greaterThan(1))
    .or(curvedUV.y.lessThan(0))
    .or(curvedUV.y.greaterThan(1))

  // Color bleed
  let color = crtColorBleed(tex, curvedUV, colorBleed)

  // Scanlines
  const scanlineResNode = typeof scanlineRes === 'number' ? float(scanlineRes) : scanlineRes
  const scanlineIntNode = typeof scanlineIntensity === 'number' ? float(scanlineIntensity) : scanlineIntensity
  const scanline = sin(curvedUV.y.mul(scanlineResNode).mul(3.14159)).mul(0.5).add(0.5)
  color = vec4(color.rgb.mul(float(1).sub(scanline.mul(scanlineIntNode))), color.a)

  // Bloom
  color = vec4(color.rgb.add(crtBloom(tex, curvedUV, bloomIntensity, 0.003).rgb.mul(0.5)), color.a)

  // Vignette
  color = crtVignette(color, curvedUV, vignetteIntensity, 2)

  // Black outside screen
  return outsideScreen.select(vec4(0, 0, 0, 1), color)
}

/**
 * CRT convergence error simulation.
 * Misaligns RGB channels slightly like poorly calibrated CRTs.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param redOffset - Red channel offset
 * @param blueOffset - Blue channel offset
 * @returns Color with convergence error
 */
export function crtConvergence(
  tex: Texture,
  uv: TSLNode,
  redOffset: Vec2Input = [0.001, 0],
  blueOffset: Vec2Input = [-0.001, 0]
): TSLNode {
  const redVec = Array.isArray(redOffset) ? vec2(...redOffset) : redOffset
  const blueVec = Array.isArray(blueOffset) ? vec2(...blueOffset) : blueOffset

  const r = sampleTexture(tex, uv.add(redVec)).r
  const g = sampleTexture(tex, uv).g
  const b = sampleTexture(tex, uv.add(blueVec)).b
  const a = sampleTexture(tex, uv).a

  return vec4(r, g, b, a)
}
