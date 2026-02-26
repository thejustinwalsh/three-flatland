import { vec2, vec3, vec4, float, texture as sampleTexture } from 'three/tsl'
import type { Texture } from 'three'
import type { TSLNode, Vec2Input, Vec3Input, FloatInput } from '../types'

/**
 * Create a drop shadow effect.
 * Samples the sprite's alpha at an offset position to create shadow.
 *
 * @param spriteTex - Source sprite texture
 * @param uv - Current UV coordinates
 * @param shadowOffset - Shadow offset in UV space (default: [0.02, -0.02])
 * @param shadowColor - Shadow color (default: [0, 0, 0])
 * @param shadowAlpha - Shadow opacity (default: 0.5)
 * @returns Shadow color with alpha (vec4), composite with original
 *
 * @example
 * // Create shadow behind sprite
 * const shadow = shadowDrop(texture, uv, [0.03, -0.03], [0, 0, 0], 0.4)
 * // Mix: show shadow where sprite alpha is 0, original where alpha is 1
 */
export function shadowDrop(
  spriteTex: Texture,
  uv: TSLNode,
  shadowOffset: Vec2Input = [0.02, -0.02],
  shadowColor: Vec3Input = [0, 0, 0],
  shadowAlpha: FloatInput = 0.5
): TSLNode {
  const offsetVec = Array.isArray(shadowOffset) ? vec2(...shadowOffset) : shadowOffset
  const colorVec = Array.isArray(shadowColor) ? vec3(...shadowColor) : shadowColor
  const alphaNode = typeof shadowAlpha === 'number' ? float(shadowAlpha) : shadowAlpha

  // Sample at shadow offset position
  const shadowUV = uv.add(offsetVec)
  const shadowSample = sampleTexture(spriteTex, shadowUV)

  // Shadow alpha is based on the source sprite's alpha at offset
  const shadow = vec4(colorVec, shadowSample.a.mul(alphaNode))

  return shadow
}

/**
 * Create a soft drop shadow with blur.
 * Samples multiple offset positions to create a softer shadow.
 *
 * @param spriteTex - Source sprite texture
 * @param uv - Current UV coordinates
 * @param shadowOffset - Shadow offset in UV space
 * @param shadowColor - Shadow color
 * @param shadowAlpha - Shadow opacity
 * @param softness - Blur amount in UV space (default: 0.01)
 * @param samples - Number of blur samples (default: 4)
 * @returns Soft shadow color with alpha
 */
export function shadowDropSoft(
  spriteTex: Texture,
  uv: TSLNode,
  shadowOffset: Vec2Input = [0.02, -0.02],
  shadowColor: Vec3Input = [0, 0, 0],
  shadowAlpha: FloatInput = 0.5,
  softness: FloatInput = 0.01,
  samples: number = 4
): TSLNode {
  const offsetVec = Array.isArray(shadowOffset) ? vec2(...shadowOffset) : shadowOffset
  const colorVec = Array.isArray(shadowColor) ? vec3(...shadowColor) : shadowColor
  const alphaNode = typeof shadowAlpha === 'number' ? float(shadowAlpha) : shadowAlpha
  const softnessNode = typeof softness === 'number' ? float(softness) : softness

  const shadowUV = uv.add(offsetVec)

  // Sample in a pattern for soft edges
  const offsets = [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ]

  // Take requested number of samples
  const actualSamples = Math.min(samples, offsets.length)
  let totalAlpha: TSLNode = float(0)

  for (let i = 0; i < actualSamples; i++) {
    const [ox, oy] = offsets[i]!
    const sampleOffset = vec2(ox, oy).mul(softnessNode)
    const sample = sampleTexture(spriteTex, shadowUV.add(sampleOffset))
    totalAlpha = totalAlpha.add(sample.a)
  }

  const avgAlpha = totalAlpha.div(float(actualSamples))
  return vec4(colorVec, avgAlpha.mul(alphaNode))
}

