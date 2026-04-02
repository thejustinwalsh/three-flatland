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

/**
 * Simple tiled lighting: Forward+ per-tile culling with minimal features.
 *
 * High-performance preset with no stylization knobs — just light attenuation
 * and normal-based diffuse. No banding, pixel-snapping, glow, rim, or shadows.
 *
 * Use this when you want fast 2D lighting without any extras.
 *
 * @example
 * ```typescript
 * import { SimpleLightEffect } from '@three-flatland/presets'
 *
 * const lighting = new SimpleLightEffect()
 * flatland.setLighting(lighting)
 * ```
 */
export const SimpleLightEffect = createLightEffect({
  name: 'simpleLight',
  schema: {
    lightHeight: 0.75,
    // Constants (per-instance, read-only reference, mutable internals)
    forwardPlus: () => new ForwardPlusLighting(),
  } as const,
  requires: ['normal'] as const,
  light: ({ uniforms, constants, lightStore }) => {
    const lightHeight = uniforms.lightHeight

    const fp = constants.forwardPlus
    const tileLookup = fp.createTileLookup()

    return (ctx) => {
      const lit = Fn(() => {
        const surfacePos = vec2(ctx.worldPosition)
        const totalLight = vec3(0, 0, 0).toVar('totalLight')

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
          const atten = float(1).sub(normalizedDist.pow(lightDecay)).clamp(0, 1)

          // Spot light cone
          const toSurfaceNorm = vec2(surfacePos).sub(lightPos).normalize()
          const spotCos = toSurfaceNorm.dot(lightDir.normalize())
          const innerCos = lightAngle.cos()
          const outerCos = lightAngle.add(lightPenumbra).cos()
          const coneAtten = spotCos.sub(outerCos).div(innerCos.sub(outerCos)).clamp(0, 1)

          // Select attenuation by type
          const isPoint = lightType.lessThan(float(0.5))
          const isSpot = lightType.greaterThan(float(0.5)).and(lightType.lessThan(float(1.5)))
          const finalAtten = isPoint.select(atten, isSpot.select(atten.mul(coneAtten), float(1)))

          // Normal-based directional diffuse shading
          // Ambient lights are omnidirectional — skip normal-based diffuse
          const lightDir3D = vec3(toLight.normalize(), lightHeight).normalize()
          const isAmbient = lightType.greaterThan(float(2.5))
          const NdotL = ctx.normal.dot(lightDir3D).clamp(0, 1)
          const diffuse = isAmbient.select(float(1), NdotL)

          totalLight.addAssign(contribution.mul(finalAtten).mul(diffuse))
        })

        return totalLight
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
