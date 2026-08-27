import { vec2, vec3, vec4, Fn, texture as sampleTexture } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import {
  createLightEffect,
  HierarchicalRadianceCascades,
  createHierarchicalRadianceCascadesConfig,
} from 'three-flatland'

/**
 * Hierarchical/Holographic Radiance Cascades GI.
 *
 * This preset intentionally uses `HierarchicalRadianceCascades` instead of
 * changing `RadianceLightEffect` defaults. It exists so examples can compare the
 * conventional Alexander Sannikov RC path against the experimental interval
 * composer and the Holographic transfer/radiance hierarchy from Freeman,
 * Sannikov, and Margel's 2025 paper.
 */
export const HierarchicalRadianceLightEffect = createLightEffect({
  name: 'hierarchicalRadianceLight',
  schema: {
    radianceIntensity: 1.0,
    radiance: () =>
      new HierarchicalRadianceCascades(
        createHierarchicalRadianceCascadesConfig('balanced', {
          sceneRadianceDownsampleFactor: 1,
          raymarchSteps: 32,
          blueNoiseStrength: 0.45,
          filterRadius: 1.25,
          filterStrength: 0.8,
          filterDiagonals: true,
          filterJitterStrength: 0.35,
          mipBlur: 0,
          mipStrength: 0.25,
          wideDownsampleFactor: 2,
          wideLevels: 1,
        })
      ),
  } as const,
  needsShadows: true,
  light: ({ uniforms, constants, worldSizeNode, worldOffsetNode }) => {
    const radianceIntensity = uniforms.radianceIntensity
    const radianceTexture = constants.radiance.finalRadianceTexture

    return (ctx) => {
      const lit = Fn(() => {
        const totalLight = vec3(0, 0, 0).toVar('totalLight')
        const surfaceUV = vec2(ctx.worldPosition).sub(worldOffsetNode).div(worldSizeNode)
        const indirect = sampleTexture(radianceTexture, surfaceUV)
        totalLight.addAssign(indirect.rgb.mul(radianceIntensity))
        return vec3(totalLight)
      })() as Node<'vec3'>

      return Fn(() => {
        const litColor = ctx.color.rgb.mul(lit)
        return vec4(litColor, ctx.color.a)
      })() as Node<'vec4'>
    }
  },
  init(ctx) {
    const cameraWidth = ctx.camera.right - ctx.camera.left
    const cameraHeight = ctx.camera.top - ctx.camera.bottom

    this.radiance.init(cameraWidth, cameraHeight, ctx.lightStore.lightsTexture, ctx.lightStore.countNode)
  },
  update(ctx) {
    if (!ctx.sdfGenerator) return

    this.radiance.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    this.radiance.generate(ctx.renderer, ctx.sdfGenerator.sdfTexture)
  },
  dispose() {
    this.radiance.dispose()
  },
})
