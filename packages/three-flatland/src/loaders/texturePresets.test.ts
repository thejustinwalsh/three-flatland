import { describe, it, expect } from 'vitest'
import { Texture, NearestFilter, NoColorSpace, SRGBColorSpace } from 'three'
import { applyTextureOptions, TEXTURE_PRESETS } from './texturePresets'

describe('applyTextureOptions', () => {
  it('only touches colorSpace when the options object provides one', () => {
    // Data/mask textures (noise, height, distortion) are not color images —
    // tagging them sRGB makes WebGPU upload an `-srgb` GPU format and
    // hardware-decode every sample, corrupting the raw values. Callers that
    // only need filtering must be able to opt out of colorSpace entirely by
    // omitting it from a custom TextureOptions object.
    const texture = new Texture()
    const before = texture.colorSpace

    applyTextureOptions(texture, { minFilter: NearestFilter, generateMipmaps: false })

    expect(texture.minFilter).toBe(NearestFilter)
    expect(texture.generateMipmaps).toBe(false)
    expect(texture.colorSpace).toBe(before)
    expect(texture.colorSpace).toBe(NoColorSpace)
  })

  it('applies the requested colorSpace when the caller opts in', () => {
    const texture = new Texture()
    applyTextureOptions(texture, { colorSpace: SRGBColorSpace })
    expect(texture.colorSpace).toBe(SRGBColorSpace)
  })

  it("'pixel-art' preset tags colorSpace as sRGB — for color textures only", () => {
    // Documents the existing, intentional preset behavior: 'pixel-art' is
    // meant for visible sprite/color textures, not scalar data textures.
    // Consumers building a data texture (e.g. a dissolve noise map) must use
    // a custom options object (see the test above) rather than this preset.
    expect(TEXTURE_PRESETS['pixel-art'].colorSpace).toBe(SRGBColorSpace)
  })
})
