import { Fn, float, screenUV, smoothstep, vec3, vec4, texture as sampleTexture } from 'three/tsl'
import { Vector2 } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import {
  collectAmbientRadiance,
  createLightEffect,
  DDA_FIXED_RADIANCE_CASCADES_CONFIG,
  RadianceCascades,
} from 'three-flatland'

const _transportWorldSize = new Vector2()
const _transportWorldOffset = new Vector2()

/**
 * Direction-first Radiance Cascades with integer supercover occlusion and
 * packed fixed-point cascade storage. This deliberately keeps conventional
 * RC's compact pass topology instead of HRC's transfer/radiance hierarchy.
 */
export const DdaFixedRadianceLightEffect = createLightEffect({
  name: 'ddaFixedRadianceLight',
  schema: {
    radianceIntensity: 1.0,
    lightHeight: 0.75,
    radiance: () => new RadianceCascades(DDA_FIXED_RADIANCE_CASCADES_CONFIG),
  } as const,
  requires: ['normal', 'elevation'] as const,
  needsShadows: true,
  shadowPipelineMode: 'occlusion',
  shadowCaptureMargin() {
    return this.radiance.maxTransportDistance
  },
  light: ({ uniforms, constants, lightStore }) => {
    const radianceIntensity = uniforms.radianceIntensity
    const lightHeight = uniforms.lightHeight
    const radianceTexture = constants.radiance.finalRadianceTexture

    return (ctx) => {
      const lit = Fn(() => {
        // collectAmbientRadiance contains imperative TSL Loop/If nodes and
        // therefore must be constructed inside the material's Fn stack.
        // Hoisting it out silently detached the loop and resolved ambient to
        // black even though the LightStore contained an enabled ambient light.
        const ambientRadiance = collectAmbientRadiance(lightStore.lightsTexture, lightStore.countNode)
        // This render target is regenerated for the active camera window.
        // ScreenNode's Y convention is opposite texture()'s render-target
        // convention here, so flip exactly once at the final lookup.
        const radiance = sampleTexture(radianceTexture, screenUV.flipY()).rgb
        // RC's final resolve is directionally averaged, so it cannot perform
        // the per-light N.L used by direct lighting. Preserve the authored
        // height contract instead: elevated wall caps above the emitter plane
        // receive no transported floor light, while baked side/floor normals
        // retain their upward-facing response.
        const belowEmitter = float(1).sub(
          smoothstep(lightHeight.sub(float(0.15)), lightHeight.add(float(0.01)), ctx.elevation)
        )
        const upwardResponse = ctx.normal.z.clamp(0, 1).mul(float(0.35)).add(float(0.65))
        return vec3(ambientRadiance.add(radiance.mul(radianceIntensity).mul(belowEmitter).mul(upwardResponse)))
      })() as Node<'vec3'>

      return Fn(() => vec4(ctx.color.rgb.mul(lit), ctx.color.a))() as Node<'vec4'>
    }
  },
  init(ctx) {
    const cameraWidth = ctx.camera.right - ctx.camera.left
    const cameraHeight = ctx.camera.top - ctx.camera.bottom
    this.radiance.init(cameraWidth, cameraHeight, ctx.lightStore.lightsTexture, ctx.lightStore.countNode)
  },
  update(ctx) {
    if (!ctx.occlusionTexture) return
    this.radiance.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    const margin = this.radiance.maxTransportDistance
    _transportWorldSize.set(ctx.worldSize.x + margin * 2, ctx.worldSize.y + margin * 2)
    _transportWorldOffset.set(ctx.worldOffset.x - margin, ctx.worldOffset.y - margin)
    this.radiance.setTransportBounds(_transportWorldSize, _transportWorldOffset)
    this.radiance.generate(ctx.renderer, null, ctx.occlusionTexture, ctx.scene, ctx.camera)
  },
  resize(width, height) {
    this.radiance.setProcessingSize(width, height)
  },
  dispose() {
    this.radiance.dispose()
  },
})
