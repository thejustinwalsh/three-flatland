import { vec2, vec3, float, texture } from 'three/tsl'
import { createMaterialEffect } from 'three-flatland'

/**
 * Provides the 'normal' channel by auto-computing normals from the
 * sprite's diffuse alpha channel via central difference gradient.
 *
 * This is a zero-configuration provider — just add it to any sprite
 * to enable lighting without a dedicated normal map texture.
 *
 * @example
 * ```typescript
 * import { AutoNormalProvider } from '@three-flatland/presets'
 *
 * const provider = new AutoNormalProvider()
 * sprite.addEffect(provider)
 * ```
 */
export const AutoNormalProvider = createMaterialEffect({
  name: 'autoNormal',
  schema: {
    strength: 1.0,
  } as const,
  provides: ['normal'],
  channelNode(channelName, { atlasUV, attrs, baseTexture }) {
    if (!baseTexture) return vec3(0, 0, 1)

    // Central difference gradient on alpha channel
    const texelSize = float(1).div(float(256))
    const alphaL = texture(baseTexture, atlasUV.sub(vec2(texelSize, 0))).a
    const alphaR = texture(baseTexture, atlasUV.add(vec2(texelSize, 0))).a
    const alphaD = texture(baseTexture, atlasUV.sub(vec2(0, texelSize))).a
    const alphaU = texture(baseTexture, atlasUV.add(vec2(0, texelSize))).a
    const dx = alphaR.sub(alphaL).mul(attrs.strength)
    const dy = alphaU.sub(alphaD).mul(attrs.strength)
    return vec3(dx.negate(), dy.negate(), float(1)).normalize()
  },
})
