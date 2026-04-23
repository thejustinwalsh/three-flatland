import { describe, it, expect } from 'vitest'
import { OcclusionPass } from './OcclusionPass'
import { NearestFilter, LinearFilter } from 'three'

describe('OcclusionPass', () => {
  it('starts at a 1×1 placeholder RT before first resize', () => {
    const pass = new OcclusionPass()
    expect(pass.width).toBe(1)
    expect(pass.height).toBe(1)
    expect(pass.renderTarget).toBeDefined()
    pass.dispose()
  })

  it('applies the default 0.5 (half-res) resolution scale', () => {
    const pass = new OcclusionPass()
    pass.resize(1920, 1080)
    expect(pass.width).toBe(960)
    expect(pass.height).toBe(540)
    expect(pass.resolutionScale).toBe(0.5)
    pass.dispose()
  })

  it('honors a custom resolution scale', () => {
    const pass = new OcclusionPass({ resolutionScale: 0.25 })
    pass.resize(1024, 512)
    expect(pass.width).toBe(256)
    expect(pass.height).toBe(128)
    pass.dispose()
  })

  it('clamps to a 1×1 minimum when viewport is absurdly small', () => {
    const pass = new OcclusionPass({ resolutionScale: 0.1 })
    pass.resize(4, 4)
    expect(pass.width).toBeGreaterThanOrEqual(1)
    expect(pass.height).toBeGreaterThanOrEqual(1)
    pass.dispose()
  })

  it('is a no-op when resize arguments match current size', () => {
    const pass = new OcclusionPass()
    pass.resize(800, 600)
    const rt1 = pass.renderTarget
    pass.resize(800, 600)
    // Same reference guaranteed because no setSize was issued.
    expect(pass.renderTarget).toBe(rt1)
    pass.dispose()
  })

  it('preserves the RT reference across resizes (stable texture binding)', () => {
    const pass = new OcclusionPass()
    const rt = pass.renderTarget
    pass.resize(400, 300)
    pass.resize(800, 600)
    expect(pass.renderTarget).toBe(rt)
    pass.dispose()
  })

  it('uses NearestFilter by default to match SDFGenerator seeding', () => {
    const pass = new OcclusionPass()
    expect(pass.renderTarget.texture.minFilter).toBe(NearestFilter)
    expect(pass.renderTarget.texture.magFilter).toBe(NearestFilter)
    pass.dispose()
  })

  it('switches to LinearFilter when opted in', () => {
    const pass = new OcclusionPass({ linearFilter: true })
    expect(pass.renderTarget.texture.minFilter).toBe(LinearFilter)
    expect(pass.renderTarget.texture.magFilter).toBe(LinearFilter)
    pass.dispose()
  })

  it('dispose() does not throw', () => {
    const pass = new OcclusionPass()
    pass.resize(256, 256)
    expect(() => pass.dispose()).not.toThrow()
  })

  it('caches occlusion materials per source texture', async () => {
    const { Texture } = await import('three')
    const { Sprite2DMaterial } = await import('../materials/Sprite2DMaterial')

    const pass = new OcclusionPass()
    const tex = new Texture()
    const mat = new Sprite2DMaterial({ map: tex })

    // Access the private cache via the private-field back door for test.
    const cache = (pass as unknown as {
      _occlusionMaterials: Map<unknown, unknown>
    })._occlusionMaterials
    expect(cache.size).toBe(0)

    const getOrCreate = (pass as unknown as {
      _getOrCreateOcclusionMaterial: (t: unknown) => unknown
    })._getOrCreateOcclusionMaterial.bind(pass)

    const first = getOrCreate(tex)
    const second = getOrCreate(tex)
    expect(first).toBe(second)
    expect(cache.size).toBe(1)

    pass.dispose()
    expect(cache.size).toBe(0)

    mat.dispose()
  })
})
