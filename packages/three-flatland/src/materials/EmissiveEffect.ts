import type { Texture } from 'three'
import { float, select, smoothstep, texture as sampleTexture, vec3, vec4 } from 'three/tsl'
import { createMaterialEffect } from './MaterialEffect'

/** Stable effect name consumed by the radiance-source pre-pass. */
export const EMISSIVE_EFFECT_NAME = 'emissive'

/**
 * Marks a sprite as a finite HDR radiance source.
 *
 * The visible material adds the same emission after direct lighting, while
 * RC/HRC re-renders emissive sprite batches into their linear scene-radiance
 * texture. With no `emissionMap`, the sprite texture's alpha is the source
 * silhouette and `color` supplies its radiance. An emission map uses its RGB
 * channels as a per-pixel multiplier and its alpha as an additional mask.
 *
 * `emissionMap` is a material-routing constant: assign it before attaching the
 * effect to a sprite. `color` and `intensity` remain cheap per-sprite values.
 *
 * @example
 * ```ts
 * const emission = new EmissiveEffect()
 * emission.color = [1, 0.25, 0.05]
 * emission.intensity = 3
 * sprite.addEffect(emission)
 * ```
 */
export const EmissiveEffect = createMaterialEffect({
  name: EMISSIVE_EFFECT_NAME,
  schema: {
    color: [1, 1, 1] as const,
    intensity: 1,
    /** Linear luminance cutoff for emissive texels. `0` emits the full alpha silhouette. */
    threshold: 0,
    emissionMap: () => null as Texture | null,
  },
  node({ inputColor, inputUV, attrs, constants }) {
    const mapSample = constants.emissionMap ? sampleTexture(constants.emissionMap, inputUV) : vec4(1, 1, 1, 1)
    const maskColor = constants.emissionMap ? mapSample.rgb : inputColor.rgb
    const luminance = maskColor.dot(vec3(0.2126, 0.7152, 0.0722))
    const thresholdMask = select(
      attrs.threshold.greaterThan(float(0)),
      smoothstep(attrs.threshold, attrs.threshold.add(float(0.05)), luminance),
      float(1)
    )
    const emission = vec3(attrs.color)
      .mul(attrs.intensity)
      .mul(mapSample.rgb)
      .mul(mapSample.a)
      .mul(inputColor.a)
      .mul(thresholdMask)
    return vec4(inputColor.rgb.add(emission), inputColor.a)
  },
})
