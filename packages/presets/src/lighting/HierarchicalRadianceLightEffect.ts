import { vec2, vec3, vec4, Fn } from 'three/tsl'
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
    // The preset is the single source of truth. Do not shadow these values in
    // examples or here: dev panels read this live instance after construction.
    radiance: () => new HierarchicalRadianceCascades(createHierarchicalRadianceCascadesConfig('balanced')),
  } as const,
  needsShadows: true,
  shadowPipelineMode() {
    return this.radiance.requiresSdf ? 'sdf' : 'occlusion'
  },
  light: ({ uniforms, constants }) => {
    const radianceIntensity = uniforms.radianceIntensity

    return (ctx) => {
      const lit = Fn(() => {
        const totalLight = vec3(0, 0, 0).toVar('totalLight')
        // Holographic RC is reconstructed on a square, rotation-preserving
        // domain. The renderer supplies the matching padded world-to-texture
        // mapping (and switches back to the regular bounds for legacy mode).
        const surfaceUV = constants.radiance.worldToRadianceUV(vec2(ctx.worldPosition))
        const indirect = constants.radiance.sampleFinalRadiance(surfaceUV)
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
    if (this.radiance.requiresSdf && !ctx.sdfGenerator) return
    if (!this.radiance.requiresSdf && !ctx.occlusionTexture) return

    this.radiance.setWorldBounds(ctx.worldSize, ctx.worldOffset)
    this.radiance.generate(
      ctx.renderer,
      ctx.sdfGenerator?.sdfTexture ?? null,
      ctx.scene,
      ctx.camera,
      ctx.occlusionTexture
    )
  },
  resize(width, height) {
    this.radiance.setProcessingSize(width, height)
  },
  dispose() {
    this.radiance.dispose()
  },
})
