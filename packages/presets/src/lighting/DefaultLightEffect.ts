import { Vector2 } from 'three'
import { vec2, vec3, vec4, float, int, Fn, Loop, If, Break } from 'three/tsl'
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
 * - SDF-traced soft shadows
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
    // Hit epsilon (world units) — SDF sample values below this count as
    // an occluder strike, terminating the trace.
    shadowBias: 0.5,
    // Max world-space distance a shadow is allowed to extend from the
    // receiver before fading to lit. 0 disables falloff (binary shadow at
    // any distance). Typical values: 100-300 world units — enough to keep
    // near-caster shadows solid while hiding cone-fan artifacts far away
    // from the caster.
    shadowMaxDistance: 0,
    // Snap the shadow trace's surface position to a world-unit block grid.
    // 0 = off (per-fragment trace). 1/2/4/8 = blocky shadow silhouettes
    // where every fragment in that many world-unit block traces from the
    // same origin and therefore receives the same shadow. Independent of
    // the `pixelSize` uniform, which snaps everything — this only
    // chunkifies shadows. Purely aesthetic; does NOT reduce GPU cost.
    shadowPixelSize: 0,
    // Quantize each per-light shadow value (after `shadowStrength` is
    // applied) to this many tones. 0 = continuous. 2-4 gives crisp
    // stepped shadows in the style of the `bands` uniform.
    shadowBands: 0,
    // Nonlinear quantization curve for `shadowBands`. 1 = linear.
    shadowBandCurve: 1,
    bands: 8,
    pixelSize: 0,
    glowRadius: 0,
    glowIntensity: 0,
    lightHeight: 0.75,
    rimIntensity: 0,
    rimPower: 2,
    // How strongly the direct-light contribution is attenuated for
    // "camera-facing" fragments (where normal.z ≈ 1).
    capShadowStrength: 0,
    // Threshold above which a fragment counts as a "cap" for the gate.
    capShadowThreshold: 0.9,
    // Constants (per-instance, read-only reference, mutable internals)
    forwardPlus: () => new ForwardPlusLighting(),
  } as const,
  needsShadows: true,
  requires: ['normal', 'elevation'] as const,
  light: ({ uniforms, constants, lightStore, sdfTexture, worldSizeNode, worldOffsetNode }) => {
    const shadowStrength = uniforms.shadowStrength
    const shadowBias = uniforms.shadowBias
    const shadowMaxDistance = uniforms.shadowMaxDistance
    const shadowPixelSize = uniforms.shadowPixelSize
    const shadowBands = uniforms.shadowBands
    const shadowBandCurve = uniforms.shadowBandCurve
    const bands = uniforms.bands
    const pixelSize = uniforms.pixelSize
    const glowRadius = uniforms.glowRadius
    const capShadowStrength = uniforms.capShadowStrength
    const capShadowThreshold = uniforms.capShadowThreshold
    const glowIntensity = uniforms.glowIntensity
    const lightHeight = uniforms.lightHeight
    const rimIntensity = uniforms.rimIntensity
    const rimPower = uniforms.rimPower

    const fp = constants.forwardPlus
    const tileLookup = fp.createTileLookup()

    return (ctx) => {
      return Fn(() => {
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

          // Normal-based directional diffuse shading. Ambient lights skip
          // the N·L gate entirely.
          //
          // Per-fragment elevation lowers `L.z` by the fragment's height
          // above the ground plane — a torch at `lightHeight = 0.75`
          // targeting a wall cap at `elevation = 1.0` sees L.z = -0.25,
          // so N·L with `N = (0, 0, 1)` goes negative → clamped to 0 →
          // cap receives no direct light (only ambient).
          //
          // `dist.max(0.0001)` guards fragment-at-light coincidence. Using
          // `toLight / dist` avoids the redundant 2D normalize we'd
          // otherwise do before building the 3D direction.
          const safeDist = dist.max(float(0.0001))
          const toLightN = toLight.div(safeDist)
          const lightDir3D = vec3(
            toLightN,
            lightHeight.sub(ctx.elevation)
          ).normalize()
          const isAmbient = lightType.greaterThan(float(2.5))
          const NdotL = ctx.normal.dot(lightDir3D).clamp(0, 1)
          const diffuse = isAmbient.select(float(1), NdotL)

          // Shadow. Gated so the 32-tap SDF trace only runs when the
          // fragment actually needs it — ambient lights ignore shadow,
          // and fragments with `N·L ≤ 0` are already dark so tracing is
          // wasted. Both branches are runtime GPU gates (not JS), so the
          // trace is physically skipped on those fragments/lights.
          const shadow = float(1).toVar('shadow')
          if (sdfTexture) {
            const shouldTrace = isAmbient.not().and(NdotL.greaterThan(float(0)))
            If(shouldTrace, () => {
              // Optional block-snap on the shadow trace origin.
              const useShadowSnap = shadowPixelSize.greaterThan(float(0))
              const shadowSnappedPos = vec2(surfacePos)
                .div(shadowPixelSize)
                .floor()
                .mul(shadowPixelSize)
              const shadowSurfacePos = useShadowSnap.select(
                shadowSnappedPos,
                vec2(surfacePos)
              )
              const trace = shadowSDF2D(
                shadowSurfacePos,
                lightPos,
                sdfTexture,
                worldSizeNode,
                worldOffsetNode,
                {
                  eps: shadowBias,
                  fragmentCastsShadow: readCastShadowFlag(),
                  maxShadowDistance: shadowMaxDistance,
                }
              )
              // Attenuate by shadowStrength (lerp lit → trace).
              const s = float(1).sub(float(1).sub(trace).mul(shadowStrength))
              // Optional bit-crush: quantize the per-light shadow value.
              // `shadowBandCurve` reshapes quantization non-linearly —
              // expand through `pow(x, 1/curve)`, quantize evenly,
              // compress back through `pow(y, curve)`. Endpoints 0 and 1
              // are preserved.
              const useShadowBands = shadowBands.greaterThan(float(0))
              const curve = shadowBandCurve.max(float(0.01))
              const invCurve = float(1).div(curve)
              const shadowExpanded = s.pow(invCurve)
              const shadowBandedExp = shadowExpanded
                .mul(shadowBands)
                .add(float(0.5))
                .floor()
                .div(shadowBands)
              const shadowBanded = shadowBandedExp.pow(curve)
              shadow.assign(useShadowBands.select(shadowBanded, s))
            })
          }

          const baseContribution = contribution.mul(atten).mul(diffuse)
          totalLight.addAssign(baseContribution.mul(shadow))

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
        // AFTER quantization so it acts as a continuous floor.
        const useBands = bands.greaterThan(float(0))
        const quantized = direct.mul(bands).add(float(0.5)).floor().div(bands)
        const shapedDirect = useBands.select(quantized, direct)

        // Cap-shadow gate — attenuate direct light on fragments whose
        // normal is ≈ (0, 0, 1). See schema comment for details.
        const capness = ctx.normal.z
          .sub(capShadowThreshold)
          .div(float(1).sub(capShadowThreshold).max(float(0.0001)))
          .clamp(0, 1)
        const capGate = float(1).sub(capShadowStrength.mul(capness))
        const gatedDirect = shapedDirect.mul(capGate)

        const litColor = gatedDirect.add(fp.ambientNode).mul(ctx.color.rgb)
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
