import { vec3, texture } from 'three/tsl'
import type { Texture } from 'three'
import { createMaterialEffect } from 'three-flatland'

/**
 * Provides the 'normal' channel from a pre-baked normal map texture.
 *
 * Sprites using this provider will have their normals sampled from the
 * assigned normal map. Different normalMap textures produce different
 * materials and therefore different batches.
 *
 * @example
 * ```typescript
 * import { NormalMapProvider } from '@three-flatland/presets'
 *
 * const provider = new NormalMapProvider()
 * provider.normalMap = myNormalMapTexture
 * sprite.addEffect(provider)
 * ```
 */
export const NormalMapProvider = createMaterialEffect({
  name: 'normalMap',
  schema: {
    normalMap: () => null as Texture | null,
  },
  provides: ['normal'],
  channelNode(channelName, { atlasUV, constants }) {
    const tex = constants.normalMap
    if (!tex) return vec3(0, 0, 1)
    const raw = texture(tex, atlasUV)
    return raw.xyz.mul(2).sub(1).normalize()
  },
})
