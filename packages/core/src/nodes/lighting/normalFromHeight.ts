import { vec3, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput, Vec2Input } from '../types'

/**
 * Generate a normal map from a heightmap texture.
 * Uses Sobel-like sampling to compute surface normals from grayscale height data.
 *
 * @param heightTex - Heightmap texture (grayscale, white = high, black = low)
 * @param uv - UV coordinates to sample
 * @param strength - Normal strength multiplier (default: 1)
 * @param texelSize - Size of one texel in UV space, or calculated from texture dimensions
 * @returns Normal vector in tangent space (vec3, -1 to 1 range)
 *
 * @example
 * // Generate normals from heightmap
 * const normals = normalFromHeight(heightmap, spriteUV, 2.0)
 */
export function normalFromHeight(
  heightTex: Texture,
  uv: TSLNode,
  strength: FloatInput = 1,
  texelSize?: Vec2Input
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  // Default texel size based on common sprite sizes (1/256)
  const texelVec = texelSize
    ? Array.isArray(texelSize)
      ? vec3(texelSize[0], texelSize[1], 0)
      : texelSize
    : vec3(1.0 / 256.0, 1.0 / 256.0, 0)

  const texelX = texelVec.x
  const texelY = texelVec.y

  // Sample heights at neighboring pixels (3x3 Sobel pattern)
  const heightL = sampleTexture(heightTex, uv.sub(vec3(texelX, 0, 0).xy)).r
  const heightR = sampleTexture(heightTex, uv.add(vec3(texelX, 0, 0).xy)).r
  const heightD = sampleTexture(heightTex, uv.sub(vec3(0, texelY, 0).xy)).r
  const heightU = sampleTexture(heightTex, uv.add(vec3(0, texelY, 0).xy)).r

  // Compute gradient using central differences
  const dx = heightR.sub(heightL).mul(strengthNode)
  const dy = heightU.sub(heightD).mul(strengthNode)

  // Construct normal from gradient (tangent space: X right, Y up, Z out)
  const normal = vec3(dx.negate(), dy.negate(), float(1)).normalize()

  return normal
}

/**
 * Generate a normal map from a heightmap with adjustable detail.
 * Uses a larger sampling kernel for smoother normals.
 *
 * @param heightTex - Heightmap texture
 * @param uv - UV coordinates
 * @param strength - Normal strength multiplier
 * @param scale - Sampling scale (higher = smoother but less detail)
 * @returns Normal vector in tangent space
 */
export function normalFromHeightSmooth(
  heightTex: Texture,
  uv: TSLNode,
  strength: FloatInput = 1,
  scale: FloatInput = 2
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const scaleNode = typeof scale === 'number' ? float(scale) : scale

  const texelSize = float(1.0 / 256.0).mul(scaleNode)

  // Sample at larger offsets for smoother normals
  const heightL = sampleTexture(heightTex, uv.sub(vec3(texelSize, 0, 0).xy)).r
  const heightR = sampleTexture(heightTex, uv.add(vec3(texelSize, 0, 0).xy)).r
  const heightD = sampleTexture(heightTex, uv.sub(vec3(0, texelSize, 0).xy)).r
  const heightU = sampleTexture(heightTex, uv.add(vec3(0, texelSize, 0).xy)).r

  const dx = heightR.sub(heightL).mul(strengthNode)
  const dy = heightU.sub(heightD).mul(strengthNode)

  return vec3(dx.negate(), dy.negate(), float(1)).normalize()
}
