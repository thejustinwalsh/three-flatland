import { vec3, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, FloatInput } from '../types'

/**
 * Generate normals from a sprite's alpha channel, treating alpha as depth.
 * Useful for creating pseudo-3D lighting on flat sprites.
 * Edges get outward-facing normals, solid areas get forward-facing normals.
 *
 * @param spriteTex - Sprite texture with alpha channel
 * @param uv - UV coordinates to sample
 * @param strength - Normal strength for edges (default: 1)
 * @returns Normal vector in tangent space
 *
 * @example
 * // Generate normals from sprite alpha
 * const normals = normalFromSprite(spriteTexture, spriteUV)
 */
export function normalFromSprite(
  spriteTex: Texture,
  uv: TSLNode,
  strength: FloatInput = 1
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength

  const texelSize = float(1.0 / 256.0)

  // Sample alpha at neighboring pixels
  const alphaL = sampleTexture(spriteTex, uv.sub(vec3(texelSize, 0, 0).xy)).a
  const alphaR = sampleTexture(spriteTex, uv.add(vec3(texelSize, 0, 0).xy)).a
  const alphaD = sampleTexture(spriteTex, uv.sub(vec3(0, texelSize, 0).xy)).a
  const alphaU = sampleTexture(spriteTex, uv.add(vec3(0, texelSize, 0).xy)).a

  // Compute gradient from alpha differences
  const dx = alphaR.sub(alphaL).mul(strengthNode)
  const dy = alphaU.sub(alphaD).mul(strengthNode)

  return vec3(dx.negate(), dy.negate(), float(1)).normalize()
}

/**
 * Generate normals from a sprite with depth estimation based on distance from edges.
 * Creates a more rounded appearance by treating sprites as convex shapes.
 *
 * @param spriteTex - Sprite texture with alpha channel
 * @param uv - UV coordinates
 * @param strength - Normal strength (default: 1)
 * @param curvature - How much to curve edges inward (default: 0.5)
 * @returns Normal vector with curved edge effect
 */
export function normalFromSpriteRounded(
  spriteTex: Texture,
  uv: TSLNode,
  strength: FloatInput = 1,
  curvature: FloatInput = 0.5
): TSLNode {
  const strengthNode = typeof strength === 'number' ? float(strength) : strength
  const curvatureNode = typeof curvature === 'number' ? float(curvature) : curvature

  const texelSize = float(1.0 / 256.0)

  // Sample alpha at cardinal directions
  const alphaC = sampleTexture(spriteTex, uv).a
  const alphaL = sampleTexture(spriteTex, uv.sub(vec3(texelSize, 0, 0).xy)).a
  const alphaR = sampleTexture(spriteTex, uv.add(vec3(texelSize, 0, 0).xy)).a
  const alphaD = sampleTexture(spriteTex, uv.sub(vec3(0, texelSize, 0).xy)).a
  const alphaU = sampleTexture(spriteTex, uv.add(vec3(0, texelSize, 0).xy)).a

  // Compute gradient
  const dx = alphaR.sub(alphaL).mul(strengthNode)
  const dy = alphaU.sub(alphaD).mul(strengthNode)

  // Estimate depth as average of neighboring alphas (simple edge detection)
  const edgeFactor = float(1).sub(alphaC.mul(curvatureNode))
  const adjustedDx = dx.mul(edgeFactor.add(curvatureNode))
  const adjustedDy = dy.mul(edgeFactor.add(curvatureNode))

  return vec3(adjustedDx.negate(), adjustedDy.negate(), float(1)).normalize()
}
