import { describe, it, expect } from 'vitest'
import { NearestFilter, LinearFilter, Texture } from 'three'
import { SDFGenerator } from './SDFGenerator'

// Reach into the private RTs the same way other tests cast to read internals.
// `needsUpdate` is a write-only accessor on three's Texture (the getter returns
// undefined); setting it to true bumps `version`, so assert on `version` to
// observe that the texture was flagged for re-upload.
interface SDFInternals {
  _sdfRT: { texture: { minFilter: number; magFilter: number; version: number } }
  _sdfBlurRT: { texture: { minFilter: number; magFilter: number; version: number } }
  _pingRT: { texture: { minFilter: number; magFilter: number } }
  _pongRT: { texture: { minFilter: number; magFilter: number } }
}

interface DisposableResource {
  addEventListener(type: 'dispose', listener: () => void): void
}

describe('SDFGenerator.setFilter', () => {
  it('defaults the SDF output to NearestFilter', () => {
    const gen = new SDFGenerator()
    gen.init(8, 8)
    const internals = gen as unknown as SDFInternals
    expect(internals._sdfRT.texture.magFilter).toBe(NearestFilter)
    expect(internals._sdfRT.texture.minFilter).toBe(NearestFilter)
    gen.dispose()
  })

  it('switches the SDF + blur RTs to LinearFilter and flags needsUpdate', () => {
    const gen = new SDFGenerator()
    gen.init(8, 8)
    const internals = gen as unknown as SDFInternals

    const sdfVersion = internals._sdfRT.texture.version
    const blurVersion = internals._sdfBlurRT.texture.version
    gen.setFilter(LinearFilter)
    expect(internals._sdfRT.texture.magFilter).toBe(LinearFilter)
    expect(internals._sdfRT.texture.minFilter).toBe(LinearFilter)
    expect(internals._sdfRT.texture.version).toBeGreaterThan(sdfVersion)
    expect(internals._sdfBlurRT.texture.magFilter).toBe(LinearFilter)
    expect(internals._sdfBlurRT.texture.minFilter).toBe(LinearFilter)
    expect(internals._sdfBlurRT.texture.version).toBeGreaterThan(blurVersion)
    gen.dispose()
  })

  it('flips back to NearestFilter', () => {
    const gen = new SDFGenerator()
    gen.init(8, 8)
    const internals = gen as unknown as SDFInternals

    gen.setFilter(LinearFilter)
    gen.setFilter(NearestFilter)
    expect(internals._sdfRT.texture.magFilter).toBe(NearestFilter)
    expect(internals._sdfBlurRT.texture.minFilter).toBe(NearestFilter)
    gen.dispose()
  })

  it('never touches the JFA ping-pong RTs (they stay NearestFilter)', () => {
    const gen = new SDFGenerator()
    gen.init(8, 8)
    const internals = gen as unknown as SDFInternals

    gen.setFilter(LinearFilter)
    expect(internals._pingRT.texture.minFilter).toBe(NearestFilter)
    expect(internals._pingRT.texture.magFilter).toBe(NearestFilter)
    expect(internals._pongRT.texture.minFilter).toBe(NearestFilter)
    expect(internals._pongRT.texture.magFilter).toBe(NearestFilter)
    gen.dispose()
  })

  it('is a no-op when called twice with the same value', () => {
    const gen = new SDFGenerator()
    gen.init(8, 8)
    const internals = gen as unknown as SDFInternals

    gen.setFilter(LinearFilter)
    // A redundant re-set must not bump version (the early-return short-circuits
    // before touching the texture).
    const versionAfterFirst = internals._sdfRT.texture.version
    expect(() => gen.setFilter(LinearFilter)).not.toThrow()
    expect(internals._sdfRT.texture.version).toBe(versionAfterFirst)
    gen.dispose()
  })
})

describe('SDFGenerator.dispose', () => {
  it('preserves the first falsy error while disposing every resource exactly once under reentry', () => {
    const gen = new SDFGenerator()
    const occlusionTexture = new Texture()
    const internals = gen as unknown as {
      _ensureSeedMaterial(texture: Texture): void
      _pingRT: DisposableResource
      _pongRT: DisposableResource
      _sdfRT: DisposableResource
      _sdfBlurRT: DisposableResource
      _seedMaterial: DisposableResource
      _jfaMaterialA: DisposableResource
      _jfaMaterialB: DisposableResource
      _finalMaterialA: DisposableResource
      _finalMaterialB: DisposableResource
      _blurHMaterial: DisposableResource
      _blurVMaterial: DisposableResource
    }
    internals._ensureSeedMaterial(occlusionTexture)
    const resources = [
      internals._pingRT,
      internals._pongRT,
      internals._sdfRT,
      internals._sdfBlurRT,
      internals._seedMaterial,
      internals._jfaMaterialA,
      internals._jfaMaterialB,
      internals._finalMaterialA,
      internals._finalMaterialB,
      internals._blurHMaterial,
      internals._blurVMaterial,
    ]
    const disposeCounts = resources.map(() => 0)
    resources.forEach((resource, index) => {
      resource.addEventListener('dispose', () => {
        disposeCounts[index]++
        if (index === 0) {
          gen.dispose()
          throw 0
        }
      })
    })

    let didThrow = false
    let thrown: unknown
    try {
      gen.dispose()
    } catch (error) {
      didThrow = true
      thrown = error
    }

    expect(didThrow).toBe(true)
    expect(thrown).toBe(0)
    expect(disposeCounts).toEqual(resources.map(() => 1))
    expect(() => gen.dispose()).not.toThrow()
    expect(disposeCounts).toEqual(resources.map(() => 1))
    occlusionTexture.dispose()
  })
})
