import { vec2, vec4, float, max, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec4Input } from '../types'

export interface OutlineOptions {
  /** Outline color as [r, g, b, a] (0-1 range) or TSL node */
  color?: Vec4Input
  /** Outline thickness in UV space (default: 0.01) */
  thickness?: FloatInput
  /** Texture size for proper UV offset calculation as [width, height] */
  textureSize?: [number, number] | TSLNode
}

/**
 * Add an outline effect by sampling neighboring pixels.
 * Detects edges based on alpha differences and draws outline around opaque areas.
 *
 * @param inputColor - The input color (typically texture sample result)
 * @param inputUV - The UV coordinates
 * @param tex - The texture to sample for neighbor detection
 * @param options - Outline configuration
 * @returns Color with outline applied
 *
 * @example
 * // Basic white outline
 * outline(texture(tex, uv()), uv(), tex, { color: [1, 1, 1, 1] })
 *
 * @example
 * // Glowing outline with custom thickness
 * outline(texture(tex, uv()), uv(), tex, {
 *   color: [0, 1, 0, 1],
 *   thickness: 0.02,
 *   textureSize: [64, 64]
 * })
 */
export function outline(
  inputColor: TSLNode,
  inputUV: TSLNode,
  tex: Texture,
  options: OutlineOptions = {}
): TSLNode {
  const {
    color = [1, 1, 1, 1],
    thickness = 0.01,
    textureSize,
  } = options

  const outlineColor = Array.isArray(color) ? vec4(...color) : color
  const thicknessNode = typeof thickness === 'number' ? float(thickness) : thickness

  // Calculate UV offset based on texture size or use raw thickness
  let offset: TSLNode
  if (textureSize) {
    const size = Array.isArray(textureSize) ? vec2(...textureSize) : textureSize
    offset = thicknessNode.div(size)
  } else {
    offset = vec2(thicknessNode, thicknessNode)
  }

  // Sample neighbors (4-directional)
  const up = sampleTexture(tex, inputUV.add(vec2(0, offset.y)))
  const down = sampleTexture(tex, inputUV.sub(vec2(0, offset.y)))
  const left = sampleTexture(tex, inputUV.sub(vec2(offset.x, 0)))
  const right = sampleTexture(tex, inputUV.add(vec2(offset.x, 0)))

  // Get max alpha from neighbors
  const neighborAlpha = max(max(up.a, down.a), max(left.a, right.a))

  // If current pixel is transparent but neighbors are opaque, draw outline
  // outline = neighborAlpha * (1 - currentAlpha)
  const outlineStrength = neighborAlpha.mul(float(1).sub(inputColor.a))

  // Blend outline with original color
  return vec4(
    inputColor.rgb.mul(inputColor.a).add(outlineColor.rgb.mul(outlineStrength)),
    max(inputColor.a, outlineStrength.mul(outlineColor.a))
  )
}

/**
 * Add an outline effect with 8-directional sampling for smoother edges.
 *
 * @param inputColor - The input color (typically texture sample result)
 * @param inputUV - The UV coordinates
 * @param tex - The texture to sample for neighbor detection
 * @param options - Outline configuration
 * @returns Color with outline applied
 */
export function outline8(
  inputColor: TSLNode,
  inputUV: TSLNode,
  tex: Texture,
  options: OutlineOptions = {}
): TSLNode {
  const {
    color = [1, 1, 1, 1],
    thickness = 0.01,
    textureSize,
  } = options

  const outlineColor = Array.isArray(color) ? vec4(...color) : color
  const thicknessNode = typeof thickness === 'number' ? float(thickness) : thickness

  // Calculate UV offset
  let offsetX: TSLNode
  let offsetY: TSLNode
  if (textureSize) {
    const size = Array.isArray(textureSize) ? vec2(...textureSize) : textureSize
    offsetX = thicknessNode.div(size.x)
    offsetY = thicknessNode.div(size.y)
  } else {
    offsetX = thicknessNode
    offsetY = thicknessNode
  }

  // Sample all 8 neighbors
  const n = sampleTexture(tex, inputUV.add(vec2(0, offsetY)))
  const s = sampleTexture(tex, inputUV.sub(vec2(0, offsetY)))
  const e = sampleTexture(tex, inputUV.add(vec2(offsetX, 0)))
  const w = sampleTexture(tex, inputUV.sub(vec2(offsetX, 0)))
  const ne = sampleTexture(tex, inputUV.add(vec2(offsetX, offsetY)))
  const nw = sampleTexture(tex, inputUV.add(vec2(offsetX.negate(), offsetY)))
  const se = sampleTexture(tex, inputUV.add(vec2(offsetX, offsetY.negate())))
  const sw = sampleTexture(tex, inputUV.sub(vec2(offsetX, offsetY)))

  // Get max alpha from all neighbors
  const neighborAlpha = max(
    max(max(n.a, s.a), max(e.a, w.a)),
    max(max(ne.a, nw.a), max(se.a, sw.a))
  )

  // Calculate outline strength
  const outlineStrength = neighborAlpha.mul(float(1).sub(inputColor.a))

  // Blend outline with original color
  return vec4(
    inputColor.rgb.mul(inputColor.a).add(outlineColor.rgb.mul(outlineStrength)),
    max(inputColor.a, outlineStrength.mul(outlineColor.a))
  )
}
