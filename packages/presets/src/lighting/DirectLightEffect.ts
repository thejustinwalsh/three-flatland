import {
  vec2,
  vec3,
  vec4,
  float,
  Fn,
  Loop,
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { createLightEffect } from 'three-flatland'
import type { LightEffectBuildContext } from 'three-flatland'
import { shadowSDF2D } from '@three-flatland/nodes/lighting'

/**
 * Direct lighting: per-fragment loop over all lights, no tiling.
 *
 * Same feature set as DefaultLightEffect but iterates every light for every
 * fragment. Simpler code path, fine for scenes with few lights, but scales
 * as O(total_lights) per fragment.
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
 * import { DirectLightEffect } from '@three-flatland/presets'
 *
 * const lighting = new DirectLightEffect()
 * flatland.setLighting(lighting)
 * ```
 */
export const DirectLightEffect = createLightEffect({
  name: 'directLight',
  schema: {
    shadowStrength: 0.6,
    shadowSoftness: 8.0,
    shadowBias: 0.04,
    bands: 0,
    pixelSize: 0,
    glowRadius: 0,
    glowIntensity: 0,
    lightHeight: 0.75,
    rimIntensity: 0,
    rimPower: 2,
  } as const,
  needsShadows: true,
  requires: ['normal'] as const,
  light: ({ uniforms, lightStore, sdfTexture, worldSizeNode, worldOffsetNode }: LightEffectBuildContext<{
    shadowStrength: 0.6
    shadowSoftness: 8.0
    shadowBias: 0.04
    bands: 0
    pixelSize: 0
    glowRadius: 0
    glowIntensity: 0
    lightHeight: 0.75
    rimIntensity: 0
    rimPower: 2
  }>) => {
    const count = lightStore.countNode
    const shadowStrength = uniforms.shadowStrength
    const shadowSoftness = uniforms.shadowSoftness
    const shadowBias = uniforms.shadowBias
    const bands = uniforms.bands
    const pixelSize = uniforms.pixelSize
    const glowRadius = uniforms.glowRadius
    const glowIntensity = uniforms.glowIntensity
    const lightHeight = uniforms.lightHeight
    const rimIntensity = uniforms.rimIntensity
    const rimPower = uniforms.rimPower

    return (ctx) => {
      const lit = Fn(() => {
        const rawPos = ctx.worldPosition
        const usePixelSnap = pixelSize.greaterThan(float(0))
        const snappedPos = vec2(rawPos).div(pixelSize).floor().mul(pixelSize)
        const surfacePos = usePixelSnap.select(snappedPos, vec2(rawPos))
        const totalLight = vec3(0, 0, 0).toVar('totalLight')
        const totalRim = vec3(0, 0, 0).toVar('totalRim')

        Loop(
          { start: 0, end: count, type: 'float', condition: '<' },
          ({ i }: { i: Node<'float'> }) => {
            const { row0, row1, row2, row3 } = lightStore.readLightData(i)

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

            // SDF sphere-traced soft shadow — see DefaultLightEffect for
            // the detailed comment. Same pattern, different light loop.
            let shadow: Node<'float'> = float(1)
            if (sdfTexture) {
              const trace = shadowSDF2D(
                vec2(surfacePos),
                lightPos,
                sdfTexture,
                worldSizeNode,
                worldOffsetNode,
                { softness: shadowSoftness, eps: shadowBias }
              )
              shadow = float(1).sub(float(1).sub(trace).mul(shadowStrength))
              shadow = isAmbient.select(float(1), shadow)
            }
            totalLight.addAssign(contribution.mul(atten).mul(diffuse).mul(shadow))

            // Rim lighting — edge highlight from inverse normal dot
            const rimFactor = isAmbient.select(float(0), float(1).sub(NdotL).pow(rimPower))
            totalRim.addAssign(contribution.mul(atten).mul(rimFactor))
          }
        )

        // Add rim to diffuse lighting
        const useRim = rimIntensity.greaterThan(float(0))
        const combined = useRim.select(
          vec3(totalLight).add(vec3(totalRim).mul(rimIntensity)),
          vec3(totalLight)
        )

        // Quantize to discrete bands
        const useBands = bands.greaterThan(float(0))
        const raw = combined
        const quantized = raw.mul(bands).add(float(0.5)).floor().div(bands)
        return useBands.select(quantized, raw)
      })() as Node<'vec3'>

      return Fn(() => {
        const litColor = ctx.color.rgb.mul(lit)
        return vec4(litColor, ctx.color.a)
      })() as Node<'vec4'>
    }
  },
})
