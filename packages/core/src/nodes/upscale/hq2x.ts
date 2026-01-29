import { vec2, vec3, vec4, float, floor, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, Vec2Input, FloatInput } from '../types'

/**
 * HQ2x-style pixel art upscaling (simplified GPU implementation).
 * High quality 2x upscaling that preserves edges while smoothing.
 *
 * Note: This is a simplified approximation of the full HQ2x algorithm,
 * which requires lookup tables that are impractical for real-time GPU shaders.
 *
 * @param tex - Source texture (pixel art)
 * @param uv - UV coordinates
 * @param texelSize - Size of one texel in source texture
 * @param threshold - Color difference threshold (default: 0.05)
 * @returns Upscaled color
 *
 * @example
 * const upscaled = hq2x(texture, uv, [1/256, 1/256])
 */
export function hq2x(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 256, 1 / 256],
  threshold: FloatInput = 0.05
): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize
  const threshNode = typeof threshold === 'number' ? float(threshold) : threshold

  // Source pixel
  const srcPixel = floor(uv.div(texel.mul(0.5)))
  const srcUV = srcPixel.mul(0.5).mul(texel).add(texel.mul(0.25))
  const localPos = uv.div(texel.mul(0.5)).sub(srcPixel)

  // Sample 3x3 neighborhood
  // w1 w2 w3
  // w4 w5 w6
  // w7 w8 w9
  const w1 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, -1))))
  const w2 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const w3 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, -1))))
  const w4 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const w5 = sampleTexture(tex, srcUV) // Center
  const w6 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const w7 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 1))))
  const w8 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))
  const w9 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 1))))

  // YUV-like difference for better edge detection
  const yuv = (c: TSLNode) => {
    const y = c.r.mul(0.299).add(c.g.mul(0.587)).add(c.b.mul(0.114))
    const u = c.r.mul(-0.169).add(c.g.mul(-0.331)).add(c.b.mul(0.5)).add(0.5)
    const v = c.r.mul(0.5).add(c.g.mul(-0.419)).add(c.b.mul(-0.081)).add(0.5)
    return vec3(y, u, v)
  }

  const diff = (a: TSLNode, b: TSLNode) => {
    const aYUV = yuv(a)
    const bYUV = yuv(b)
    return aYUV.sub(bYUV).length()
  }

  const eq = (a: TSLNode, b: TSLNode) => diff(a, b).lessThan(threshNode)

  const isRight = localPos.x.greaterThan(0.5)
  const isBottom = localPos.y.greaterThan(0.5)

  // HQ2x-style interpolation
  // Check edges and corners for blending decisions

  // Top-left quadrant
  const p1Blend =
    eq(w4, w2) // Left matches top
      .and(eq(w5, w1).not()) // Center differs from corner
      .and(eq(w5, w4).not()) // Center differs from left

  // Top-right quadrant
  const p2Blend = eq(w2, w6).and(eq(w5, w3).not()).and(eq(w5, w6).not())

  // Bottom-left quadrant
  const p3Blend = eq(w4, w8).and(eq(w5, w7).not()).and(eq(w5, w4).not())

  // Bottom-right quadrant
  const p4Blend = eq(w6, w8).and(eq(w5, w9).not()).and(eq(w5, w6).not())

  // Interpolation weights based on local position within quadrant
  const subX = localPos.x.mul(2).fract()
  const subY = localPos.y.mul(2).fract()

  // Blend toward edges when appropriate
  const topLeftColor = p1Blend.select(w5.rgb.mix(w4.rgb.add(w2.rgb).mul(0.5), float(0.5)), w5.rgb)

  const topRightColor = p2Blend.select(w5.rgb.mix(w2.rgb.add(w6.rgb).mul(0.5), float(0.5)), w5.rgb)

  const bottomLeftColor = p3Blend.select(w5.rgb.mix(w4.rgb.add(w8.rgb).mul(0.5), float(0.5)), w5.rgb)

  const bottomRightColor = p4Blend.select(w5.rgb.mix(w6.rgb.add(w8.rgb).mul(0.5), float(0.5)), w5.rgb)

  // Select quadrant
  const topRow = isRight.select(topRightColor, topLeftColor)
  const bottomRow = isRight.select(bottomRightColor, bottomLeftColor)
  const result = isBottom.select(bottomRow, topRow)

  return vec4(result, w5.a)
}

/**
 * HQ3x-style upscaling (simplified).
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Source texel size
 * @param threshold - Color difference threshold
 * @returns Upscaled color
 */
