import { Vector2 } from 'three'
import {
  vec2,
  vec3,
  vec4,
  float,
  int,
  Fn,
  Loop,
  If,
  Break,
  texture as sampleTexture,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  createLightEffect,
  ForwardPlusLighting,
  MAX_LIGHTS_PER_TILE,
  TILE_SIZE,
  readCastShadowFlag,
} from 'three-flatland'
import type { Light2D } from 'three-flatland'
import { shadowSDF2D } from '@three-flatland/nodes/lighting'

/**
 * Default lighting with Forward+ tiling: per-tile light culling gives
 * O(lights_per_tile) per fragment instead of O(total_lights).
 *
 * Full feature set:
 * - Point, spot, directional, and ambient light types
 * - Configurable attenuation (distance, decay)
 * - Normal-based directional diffuse shading (when normal channel is provided)
 * - Optional discrete banding (cel-shading)
 * - Optional pixel-snapping for retro aesthetics
 * - Optional glow (broad secondary falloff)
 * - Optional rim lighting (edge highlights from light direction)
 * - Shadow uniforms (SDF shadow marching placeholder)
 *
 * @example
 * ```typescript
 * import { DefaultLightEffect } from '@three-flatland/presets'
 *
 * const lighting = new DefaultLightEffect()
 * flatland.setLighting(lighting)
 * lighting.bands = 4 // cel-shading
 * ```
 */
