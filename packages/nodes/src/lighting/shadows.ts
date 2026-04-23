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
 * Sphere-trace a 2D hard shadow ray through an SDF texture.
 *
 * Walks along the line from the shaded surface point toward the light,
 * sampling the SDF at each step to advance by the guaranteed-clear
 * distance. Binary result: `0` if the ray hits an occluder along the
 * way, `1` if it reaches the light cleanly. Soft shadow edges come
 * from (a) LinearFilter sampling of the SDF texture and (b) the
 * separable gaussian blur applied in `SDFGenerator` — not from a
 * per-ray penumbra integration.
 *
 * The classic IQ penumbra term `min(k · h / t)` was removed because
 * it accumulates at every step of the walk, which in closed 2D scenes
 * (dungeons, corridors — casters scattered everywhere) produces a
 * uniform global darkening: every ray walks near *something*, so
 * `h/t` always drops below 1 somewhere, `shadow` always ends below 1,
 * and `shadowStrength` linearly amplifies that scene-wide. The
 * `softness` option is retained for API stability (now ignored); a
 * future PCSS-style two-phase trace could reintroduce real
 * distance-aware penumbra widening without the false-proximity issue.
 *
 * The SDF texture is assumed to be produced by `SDFGenerator` and
 * encodes SIGNED **world-space** distance on the `.r` channel — negative
 * inside occluders, positive outside. Signed distance lets the trace
 * detect "stepped into an occluder" mid-walk without needing the
 * hardcoded caster-escape offset the unsigned variant required. World-
 * space distances keep the sphere-trace isotropic on non-square
 * viewports. `worldSize` / `worldOffset` are still consumed here to
 * transform the fragment/ray world position into the SDF's UV space for
 * sampling.
 *
 * @param surfaceWorldPos World-space position of the shaded fragment.
 * @param lightWorldPos   World-space position of the light.
 * @param sdfTexture      SDF texture captured at build time. Must come
 *                        from `SDFGenerator` (UV-space distances in .r).
 * @param worldSize       Camera frustum size (Node — uniform, updated
 *                        each frame from the camera bounds).
 * @param worldOffset     Camera frustum offset (Node — uniform).
 * @param options.steps   Compile-time loop count. Default 32.
 * @param options.softness Retained for API stability; currently ignored.
 *                         Soft edges come from SDF blur + linear sampling,
 *                         not per-ray integration. Will re-enable once a
 *                         PCSS-style trace lands.
 * @param options.eps     World-space hit threshold. Default 0.5.
 * @param options.fragmentCastsShadow
 *   When provided, gates the `nearCaster` escape path: the ray only
 *   skips past an occluder it's sitting on if THIS fragment is itself
 *   a shadow caster. Without this gate, a floor fragment that happens
 *   to lie under a sprite's rasterized silhouette (seeded in the SDF)
 *   would incorrectly escape and render as lit — leaving a bright
 *   alpha-blended halo wherever a sprite's anti-aliased edge overlaps
 *   the floor. Pass `readCastShadowFlag()` here from the caller's
 *   light shader.
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
    eps?: FloatInput
    fragmentCastsShadow?: Node<'bool'>
    /**
     * Maximum world-space distance from the receiver at which shadow
     * still applies. A ray that hits an occluder at `t = t_hit` has
     * its shadow scaled by `1 - t_hit / maxShadowDistance`, clamped to
     * [0, 1]. Default 0 means no distance falloff (shadow is binary at
     * every distance). Set >0 to hide point-light cone-fan artifacts
     * far from the caster — close-range shadows stay solid, long-range
     * shadows fade to lit.
     */
    maxShadowDistance?: FloatInput
  } = {}
): Node<'float'> {
  const steps = options.steps ?? 32
  // `options.softness` is accepted for API stability but currently unused —
  // binary hit/miss shadow, see function docstring.
  void options.softness
  const epsNode =
    typeof options.eps === 'number' ? float(options.eps) : (options.eps ?? float(0.5))
  const fragmentCastsShadow = options.fragmentCastsShadow
  const maxShadowDist =
    typeof options.maxShadowDistance === 'number'
      ? float(options.maxShadowDistance)
      : (options.maxShadowDistance ?? float(0))

  return Fn(() => {
    const toLight = lightWorldPos.sub(surfaceWorldPos)
    // `max` guards a light coincident with the surface (division by zero).
    const lightDist = toLight.length().max(float(0.0001))
    const dir = toLight.div(lightDist)

    // World-space position → SDF-texture UV. three.js's WebGPU screen
    // convention has UV y=0 at the TOP, but our world coords are Y-up
    // (worldPos.y increases upward). Flip y here so we sample the
    // post-process RT in its canonical convention — same flip pattern as
    // three.js's own `getScreenPosition` helper on WebGPU. Without this
    // the SDF sample row is mirrored across the viewport center and
    // shadows show up on the wrong side of their caster whenever a
    // caster isn't at Y=0.
    const worldToSDFUV = (wpos: Node<'vec2'>): Node<'vec2'> => {
      const u = wpos.sub(worldOffset).div(worldSize).clamp(0, 1)
      return vec2(u.x, float(1).sub(u.y))
    }

    // Self-shadow guard: if the SURFACE itself sits inside a caster
    // silhouette, the sphere trace will start at negative SDF and the
    // in-loop `sdf < 0` terminator (below) would immediately fire,
    // producing `shadow = 0` for every light regardless of whether
    // the ray actually reaches them. Typical cause: sprite fragments
    // for `castsShadow = true` sprites (hero, knights, slimes)
    // reading their own silhouette. Push the ray origin forward by a
    // caster-escape distance so the trace leaves the enclosing caster
    // before its first hit-test.
    //
    // Detection is now trivial with a signed SDF: `sdfAtSurface < 0`
    // means the fragment is strictly inside an occluder. No eps
    // approximation needed.
    //
    // IMPORTANT: the escape only applies to fragments that are themselves
    // shadow casters (`fragmentCastsShadow`). A non-caster fragment that
    // happens to lie under a seeded texel (floor drawn behind a sprite's
    // rasterized silhouette) must NOT escape — it should trace normally
    // and receive shadow from the overlapping caster. Skipping this gate
    // produces a bright alpha-blended halo at every sprite's anti-aliased
    // edge, because the floor under the edge is rendered lit and bleeds
    // through the semi-transparent sprite pixels.
    const surfaceUV = worldToSDFUV(surfaceWorldPos)
    const sdfAtSurface = sampleTexture(sdfTexture, surfaceUV).r
    const onCaster = sdfAtSurface.lessThan(float(0))
    const nearCaster = fragmentCastsShadow
      ? onCaster.and(fragmentCastsShadow)
      : onCaster
    const escapeOffset = float(40)
    const effectiveStart = nearCaster.select(escapeOffset, float(0))

    // `.toVar()` without an explicit name — TSL auto-generates unique
    // identifiers so we don't collide when multiple materials in the
    // same scene invoke this function and share a build namespace.
    const t = effectiveStart.toVar()
    const shadow = float(1).toVar()
    // Records t at the step where we hit, so we can compute distance-
    // based falloff after the loop if maxShadowDistance > 0.
    const hitT = float(0).toVar()

    Loop(steps, () => {
      // Reached-light check runs FIRST — lights mounted near walls (wall
      // torches) would otherwise trigger a spurious hit at `t ≈ lightDist`
      // when the final SDF sample lands at/near the wall the light is
      // attached to. If `t` has already walked to the light, break out
      // with `shadow = 1` regardless of what the SDF says at that point.
      If(t.greaterThanEqual(lightDist), () => {
        Break()
      })

      const pos = surfaceWorldPos.add(dir.mul(t))
      const uv = worldToSDFUV(pos)
      const sdfWorld = sampleTexture(sdfTexture, uv).r

      // Hit: the ray either entered an occluder (signed SDF < 0, which
      // can happen if the sphere-trace step size was rounded up to
      // `eps`) or grazed one within the epsilon tolerance. Either way,
      // the path to the light is blocked.
      If(sdfWorld.lessThan(epsNode), () => {
        shadow.assign(float(0))
        hitT.assign(t)
        Break()
      })

      // Advance by the clear distance, guarded against zero / negative
      // steps so the loop can't stall. The `max(eps)` floor is also the
      // safety net that keeps the trace from walking into an occluder
      // on the step following a near-miss grazing sample.
      t.assign(t.add(sdfWorld.max(epsNode)))
    })

    // Distance falloff — when maxShadowDistance > 0, scale the hit-shadow
    // by (1 - hitT/max) so close-range shadows stay solid and long-range
    // shadows fade to lit. Hides point-light cone-fan artifacts without
    // touching close-to-caster shadows. When maxShadowDistance == 0 this
    // term reduces to 1.0 and has no effect (binary shadow).
    const useFalloff = maxShadowDist.greaterThan(float(0))
    const falloff = float(1).sub(hitT.div(maxShadowDist.max(float(0.0001)))).clamp(0, 1)
    const falloffShadow = float(1).sub(float(1).sub(shadow).mul(falloff))
    const finalShadow = useFalloff.select(falloffShadow, shadow)

    return finalShadow.clamp(0, 1)
  })()
}
