import { vec3, texture, float, max } from 'three/tsl'
import type { Texture } from 'three'
import { createMaterialEffect, readFlip } from 'three-flatland'

/**
 * Provides the 'normal' and 'elevation' channels from a pre-baked
 * normal atlas.
 *
 * Atlas encoding (see `@three-flatland/normals/bakeNormalMap`):
 *   R = nx ∈ [-1, 1]           → mapped from [0, 255]
 *   G = ny ∈ [-1, 1]           → mapped from [0, 255]
 *   B = elevation ∈ [0, 1]     → mapped from [0, 255]
 *   A = source alpha
 *
 * The provider reconstructs `nz = sqrt(max(0, 1 − nx² − ny²))` at
 * runtime — outward-facing tangent-space convention means nz ≥ 0 always,
 * so the sign is implicit and one texture channel is freed for elevation.
 *
 * Instance-flip correction: sampled `normal.xy` is multiplied by the
 * existing `instanceFlip` attribute so a `flipX`/`flipY` sprite responds
 * to lights from the geometrically-correct side.
 *
 * Elevation drives `DefaultLightEffect`'s per-fragment light direction
 * (`L.z = lightHeight − elevation`). Different normalMap textures
 * produce different materials and therefore different batches.
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
  provides: ['normal', 'elevation'],
  channelNode(channelName, { atlasUV, constants }) {
    const tex = constants.normalMap
    if (!tex) {
      // No bound normal map — emit the channel's flat default.
      return channelName === 'elevation' ? float(0) : vec3(0, 0, 1)
    }

    // One texture sample serves both channels — the shader compiler's
    // CSE collapses duplicate `texture()` reads at the same UV.
    const raw = texture(tex, atlasUV)

    if (channelName === 'elevation') {
      // B channel carries elevation in [0, 1].
      return raw.b
    }

    // Normal channel — decode RG to [-1, 1], reconstruct nz.
    const nx = raw.r.mul(float(2)).sub(float(1))
    const ny = raw.g.mul(float(2)).sub(float(1))
    const nzSq = float(1).sub(nx.mul(nx)).sub(ny.mul(ny))
    const nz = max(float(0), nzSq).sqrt()

    // Flip correction — mirror XY by the instance's flip flags so a
    // flipped sprite responds to lights from the mirrored side.
    const flip = readFlip()
    return vec3(nx.mul(flip.x), ny.mul(flip.y), nz).normalize()
  },
})
