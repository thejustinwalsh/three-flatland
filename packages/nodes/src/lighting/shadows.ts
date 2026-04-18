import {
  vec2,
  vec3,
  vec4,
  float,
  Fn,
  Loop,
  If,
  Break,
  texture as sampleTexture,
} from 'three/tsl'
import type { Texture } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { Vec2Input, Vec3Input, FloatInput } from '../types'

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
  uv: Node<'vec2'>,
  shadowOffset: Vec2Input = [0.02, -0.02],
  shadowColor: Vec3Input = [0, 0, 0],
  shadowAlpha: FloatInput = 0.5
): Node<'vec4'> {
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
  uv: Node<'vec2'>,
  shadowOffset: Vec2Input = [0.02, -0.02],
  shadowColor: Vec3Input = [0, 0, 0],
  shadowAlpha: FloatInput = 0.5,
  softness: FloatInput = 0.01,
  samples: number = 4
): Node<'vec4'> {
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
  let totalAlpha: Node<'float'> = float(0)

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
  position: Node<'vec2'> | Vec2Input,
  lightPos: Vec2Input,
  occluderTex: Texture,
  occluderSize: Vec2Input,
  shadowStrength: FloatInput = 0.7
): Node<'float'> {
  const posVec = Array.isArray(position) ? vec2(...position) : position
  const lightVec = Array.isArray(lightPos) ? vec2(...lightPos) : lightPos
  const sizeVec = Array.isArray(occluderSize) ? vec2(...occluderSize) : occluderSize
  const strengthNode = typeof shadowStrength === 'number' ? float(shadowStrength) : shadowStrength

  // Direction to light
  const toLight = lightVec.sub(posVec)

  // Sample along ray to light for occlusion
  const steps = 8
  let shadow: Node<'float'> = float(1)

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
  position: Node<'vec2'> | Vec2Input,
  lightPos: Vec2Input,
  occluderTex: Texture,
  occluderSize: Vec2Input,
  lightRadius: FloatInput = 10,
  shadowStrength: FloatInput = 0.7
): Node<'float'> {
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

  let totalShadow: Node<'float'> = float(0)

  for (const [ox, oy] of lightOffsets) {
    const offsetLight = lightVec.add(vec2(ox, oy).mul(radiusNode))
    const toLight = offsetLight.sub(posVec)

    let shadow: Node<'float'> = float(1)
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

/**
 * Sphere-trace a 2D soft shadow ray through an SDF texture.
 *
 * Walks along the line from the shaded surface point toward the light,
 * sampling the SDF at each step to advance by the guaranteed-clear
 * distance. If the trace ever collapses below an epsilon the ray has
 * hit an occluder (shadowed); if the trace reaches the light distance
 * the ray is clear (lit). A running penumbra term tracks the minimum
 * `(32 / softness) * d / t` across the walk for Inigo-Quilez-style
 * soft shadows — the parameter is inverted vs the raw IQ `k` so the
 * name matches intuition: LOW softness → sharp/hard edge, HIGH softness
 * → wide diffuse penumbra. The constant 32 matches IQ's canonical
 * "hard" default when softness = 1.
 *
 * The SDF texture is assumed to be produced by `SDFGenerator` and
 * encode distance in UV-space units on the `.r` channel. Conversion to
 * world-space distance uses an isotropic scene-size approximation
 * (`(worldSize.x + worldSize.y) * 0.5`). For non-square worlds this
 * introduces slight directional error in the trace step size — fine
 * for typical 2D scenes; revisit if a consumer needs anisotropic
 * correctness.
 *
 * @param surfaceWorldPos World-space position of the shaded fragment.
 * @param lightWorldPos   World-space position of the light.
 * @param sdfTexture      SDF texture captured at build time. Must come
 *                        from `SDFGenerator` (UV-space distances in .r).
 * @param worldSize       Camera frustum size (Node — uniform, updated
 *                        each frame from the camera bounds).
 * @param worldOffset     Camera frustum offset (Node — uniform).
 * @param options.steps   Compile-time loop count. Default 32.
 * @param options.softness Penumbra width — higher = softer / wider. Low
 *                         values (1-2) give hard IQ-style edges; high
 *                         values (16-48) give diffuse penumbras. Default 8.
 * @param options.startOffset Initial world-space offset along the ray
 *                            to skip self-shadow on the caster itself.
 *                            Default 0.5.
 * @param options.eps     World-space hit threshold. Default 0.5.
 * @returns Node<'float'> in [0, 1]. 0 = fully shadowed, 1 = fully lit.
 */
export function shadowSDF2D(
  surfaceWorldPos: Node<'vec2'>,
  lightWorldPos: Node<'vec2'>,
  sdfTexture: Texture,
  worldSize: Node<'vec2'>,
  worldOffset: Node<'vec2'>,
  options: {
    steps?: number
    softness?: FloatInput
    startOffset?: FloatInput
    eps?: FloatInput
  } = {}
): Node<'float'> {
  const steps = options.steps ?? 32
  const softness =
    typeof options.softness === 'number'
      ? float(options.softness)
      : (options.softness ?? float(8))
  const startOffset =
    typeof options.startOffset === 'number'
      ? float(options.startOffset)
      : (options.startOffset ?? float(0.5))
  const epsNode =
    typeof options.eps === 'number' ? float(options.eps) : (options.eps ?? float(0.5))

  return Fn(() => {
    const toLight = lightWorldPos.sub(surfaceWorldPos)
    // `max` guards a light coincident with the surface (division by zero).
    const lightDist = toLight.length().max(float(0.0001))
    const dir = toLight.div(lightDist)

    // Isotropic UV → world scale. The SDF encodes distance in UV space
    // (0..1 across the camera-aligned RT); world distance is the average
    // of the frustum extents.
    const worldScale = worldSize.x.add(worldSize.y).mul(float(0.5))

    const t = startOffset.toVar('shadowT')
    const shadow = float(1).toVar('shadow')

    Loop(steps, () => {
      const pos = surfaceWorldPos.add(dir.mul(t))
      const uv = pos.sub(worldOffset).div(worldSize)
      const sdfSample = sampleTexture(sdfTexture, uv).r
      const sdfWorld = sdfSample.mul(worldScale)

      // Penumbra accumulation — running min of (32/softness) * d / t
      // produces the IQ-style soft shadow term with the user-facing
      // parameter *inverted* so higher softness → wider penumbra. The
      // constant 32 matches IQ's "hard shadow" default when softness = 1.
      const penumbra = float(32).mul(sdfWorld).div(softness.mul(t)).clamp(0, 1)
      shadow.assign(shadow.min(penumbra))

      // Hit: the ray came within epsilon of an occluder.
      If(sdfWorld.lessThan(epsNode), () => {
        shadow.assign(float(0))
        Break()
      })

      // Clear: reached the light without hitting anything — the
      // accumulated penumbra is the final shadow value.
      If(t.greaterThan(lightDist), () => {
        Break()
      })

      // Advance by the clear distance, guarded against zero steps so the
      // loop can't stall when the trace grazes an occluder.
      t.assign(t.add(sdfWorld.max(epsNode)))
    })

    return shadow.clamp(0, 1)
  })()
}