export const DefaultLightEffect = createLightEffect({
  name: 'defaultLight',
  schema: {
    // Uniforms (runtime-settable, TSL nodes)
    shadowStrength: 0.6,
    shadowSoftness: 8.0,
    // Hit epsilon (world units) — SDF sample values below this count as
    // an occluder strike, terminating the trace.
    shadowBias: 0.5,
    // Max world-space distance a shadow is allowed to extend from the
    // receiver before fading to lit. 0 disables falloff (binary shadow at
    // any distance). Typical values: 100-300 world units — enough to keep
    // near-caster shadows solid while hiding cone-fan artifacts far away
    // from the caster.
    shadowMaxDistance: 0,
    // Debug view mode — picks what to render instead of normal lighting.
    // Each mode bypasses the sprite-color multiplication so the output
    // is a pure diagnostic image.
    //   0 = normal rendering (default)
    //   1 = average shadow mask across tile lights (white=lit, black=blocked)
    //   2 = direct light only, NO shadows (every trace returns 1, no ambient)
    //   3 = direct light only, WITH shadows (per-light trace applied, no ambient)
    //   4 = SDF sample at surface — green = positive (outside caster),
    //       red = negative (inside caster), brightness = magnitude
    //   5 = tile light count as grayscale (black = 0 lights, white = 16 lights)
    shadowDebug: 0,
    bands: 8,
    pixelSize: 0,
    glowRadius: 0,
    glowIntensity: 0,
    lightHeight: 0.75,
    rimIntensity: 0,
    rimPower: 2,
    // Constants (per-instance, read-only reference, mutable internals)
    forwardPlus: () => new ForwardPlusLighting(),
  } as const,
  needsShadows: true,
  requires: ['normal'] as const,
  light: ({ uniforms, constants, lightStore, sdfTexture, worldSizeNode, worldOffsetNode }) => {
    const shadowStrength = uniforms.shadowStrength
    const shadowSoftness = uniforms.shadowSoftness
    const shadowBias = uniforms.shadowBias
    const shadowMaxDistance = uniforms.shadowMaxDistance
    const shadowDebug = uniforms.shadowDebug
    const bands = uniforms.bands
    const pixelSize = uniforms.pixelSize
    const glowRadius = uniforms.glowRadius
    const glowIntensity = uniforms.glowIntensity
    const lightHeight = uniforms.lightHeight
    const rimIntensity = uniforms.rimIntensity
    const rimPower = uniforms.rimPower

    const fp = constants.forwardPlus
    const tileLookup = fp.createTileLookup()

    return (ctx) => {
      const lit = Fn(() => {
        const rawPos = ctx.worldPosition
        const usePixelSnap = pixelSize.greaterThan(float(0))
        const snappedPos = vec2(rawPos).div(pixelSize).floor().mul(pixelSize)
        const surfacePos = usePixelSnap.select(snappedPos, vec2(rawPos))
        const totalLight = vec3(0, 0, 0).toVar('totalLight')
        const totalLightUnshadowed = vec3(0, 0, 0).toVar('totalLightUnshadowed')
        const totalRim = vec3(0, 0, 0).toVar('totalRim')
        // Debug accumulators.
        const shadowSum = float(0).toVar('shadowSum')
        const shadowCount = float(0).toVar('shadowCount')
        const tileLightCount = float(0).toVar('tileLightCount')

        // Compute tile index from world position
        const screenPos = surfacePos
          .sub(fp.worldOffsetNode)
          .div(fp.worldSizeNode)
          .mul(fp.screenSizeNode)
        const tileX = int(screenPos.x.div(float(TILE_SIZE)).floor())
        const tileY = int(screenPos.y.div(float(TILE_SIZE)).floor())
        const tileIndex = tileY.mul(fp.tileCountXNode).add(tileX)

        Loop(MAX_LIGHTS_PER_TILE, ({ i }: { i: Node<'int'> }) => {
          const lightId = tileLookup(tileIndex, i)
          If(lightId.equal(int(0)), () => {
            Break()
          })
          // Count this slot for the debug "tile light count" view.
          tileLightCount.addAssign(float(1))

          const idx = float(lightId.sub(int(1)))
          const { row0, row1, row2, row3 } = lightStore.readLightData(idx)

          const lightPos = vec2(row0.r, row0.g)
          const lightColor = vec3(row0.b, row0.a, row1.r)
          const lightIntensityVal = row1.g
          const lightDistance = row1.b
          const lightDecay = row1.a
          const lightDir = vec2(row2.r, row2.g)
          const lightAngle = row2.b
          const lightPenumbra = row2.a
          const lightType = row3.r
          const lightEnabled = row3.g

          const contribution = lightColor.mul(lightIntensityVal).mul(lightEnabled)

          // Point light attenuation
          const effectiveDistance = lightDistance.greaterThan(float(0)).select(lightDistance, float(1e6))
          const toLight = lightPos.sub(vec2(surfacePos))
          const dist = toLight.length()
          const normalizedDist = dist.div(effectiveDistance).clamp(0, 1)
          const sharpAtten = float(1).sub(normalizedDist.pow(lightDecay)).clamp(0, 1)

          // Broad glow
          const useGlow = glowRadius.greaterThan(float(0))
          const glowDist = dist.div(effectiveDistance.mul(glowRadius)).clamp(0, 1)
          const broadAtten = float(1).sub(glowDist).clamp(0, 1)
          const pointAtten = useGlow.select(
            sharpAtten.add(broadAtten.mul(glowIntensity)).clamp(0, 1),
            sharpAtten
          )

          // Spot light cone
          const toSurfaceNorm = vec2(surfacePos).sub(lightPos).normalize()
          const spotCos = toSurfaceNorm.dot(lightDir.normalize())
          const innerCos = lightAngle.cos()
          const outerCos = lightAngle.add(lightPenumbra).cos()
          const coneAtten = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)

          // Select attenuation by type
          const isPoint = lightType.lessThan(float(0.5))
          const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5)))
          const atten = isPoint.select(pointAtten, isSpot.select(pointAtten.mul(coneAtten), float(1)))

          // Normal-based directional diffuse shading
          // Ambient lights are omnidirectional — skip normal-based diffuse
          const lightDir3D = vec3(toLight.normalize(), lightHeight).normalize()
          const isAmbient = lightType.greaterThan(float(2.5))
          const NdotL = ctx.normal.dot(lightDir3D).clamp(0, 1)
          const diffuse = isAmbient.select(float(1), NdotL)

          // SDF sphere-traced soft shadow. `sdfTexture` is null only when
          // the effect runs without the shadow pipeline — in that case
          // the path compiles out at build time (JS-level if) so no GPU
          // branch is emitted. `shadowStrength` scales the effect from 0
          // (disabled) to 1 (full darkness in shadow); `shadowSoftness`
          // controls penumbra width; `shadowBias` is the SDF hit epsilon.
          let shadow: Node<'float'> = float(1)
          if (sdfTexture) {
            const trace = shadowSDF2D(
              vec2(surfacePos),
              lightPos,
              sdfTexture,
              worldSizeNode,
              worldOffsetNode,
              {
                softness: shadowSoftness,
                eps: shadowBias,
                fragmentCastsShadow: readCastShadowFlag(),
                maxShadowDistance: shadowMaxDistance,
              }
            )
            // Attenuate shadowing by shadowStrength — lerp from lit (1)
            // toward the trace value by the configured strength.
            shadow = float(1).sub(float(1).sub(trace).mul(shadowStrength))
            // Ambient lights ignore shadows.
            shadow = isAmbient.select(float(1), shadow)
          }
          // Per-light contribution (with and without shadow). Tracked in
          // parallel so debug modes can visualize lights with vs. without
          // shadows without re-running the shader.
          const baseContribution = contribution.mul(atten).mul(diffuse)
          totalLightUnshadowed.addAssign(baseContribution)
          totalLight.addAssign(baseContribution.mul(shadow))

          // Rim lighting — edge highlight from inverse normal dot
          const rimFactor = isAmbient.select(float(0), float(1).sub(NdotL).pow(rimPower))
          totalRim.addAssign(contribution.mul(atten).mul(rimFactor))

          // Debug-only: track per-pixel average shadow. Skip ambient lights
          // since they always ignore shadows (would bias the average to 1).
          If(isAmbient.not(), () => {
            shadowSum.addAssign(shadow)
            shadowCount.addAssign(float(1))
          })
        })

        // Add rim to diffuse lighting (direct contribution only)
        const useRim = rimIntensity.greaterThan(float(0))
        const direct = useRim.select(
          vec3(totalLight).add(vec3(totalRim).mul(rimIntensity)),
          vec3(totalLight)
        )

        // Quantize direct lighting to discrete bands. Ambient is added
        // AFTER quantization so it acts as a continuous floor — shadowed
        // regions still receive baseline illumination, and subtle ambient
        // tints aren't snapped to zero by large band counts.
        const useBands = bands.greaterThan(float(0))
        const quantized = direct.mul(bands).add(float(0.5)).floor().div(bands)
        const shapedDirect = useBands.select(quantized, direct)

        const normalOut = shapedDirect.add(fp.ambientNode)

        // ------------------------------------------------------------
        // DEBUG MODES — see schema comment for the full list.
        // ------------------------------------------------------------

        // Mode 1: average shadow mask across tile lights
        const avgShadow = shadowCount
          .greaterThan(float(0))
          .select(shadowSum.div(shadowCount), float(1))
        const mode1 = vec3(avgShadow)

        // Mode 2: direct light only, NO shadows applied
        const mode2 = vec3(totalLightUnshadowed)

        // Mode 3: direct light only, WITH shadows applied
        const mode3 = vec3(totalLight)

        // Mode 4/7/8: signed SDF at the shaded surface — green positive
        // (open space), red negative (inside caster). sqrt magnitude
        // so small values still register visibly. Clamp to [0, 1] is
        // defensive against out-of-frustum floor fragments.
        // SDF .r is world-space distance — no `(sx+sy)/2` rescale needed.
        // `surfaceUV` here is Y-up (world convention); `sdfSampleUV`
        // flips Y for the QuadMesh-written SDF which uses three.js's
        // WebGPU screen-UV convention (Y-down). Same flip the trace in
        // `shadowSDF2D` applies.
        const surfaceUV = vec2(surfacePos)
          .sub(fp.worldOffsetNode)
          .div(fp.worldSizeNode)
          .clamp(0, 1)
        const sdfSampleUV = vec2(surfaceUV.x, float(1).sub(surfaceUV.y))
        const sdfAtSurface = sdfTexture
          ? sampleTexture(sdfTexture, sdfSampleUV).r
          : float(0)
        const sdfMagnitude = sdfAtSurface.abs().div(float(100)).sqrt().clamp(0, 1)
        const sdfPos = sdfAtSurface.greaterThan(float(0))
        const mode4 = vec3(
          sdfPos.select(float(0), sdfMagnitude),
          sdfPos.select(sdfMagnitude, float(0)),
          float(0)
        )

        // Mode 5: tile light count — 0 lights = black, 16 lights = white
        const mode5 = vec3(tileLightCount.div(float(MAX_LIGHTS_PER_TILE)))

        // Mode 6: surfaceUV that the shader computes for SDF sampling
        // (pre-flip, Y-up world convention). Red = UV.x, Green = UV.y.
        // Expected: smooth diagonal gradient (0,0) bottom-left to (1,1)
        // top-right.
        const mode6 = vec3(surfaceUV.x, surfaceUV.y, float(0))

        // Mode 7: raw SDF sample `.r` as grayscale, normalized by the
        // mean frustum extent so values land in [0,1]. SDF .r now stores
        // WORLD-space distance (0 on caster, ~sqrt(sx²+sy²) at corners),
        // so undivided .r would clip nearly everything to white.
        const sdfNorm = fp.worldSizeNode.x
          .add(fp.worldSizeNode.y)
          .mul(float(0.5))
          .max(float(0.0001))
        const mode7 = sdfTexture
          ? vec3(sampleTexture(sdfTexture, sdfSampleUV).r.div(sdfNorm))
          : vec3(0, 0, 0)

        // Mode 8: sample the SDF at a HARDCODED UV (0.5, 0.5). Same
        // normalization as mode 7. If this is uniform gray across the
        // entire viewport, texture sampling itself works correctly —
        // the bug is purely in the UV arg we pass (surfaceUV).
        const mode8 = sdfTexture
          ? vec3(sampleTexture(sdfTexture, vec2(float(0.5), float(0.5))).r.div(sdfNorm))
          : vec3(0, 0, 0)

        // Mode selection — chained ternary on the float `shadowDebug`
        // uniform. Written flat so the nesting stays obvious.
        const m = shadowDebug
        const picked = m.greaterThan(float(7.5)).select(
          mode8,
          m.greaterThan(float(6.5)).select(
            mode7,
            m.greaterThan(float(5.5)).select(
              mode6,
              m.greaterThan(float(4.5)).select(
                mode5,
                m.greaterThan(float(3.5)).select(
                  mode4,
                  m.greaterThan(float(2.5)).select(
                    mode3,
                    m.greaterThan(float(1.5)).select(
                      mode2,
                      m.greaterThan(float(0.5)).select(mode1, normalOut)
                    )
                  )
                )
              )
            )
          )
        )
        return picked
      })() as Node<'vec3'>

      return Fn(() => {
        // Materialize `lit` once into a var so referencing it in both
        // branches of the debug select doesn't re-expand the whole
        // light-loop subgraph and trigger "Declaration already in use"
        // TSL warnings.
        const litVar = lit.toVar('litResult')
        const isDebug = shadowDebug.greaterThan(float(0.5))
        // In debug modes bypass the sprite-color multiply so the whole
        // scene reads as a pure diagnostic image.
        const litColor = isDebug.select(litVar, ctx.color.rgb.mul(litVar))
        return vec4(litColor, ctx.color.a)
      })() as Node<'vec4'>
    }
  },
  init(ctx) {
    const size = ctx.renderer.getSize(new Vector2())
    this.forwardPlus.init(size.x, size.y)
  },
  update(ctx) {
    this.forwardPlus.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    this.forwardPlus.update(ctx.lights as Light2D[])
  },
  resize(w, h) {
    this.forwardPlus.resize(w, h)
  },
  dispose() {
    this.forwardPlus.dispose()
  },
})