export function hq3x(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 256, 1 / 256],
  threshold: FloatInput = 0.05
): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize
  const threshNode = typeof threshold === 'number' ? float(threshold) : threshold

  // For 3x, we divide into 9 subpixels
  const srcPixel = floor(uv.div(texel.div(3)))
  const srcUV = srcPixel.mul(texel.div(3)).add(texel.mul(0.5))
  const localPos = uv.div(texel.div(3)).sub(srcPixel)

  // Sample neighborhood
  const w1 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, -1))))
  const w2 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const w3 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, -1))))
  const w4 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const w5 = sampleTexture(tex, srcUV)
  const w6 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const w7 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 1))))
  const w8 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))
  const w9 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 1))))

  const diff = (a: TSLNode, b: TSLNode) => a.rgb.sub(b.rgb).length()
  const eq = (a: TSLNode, b: TSLNode) => diff(a, b).lessThan(threshNode)

  // Position in 3x3 grid
  const xPos = floor(localPos.x.mul(3))
  const yPos = floor(localPos.y.mul(3))

  const isLeft = xPos.lessThan(1)
  const isCenter = xPos.greaterThanEqual(1).and(xPos.lessThan(2))
  const isRight = xPos.greaterThanEqual(2)
  const isTop = yPos.lessThan(1)
  const isMiddle = yPos.greaterThanEqual(1).and(yPos.lessThan(2))
  const isBottom = yPos.greaterThanEqual(2)

  // Start with center color
  let result = w5.rgb

  // Corner blending
  const blendCorner = (corner: TSLNode, adj1: TSLNode, adj2: TSLNode) =>
    eq(adj1, adj2).and(eq(w5, corner).not()).select(adj1.rgb.add(adj2.rgb).div(2).mix(w5.rgb, float(0.5)), w5.rgb)

  // Apply corner blending
  const topLeftResult = blendCorner(w1, w2, w4)
  const topRightResult = blendCorner(w3, w2, w6)
  const bottomLeftResult = blendCorner(w7, w4, w8)
  const bottomRightResult = blendCorner(w9, w6, w8)

  // Edge blending
  const topEdge = eq(w2, w5).not().select(w2.rgb.mix(w5.rgb, float(0.5)), w5.rgb)
  const bottomEdge = eq(w8, w5).not().select(w8.rgb.mix(w5.rgb, float(0.5)), w5.rgb)
  const leftEdge = eq(w4, w5).not().select(w4.rgb.mix(w5.rgb, float(0.5)), w5.rgb)
  const rightEdge = eq(w6, w5).not().select(w6.rgb.mix(w5.rgb, float(0.5)), w5.rgb)

  // Select based on position
  result = isTop.and(isLeft).select(topLeftResult, result)
  result = isTop.and(isCenter).select(topEdge, result)
  result = isTop.and(isRight).select(topRightResult, result)
  result = isMiddle.and(isLeft).select(leftEdge, result)
  result = isMiddle.and(isRight).select(rightEdge, result)
  result = isBottom.and(isLeft).select(bottomLeftResult, result)
  result = isBottom.and(isCenter).select(bottomEdge, result)
  result = isBottom.and(isRight).select(bottomRightResult, result)

  return vec4(result, w5.a)
}

/**
 * HQ4x-style upscaling (simplified).
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Source texel size
 * @param threshold - Color difference threshold
 * @returns Upscaled color
 */
export function hq4x(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 256, 1 / 256],
  threshold: FloatInput = 0.05
): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize
  const threshNode = typeof threshold === 'number' ? float(threshold) : threshold

  // For 4x scaling
  const srcPixel = floor(uv.div(texel.mul(0.25)))
  const srcUV = srcPixel.mul(texel.mul(0.25)).add(texel.mul(0.5))
  const localPos = uv.div(texel.mul(0.25)).sub(srcPixel)

  // Sample neighborhood
  const w1 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, -1))))
  const w2 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const w3 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, -1))))
  const w4 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const w5 = sampleTexture(tex, srcUV)
  const w6 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const w7 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 1))))
  const w8 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))
  const w9 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 1))))

  const diff = (a: TSLNode, b: TSLNode) => a.rgb.sub(b.rgb).length()
  const eq = (a: TSLNode, b: TSLNode) => diff(a, b).lessThan(threshNode)

  // Bilinear interpolation within subpixel
  const subX = localPos.x.mul(4).fract()
  const subY = localPos.y.mul(4).fract()

  // Determine quadrant (0-3 in each axis)
  const quadX = floor(localPos.x.mul(4)).div(2).floor()
  const quadY = floor(localPos.y.mul(4)).div(2).floor()

  // Get corner colors based on edge detection
  const topLeft = eq(w4, w2).select(w4.rgb.add(w2.rgb).mul(0.5), w5.rgb)
  const topRight = eq(w2, w6).select(w2.rgb.add(w6.rgb).mul(0.5), w5.rgb)
  const bottomLeft = eq(w4, w8).select(w4.rgb.add(w8.rgb).mul(0.5), w5.rgb)
  const bottomRight = eq(w6, w8).select(w6.rgb.add(w8.rgb).mul(0.5), w5.rgb)

  // Bilinear blend within quadrant
  const isRightQuad = quadX.greaterThan(0.5)
  const isBottomQuad = quadY.greaterThan(0.5)

  const topRow = topLeft.mix(topRight, subX)
  const bottomRow = bottomLeft.mix(bottomRight, subX)
  const result = topRow.mix(bottomRow, subY)

  // Adjust for quadrant position
  const finalResult = isBottomQuad.select(
    isRightQuad.select(bottomRight, bottomLeft),
    isRightQuad.select(topRight, topLeft)
  )

  // Blend toward center
  const blended = finalResult.mix(w5.rgb, float(0.3))

  return vec4(blended, w5.a)
}