/**
 * Calculate hard 2D shadow from a light source.
 * Checks if a point is in shadow by sampling an occluder texture.
 *
 * @param position - World/screen position of the surface
 * @param lightPos - Position of the light source
 * @param occluderTex - Texture containing occluder data (alpha channel)
 * @param occluderSize - Size of the occluder texture in world units
 * @param shadowStrength - Shadow intensity (default: 0.7)
 * @returns Shadow factor (0 = full shadow, 1 = no shadow)
 *
 * @example
 * const shadow = shadow2D(fragPos, lightPos, occluderMap, [512, 512])
 * finalColor = finalColor.mul(shadow)
 */
export function shadow2D(
  position: TSLNode | Vec2Input,
  lightPos: Vec2Input,
  occluderTex: Texture,
  occluderSize: Vec2Input,
  shadowStrength: FloatInput = 0.7
): TSLNode {
  const posVec = Array.isArray(position) ? vec2(...position) : position
  const lightVec = Array.isArray(lightPos) ? vec2(...lightPos) : lightPos
  const sizeVec = Array.isArray(occluderSize) ? vec2(...occluderSize) : occluderSize
  const strengthNode = typeof shadowStrength === 'number' ? float(shadowStrength) : shadowStrength

  // Direction and distance to light
  const toLight = lightVec.sub(posVec)
  const dist = toLight.length()

  // Sample along ray to light for occlusion
  const steps = 8
  let shadow: TSLNode = float(1)

  for (let i = 1; i <= steps; i++) {
    const t = float(i / steps)
    const samplePos = posVec.add(toLight.mul(t))
    const sampleUV = samplePos.div(sizeVec).add(0.5)
    const occluder = sampleTexture(occluderTex, sampleUV).a
    shadow = shadow.mul(float(1).sub(occluder.mul(strengthNode)))
  }

  return shadow.clamp(float(1).sub(strengthNode), 1)
}

/**
 * Calculate soft 2D shadow with penumbra.
 * Samples multiple rays for a softer shadow edge.
 *
 * @param position - World/screen position of the surface
 * @param lightPos - Position of the light source
 * @param occluderTex - Texture containing occluder data
 * @param occluderSize - Size of the occluder texture in world units
 * @param lightRadius - Radius of the light source for soft shadows
 * @param shadowStrength - Shadow intensity
 * @returns Soft shadow factor
 */
export function shadowSoft2D(
  position: TSLNode | Vec2Input,
  lightPos: Vec2Input,
  occluderTex: Texture,
  occluderSize: Vec2Input,
  lightRadius: FloatInput = 10,
  shadowStrength: FloatInput = 0.7
): TSLNode {
  const posVec = Array.isArray(position) ? vec2(...position) : position
  const lightVec = Array.isArray(lightPos) ? vec2(...lightPos) : lightPos
  const sizeVec = Array.isArray(occluderSize) ? vec2(...occluderSize) : occluderSize
  const radiusNode = typeof lightRadius === 'number' ? float(lightRadius) : lightRadius
  const strengthNode = typeof shadowStrength === 'number' ? float(shadowStrength) : shadowStrength

  // Sample multiple light positions for soft penumbra
  const lightOffsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  let totalShadow: TSLNode = float(0)

  for (const [ox, oy] of lightOffsets) {
    const offsetLight = lightVec.add(vec2(ox, oy).mul(radiusNode))
    const toLight = offsetLight.sub(posVec)

    let shadow: TSLNode = float(1)
    const steps = 4

    for (let i = 1; i <= steps; i++) {
      const t = float(i / steps)
      const samplePos = posVec.add(toLight.mul(t))
      const sampleUV = samplePos.div(sizeVec).add(0.5)
      const occluder = sampleTexture(occluderTex, sampleUV).a
      shadow = shadow.mul(float(1).sub(occluder.mul(strengthNode)))
    }

    totalShadow = totalShadow.add(shadow)
  }

  return totalShadow.div(float(lightOffsets.length)).clamp(float(1).sub(strengthNode), 1)
}
