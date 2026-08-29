import { Fn, float, screenUV, smoothstep, vec3, vec4, texture as sampleTexture } from 'three/tsl'
import { Vector2 } from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import {
  collectAmbientRadiance,
  createLightEffect,
  DDA_FIXED_RADIANCE_CASCADES_CONFIG,
  RadianceCascades,
} from 'three-flatland'

const DDA_CAPTURE_MARGIN = 128
const _radianceUvScaleVector = new Vector2(1, 1)
const _radianceUvOffsetVector = new Vector2()
const _radianceUvScale: [number, number] = [1, 1]
const _radianceUvOffset: [number, number] = [0, 0]

/**
 * Direction-first Radiance Cascades with integer supercover occlusion and
 * packed fixed-point cascade storage. Transport is emissive-only by default;
 * ambient is composed separately by the final light function. This keeps
 * conventional RC's compact pass topology instead of HRC's hierarchy.
 */
export const DdaFixedRadianceLightEffect = createLightEffect({
  name: 'ddaFixedRadianceLight',
  schema: {
    radianceIntensity: 1.0,
    lightHeight: 0.75,
    radianceUvScale: [1, 1],
    radianceUvOffset: [0, 0],
    includeAnalyticLights: () => false,
    radiance: () => new RadianceCascades(DDA_FIXED_RADIANCE_CASCADES_CONFIG),
  } as const,
  requires: ['normal', 'elevation'] as const,
  needsShadows: true,
  shadowPipelineMode: 'occlusion',
  shadowCaptureMargin() {
    return DDA_CAPTURE_MARGIN
  },
  shadowCaptureResolutionScale() {
    return 1 / this.radiance.ddaPixelSize
  },
  shadowCaptureGridAligned: true,
  shadowCaptureMipmaps() {
    return this.radiance.ddaHierarchyLevel > 0
  },
  light: ({ uniforms, constants, lightStore }) => {
    const radianceIntensity = uniforms.radianceIntensity
    const lightHeight = uniforms.lightHeight
    const radianceUvScale = uniforms.radianceUvScale
    const radianceUvOffset = uniforms.radianceUvOffset
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
        const radiance = sampleTexture(
          radianceTexture,
          screenUV.flipY().mul(radianceUvScale).add(radianceUvOffset).clamp(0, 1)
        ).rgb
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
    this.radiance.includeAnalyticLights = this.includeAnalyticLights
    this.radiance.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    this.radiance.setTransportBounds(ctx.shadowCaptureWorldSize, ctx.shadowCaptureWorldOffset)
    this.radiance.getVisibleUvTransform(_radianceUvScaleVector, _radianceUvOffsetVector)
    _radianceUvScale[0] = _radianceUvScaleVector.x
    _radianceUvScale[1] = _radianceUvScaleVector.y
    _radianceUvOffset[0] = _radianceUvOffsetVector.x
    _radianceUvOffset[1] = _radianceUvOffsetVector.y
    this.radianceUvScale = _radianceUvScale
    this.radianceUvOffset = _radianceUvOffset
    this.radiance.generate(ctx.renderer, null, ctx.occlusionTexture, ctx.scene, ctx.camera)
  },
  resize(width, height) {
    this.radiance.setProcessingSize(width, height)
  },
  dispose() {
    this.radiance.dispose()
  },
})
