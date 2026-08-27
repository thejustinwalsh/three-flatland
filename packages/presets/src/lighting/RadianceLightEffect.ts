import { vec2, vec3, vec4, Fn, texture as sampleTexture } from 'three/tsl'
import type Node from 'three/src/nodes/core/Node.js'
import { createLightEffect, RadianceCascades, createRadianceCascadesConfig } from 'three-flatland'

/**
 * Radiance Cascades GI: SDF + hierarchical radiance cascades for global illumination.
 *
 * Provides indirect lighting via cascade merging. Uses RadianceCascades as a
 * schema constant with config baked into the factory function.
 *
 * The radiance texture reference is stable from construction — RadianceCascades
 * eagerly allocates its final RT so TSL sampleTexture() can capture it at
 * node-build time. The RT is resized later in init(), but the .texture object
 * reference stays the same.
 *
 * @example
 * ```typescript
 * import { RadianceLightEffect } from '@three-flatland/presets'
 *
 * const lighting = new RadianceLightEffect()
 * flatland.setLighting(lighting)
 * lighting.radianceIntensity = 0.5
 * ```
 */
export const RadianceLightEffect = createLightEffect({
  name: 'radianceLight',
  schema: {
    // Uniforms (runtime-settable, TSL nodes)
    radianceIntensity: 1.0,
    // Constants (per-instance, read-only reference, mutable internals)
    radiance: () => new RadianceCascades(createRadianceCascadesConfig('balanced')),
  } as const,
  needsShadows: true,
  light: ({ uniforms, constants, worldSizeNode, worldOffsetNode }) => {
    const radianceIntensity = uniforms.radianceIntensity

    // Capture the stable texture reference at node-build time.
    // RadianceCascades eagerly allocates its final RT in the constructor,
    // so this is always non-null. The underlying RT gets resized in init(),
    // but the .texture object reference stays the same.
    const radianceTexture = constants.radiance.finalRadianceTexture

    return (ctx) => {
      const lit = Fn(() => {
        const totalLight = vec3(0, 0, 0).toVar('totalLight')

        // Sample radiance texture for indirect GI
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
