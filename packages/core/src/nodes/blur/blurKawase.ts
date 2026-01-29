import { vec2, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Kawase blur - fast, iterative blur technique.
 * Used in many games for efficient bloom/blur effects.
 * Each iteration doubles the effective blur radius.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param offset - Current iteration offset (increases each pass)
 * @param texelSize - Size of one texel in UV space
 * @returns Blurred color for this iteration
 *
 * @example
 * // Multi-pass Kawase blur
 * let blurred = blurKawase(texture, uv, 0, [1/width, 1/height])
 * blurred = blurKawase(blurred, uv, 1, [1/width, 1/height])
 * blurred = blurKawase(blurred, uv, 2, [1/width, 1/height])
 */
export function blurKawase(
  tex: Texture,
  uv: TSLNode,
  offset: FloatInput = 0,
  texelSize: Vec2Input = [1 / 512, 1 / 512]
): TSLNode {
  const offsetNode = typeof offset === 'number' ? float(offset) : offset
  const texelVec = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  // Kawase uses half-texel offsets for bilinear filtering
  const halfTexel = texelVec.mul(0.5)
  const sampleOffset = texelVec.mul(offsetNode).add(halfTexel)

  // Sample 4 corners
  const tl = sampleTexture(tex, uv.add(sampleOffset.mul(vec2(-1, -1))))
  const tr = sampleTexture(tex, uv.add(sampleOffset.mul(vec2(1, -1))))
  const bl = sampleTexture(tex, uv.add(sampleOffset.mul(vec2(-1, 1))))
  const br = sampleTexture(tex, uv.add(sampleOffset.mul(vec2(1, 1))))

  return tl.add(tr).add(bl).add(br).div(4)
}

/**
 * Single-pass approximation of multi-iteration Kawase blur.
 * Samples at multiple offsets in one pass.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param radius - Blur radius
 * @param texelSize - Texel size
 * @returns Blurred color
 */
export function blurKawaseSimple(
  tex: Texture,
  uv: TSLNode,
  radius: FloatInput = 2,
  texelSize: Vec2Input = [1 / 512, 1 / 512]
): TSLNode {
  const radiusNode = typeof radius === 'number' ? float(radius) : radius
  const texelVec = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  const offset = texelVec.mul(radiusNode)

  // Center sample
  let result: TSLNode = sampleTexture(tex, uv).mul(4)

  // 4 diagonal samples
  result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(-1, -1)))))
  result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(1, -1)))))
  result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(-1, 1)))))
  result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(1, 1)))))

  return result.div(8)
}

/**
 * Dual Kawase blur downscale pass.
 * Used in dual-filter blur approach for efficient large blurs.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Texel size at current resolution
 * @returns Downscaled blurred color
 */
export function blurKawaseDown(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 512, 1 / 512]
): TSLNode {
  const texelVec = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  const halfTexel = texelVec.mul(0.5)

  // Center with weight 4
  let result: TSLNode = sampleTexture(tex, uv).mul(4)

  // 4 samples at half-texel offsets
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(-1, -1)))))
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(1, -1)))))
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(-1, 1)))))
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(1, 1)))))

  return result.div(8)
}

/**
 * Dual Kawase blur upscale pass.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param texelSize - Texel size at current resolution
 * @returns Upscaled blurred color
 */
export function blurKawaseUp(
  tex: Texture,
  uv: TSLNode,
  texelSize: Vec2Input = [1 / 512, 1 / 512]
): TSLNode {
  const texelVec = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  const halfTexel = texelVec.mul(0.5)

  // 4 samples at half-texel with weight 2 each
  let result: TSLNode = sampleTexture(tex, uv.add(halfTexel.mul(vec2(-1, -1)))).mul(2)
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(1, -1)))).mul(2))
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(-1, 1)))).mul(2))
  result = result.add(sampleTexture(tex, uv.add(halfTexel.mul(vec2(1, 1)))).mul(2))

  // 4 samples at full texel with weight 1 each
  result = result.add(sampleTexture(tex, uv.add(texelVec.mul(vec2(-1, 0)))))
  result = result.add(sampleTexture(tex, uv.add(texelVec.mul(vec2(1, 0)))))
  result = result.add(sampleTexture(tex, uv.add(texelVec.mul(vec2(0, -1)))))
  result = result.add(sampleTexture(tex, uv.add(texelVec.mul(vec2(0, 1)))))

  return result.div(12)
}

/**
 * Multi-iteration Kawase blur in a single pass (approximation).
 * Useful when multiple render passes aren't available.
 *
 * @param tex - Source texture
 * @param uv - UV coordinates
 * @param iterations - Number of blur iterations to simulate
 * @param texelSize - Texel size
 * @returns Blurred color
 */
export function blurKawaseMulti(
  tex: Texture,
  uv: TSLNode,
  iterations: number = 3,
  texelSize: Vec2Input = [1 / 512, 1 / 512]
): TSLNode {
  const texelVec = Array.isArray(texelSize) ? vec2(...texelSize) : texelSize

  let result: TSLNode = sampleTexture(tex, uv)
  let totalWeight: TSLNode = float(1)

  // Sample at increasing offsets to simulate iterations
  for (let i = 0; i < iterations; i++) {
    const offset = texelVec.mul(float(1 << i)) // 1, 2, 4, 8...

    const weight = float(1 / (i + 2))

    result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(-1, -1)))).mul(weight))
    result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(1, -1)))).mul(weight))
    result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(-1, 1)))).mul(weight))
    result = result.add(sampleTexture(tex, uv.add(offset.mul(vec2(1, 1)))).mul(weight))

    totalWeight = totalWeight.add(weight.mul(4))
  }

  return result.div(totalWeight)
}
