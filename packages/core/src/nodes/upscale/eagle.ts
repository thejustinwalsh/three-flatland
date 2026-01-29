import { vec2, vec4, float, floor, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, Vec2Input } from '../types'

/**
 * Eagle pixel art upscaling algorithm.
 * Simple 2x upscaler that enhances diagonal lines.
 *
 * @param tex - Source texture (pixel art)
 * @param uv - UV coordinates
 * @param texelSize - Size of one texel in source texture
 * @returns Upscaled color
 *
 * @example
 * const upscaled = eagle(texture, uv, [1/256, 1/256])
 */
export function eagle(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 256, 1 / 256]
): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  // Source pixel position
  const srcPixel = floor(uv.div(texel.mul(0.5)))
  const srcUV = srcPixel.mul(0.5).mul(texel).add(texel.mul(0.25))

  // Position within 2x2 output
  const localPos = uv.div(texel.mul(0.5)).sub(srcPixel)

  // Sample 3x3 neighborhood
  // S T U
  // V C W
  // X Y Z
  const S = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, -1))))
  const T = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const U = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, -1))))
  const V = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const C = sampleTexture(tex, srcUV)
  const W = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const X = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 1))))
  const Y = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))
  const Z = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 1))))

  // Color equality check
  const eq = (a: TSLNode, b: TSLNode) => a.rgb.sub(b.rgb).length().lessThan(0.01)

  // Eagle algorithm:
  // If S == T == V, then pixel 1 = S
  // If T == U == W, then pixel 2 = U
  // If V == X == Y, then pixel 3 = X
  // If W == Z == Y, then pixel 4 = Z
  // Otherwise, pixel = C

  const isRight = localPos.x.greaterThan(0.5)
  const isBottom = localPos.y.greaterThan(0.5)

  // Top-left: if S == T == V
  const p1 = eq(S, T).and(eq(T, V)).select(S, C)
  // Top-right: if T == U == W
  const p2 = eq(T, U).and(eq(U, W)).select(U, C)
  // Bottom-left: if V == X == Y
  const p3 = eq(V, X).and(eq(X, Y)).select(X, C)
  // Bottom-right: if W == Z == Y
  const p4 = eq(W, Z).and(eq(Z, Y)).select(Z, C)

  // Select based on position
  const topRow = isRight.select(p2, p1)
  const bottomRow = isRight.select(p4, p3)
  const result = isBottom.select(bottomRow, topRow)

  return result
}

/**
 * SuperEagle - enhanced Eagle algorithm.
 * Better diagonal handling and smoother results.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Source texel size
 * @returns Upscaled color
 */
export function superEagle(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 256, 1 / 256]
): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  const srcPixel = floor(uv.div(texel.mul(0.5)))
  const srcUV = srcPixel.mul(0.5).mul(texel).add(texel.mul(0.25))
  const localPos = uv.div(texel.mul(0.5)).sub(srcPixel)

  // Extended neighborhood for SuperEagle
  const c0 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, -1))))
  const c1 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, -1))))
  const c2 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, -1))))
  const c3 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 0))))
  const c4 = sampleTexture(tex, srcUV)
  const c5 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 0))))
  const c6 = sampleTexture(tex, srcUV.add(texel.mul(vec2(-1, 1))))
  const c7 = sampleTexture(tex, srcUV.add(texel.mul(vec2(0, 1))))
  const c8 = sampleTexture(tex, srcUV.add(texel.mul(vec2(1, 1))))

  const eq = (a: TSLNode, b: TSLNode) => a.rgb.sub(b.rgb).length().lessThan(0.01)

  const isRight = localPos.x.greaterThan(0.5)
  const isBottom = localPos.y.greaterThan(0.5)

  // SuperEagle blends more aggressively at diagonals
  const diag1 = eq(c0, c4).and(eq(c4, c8)) // Main diagonal
  const diag2 = eq(c2, c4).and(eq(c4, c6)) // Anti-diagonal

  // Blend based on diagonal detection
  const blendTopLeft = eq(c0, c1).and(eq(c1, c3)).select(c0, c4)
  const blendTopRight = eq(c1, c2).and(eq(c2, c5)).select(c2, c4)
  const blendBottomLeft = eq(c3, c6).and(eq(c6, c7)).select(c6, c4)
  const blendBottomRight = eq(c5, c7).and(eq(c7, c8)).select(c8, c4)

  const topRow = isRight.select(blendTopRight, blendTopLeft)
  const bottomRow = isRight.select(blendBottomRight, blendBottomLeft)

  return isBottom.select(bottomRow, topRow)
}

/**
 * 2xSaI (2x Scale and Interpolation) algorithm.
 * Advanced pixel art scaler with smooth interpolation.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Source texel size
 * @returns Upscaled color
 */
export function sai2x(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 256, 1 / 256]
): TSLNode {
  const texel = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  const srcPixel = floor(uv.div(texel.mul(0.5)))
  const srcUV = srcPixel.mul(0.5).mul(texel).add(texel.mul(0.25))
  const localPos = uv.div(texel.mul(0.5)).sub(srcPixel)

  // Sample 4x4 for 2xSaI
  const getPixel = (ox: number, oy: number) =>
    sampleTexture(tex, srcUV.add(texel.mul(vec2(ox, oy))))

  const I = getPixel(-1, -1)
  const E = getPixel(0, -1)
  const F = getPixel(1, -1)
  const J = getPixel(2, -1)
  const G = getPixel(-1, 0)
  const A = getPixel(0, 0)
  const B = getPixel(1, 0)
  const K = getPixel(2, 0)
  const H = getPixel(-1, 1)
  const C = getPixel(0, 1)
  const D = getPixel(1, 1)
  const L = getPixel(2, 1)
  const M = getPixel(-1, 2)
  const N = getPixel(0, 2)
  const O = getPixel(1, 2)
  const P = getPixel(2, 2)

  const eq = (a: TSLNode, b: TSLNode) => a.rgb.sub(b.rgb).length().lessThan(0.01)

  const isRight = localPos.x.greaterThan(0.5)
  const isBottom = localPos.y.greaterThan(0.5)

  // Simplified 2xSaI - uses edge detection for blending decisions
  const AeqD = eq(A, D)
  const BeqC = eq(B, C)

  // Main pixel selection with diagonal preference
  const preferAD = AeqD.and(BeqC.not())
  const preferBC = BeqC.and(AeqD.not())

  // Select corners
  const topLeft = A
  const topRight = preferBC.select(B.rgb.add(A.rgb).mul(0.5), B)
  const bottomLeft = preferBC.select(C.rgb.add(A.rgb).mul(0.5), C)
  const bottomRight = AeqD.and(BeqC).select(
    A.rgb.add(B.rgb).add(C.rgb).add(D.rgb).mul(0.25),
    preferAD.select(
      A.rgb.add(D.rgb).mul(0.5),
      preferBC.select(B.rgb.add(C.rgb).mul(0.5), A)
    )
  )

  const topRow = isRight.select(vec4(topRight, A.a), topLeft)
  const bottomRow = isRight.select(vec4(bottomRight, A.a), vec4(bottomLeft, A.a))

  return isBottom.select(bottomRow, topRow)
}
