import { vec2, vec4, floor, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { Vec2Input } from '../types'

/**
 * Scale2x (AdvMAME2x) pixel art upscaling algorithm.
 * Simple edge-detection based upscaling that preserves pixel art edges.
 *
 * @param tex - Source texture (pixel art)
 * @param uv - UV coordinates
 * @param texelSize - Size of one texel in the source texture
 * @returns Upscaled color
 *
 * @example
 * // For a 256x256 texture upscaled to 512x512
 * const upscaled = scale2x(texture, uv, [1/256, 1/256])
 */
export function scale2x(tex: Texture, uv: Node<'vec2'>, texelSize: Vec2Input = [1 / 256, 1 / 256]) {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  // Find source pixel center
  const srcPixel = floor(uv.div(texel.mul(0.5))).mul(0.5)
  const srcUV = srcPixel.mul(texel).add(texel.mul(0.5))

  // Position within the 2x2 output pixel (0-1 in each axis)
  const localPos = uv.div(texel).sub(srcPixel).mul(2)
  const isRight = localPos.x.greaterThan(1)
  const isBottom = localPos.y.greaterThan(1)

  // Sample the 3x3 neighborhood (only need A, B, C, D, E, F, G, H, I pattern)
  // Pattern:
  //   A B C
  //   D E F
  //   G H I
  const B = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const D = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const E = sampleTexture(tex, srcUV) // Center
  const F = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const H = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))

  // Scale2x rules:
  // If B != H and D != F, then
  //   E0 = D == B ? D : E
  //   E1 = B == F ? F : E
  //   E2 = D == H ? D : E
  //   E3 = H == F ? F : E

  // Check if pixels are "equal" (simple RGB comparison)
  const Beq = (a: Node<'vec4'>, b: Node<'vec4'>) => a.rgb.sub(b.rgb).length().lessThan(0.01)

  const BneH = Beq(B, H).not()
  const DneF = Beq(D, F).not()
  const canScale = BneH.and(DneF)

  // Determine which output pixel we're in and apply rule
  // E0 (top-left), E1 (top-right), E2 (bottom-left), E3 (bottom-right)
  const DeqB = Beq(D, B)
  const BeqF = Beq(B, F)
  const DeqH = Beq(D, H)
  const HeqF = Beq(H, F)

  // Select based on position
  const useTopLeft = isRight.not().and(isBottom.not())
  const useTopRight = isRight.and(isBottom.not())
  const useBottomLeft = isRight.not().and(isBottom)
  const _useBottomRight = isRight.and(isBottom)

  // E0: top-left
  const useE0 = canScale.and(DeqB)
  const e0 = useE0.select(D.rgb, E.rgb)
  const e0Alpha = useE0.select(D.a, E.a)
  // E1: top-right
  const useE1 = canScale.and(BeqF)
  const e1 = useE1.select(F.rgb, E.rgb)
  const e1Alpha = useE1.select(F.a, E.a)
  // E2: bottom-left
  const useE2 = canScale.and(DeqH)
  const e2 = useE2.select(D.rgb, E.rgb)
  const e2Alpha = useE2.select(D.a, E.a)
  // E3: bottom-right
  const useE3 = canScale.and(HeqF)
  const e3 = useE3.select(F.rgb, E.rgb)
  const e3Alpha = useE3.select(F.a, E.a)

  // Select final pixel
  const result = useTopLeft.select(e0, useTopRight.select(e1, useBottomLeft.select(e2, e3)))
  const resultAlpha = useTopLeft.select(e0Alpha, useTopRight.select(e1Alpha, useBottomLeft.select(e2Alpha, e3Alpha)))

  return vec4(result, resultAlpha)
}

/**
 * Scale3x (AdvMAME3x) pixel art upscaling algorithm.
 * 3x upscaling variant with more refined edge detection.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Source texel size
 * @returns Upscaled color
 */
export function scale3x(tex: Texture, uv: Node<'vec2'>, texelSize: Vec2Input = [1 / 256, 1 / 256]) {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  // Find source pixel
  const srcPixel = floor(uv.div(texel.div(3)))
  const srcUV = srcPixel.mul(texel).add(texel.mul(0.5))

  // Position within 3x3 output pixel
  const localPos = uv.div(texel.div(3)).sub(srcPixel)

  // Sample neighborhood
  const _A = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, -1))))
  const B = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const _C = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, -1))))
  const D = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const E = sampleTexture(tex, srcUV)
  const F = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const _G = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 1))))
  const H = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))
  const _I = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 1))))

  // For simplicity, return center pixel for edge cases
  // Full Scale3x implementation would check all 9 output positions
  // This is a simplified version that blends based on position
  const Beq = (a: Node<'vec4'>, b: Node<'vec4'>) => a.rgb.sub(b.rgb).length().lessThan(0.01)

  const xPos = floor(localPos.x.mul(3))
  const yPos = floor(localPos.y.mul(3))

  // Center pixel
  let result = E.rgb
  let resultAlpha = E.a

  // Top row
  const isTop = yPos.lessThan(1)
  const isLeft = xPos.lessThan(1)
  const isRight = xPos.greaterThan(1)
  const isBottom = yPos.greaterThan(1)

  // Corner and edge blending
  const useTopLeft = isTop.and(isLeft).and(Beq(D, B))
  const useTopRight = isTop.and(isRight).and(Beq(B, F))
  const useBottomLeft = isBottom.and(isLeft).and(Beq(D, H))
  const useBottomRight = isBottom.and(isRight).and(Beq(H, F))
  const topLeft = useTopLeft.select(D.rgb, E.rgb)
  const topRight = useTopRight.select(F.rgb, E.rgb)
  const bottomLeft = useBottomLeft.select(D.rgb, E.rgb)
  const bottomRight = useBottomRight.select(F.rgb, E.rgb)
  const topLeftAlpha = useTopLeft.select(D.a, E.a)
  const topRightAlpha = useTopRight.select(F.a, E.a)
  const bottomLeftAlpha = useBottomLeft.select(D.a, E.a)
  const bottomRightAlpha = useBottomRight.select(F.a, E.a)

  result = isTop.and(isLeft).select(topLeft, result)
  resultAlpha = isTop.and(isLeft).select(topLeftAlpha, resultAlpha)
  result = isTop.and(isRight).select(topRight, result)
  resultAlpha = isTop.and(isRight).select(topRightAlpha, resultAlpha)
  result = isBottom.and(isLeft).select(bottomLeft, result)
  resultAlpha = isBottom.and(isLeft).select(bottomLeftAlpha, resultAlpha)
  result = isBottom.and(isRight).select(bottomRight, result)
  resultAlpha = isBottom.and(isRight).select(bottomRightAlpha, resultAlpha)

  return vec4(result, resultAlpha)
}
