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
} from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  createLightEffect,
  ForwardPlusLighting,
  MAX_LIGHTS_PER_TILE,
  TILE_SIZE,
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
    shadowBias: 0.04,
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
        const totalRim = vec3(0, 0, 0).toVar('totalRim')

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
          // branch is emitted. `shadowStrength` scales the effect from
          // 0 (disabled) to 1 (full darkness in shadow); `shadowSoftness`
          // controls penumbra width; `shadowBias` is the self-shadow
          // start offset along the ray.
          let shadow: Node<'float'> = float(1)
          if (sdfTexture) {
            const trace = shadowSDF2D(
              vec2(surfacePos),
              lightPos,
              sdfTexture,
              worldSizeNode,
              worldOffsetNode,
              { softness: shadowSoftness, startOffset: shadowBias }
            )
            // Attenuate shadowing by shadowStrength — lerp from lit (1)
            // toward the trace value by the configured strength.
            shadow = float(1).sub(float(1).sub(trace).mul(shadowStrength))
            // Ambient lights ignore shadows.
            shadow = isAmbient.select(float(1), shadow)
          }
          totalLight.addAssign(contribution.mul(atten).mul(diffuse).mul(shadow))

          // Rim lighting — edge highlight from inverse normal dot
          const rimFactor = isAmbient.select(float(0), float(1).sub(NdotL).pow(rimPower))
          totalRim.addAssign(contribution.mul(atten).mul(rimFactor))
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

        return shapedDirect.add(fp.ambientNode)
      })() as Node<'vec3'>

      return Fn(() => {
        const litColor = ctx.color.rgb.mul(lit)
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
