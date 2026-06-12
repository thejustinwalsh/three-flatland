import { describe, it, expect, vi } from 'vitest'
import { Raycaster, Texture } from 'three'
import { Sprite2D } from './Sprite2D'
import { AlphaMap } from '../events/AlphaMap'

function makeSprite(): Sprite2D {
  const texture = new Texture()
  // @ts-expect-error - mocking image for tests
  texture.image = { width: 100, height: 100 }
  return new Sprite2D({ texture })
}

function makeRaycaster(x: number, y: number, z = 10): Raycaster {
  const r = new Raycaster()
  r.ray.origin.set(x, y, z)
  r.ray.direction.set(0, 0, -1)
  r.near = 0
  r.far = 100
  return r
}

describe('Sprite2D hitTestMode', () => {
  it('defaults to radius', () => {
    expect(makeSprite().hitTestMode).toBe('radius')
  })

  it("'none' nulls the instance raycast property (R3F registration gate)", () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'none'
    expect(sprite.raycast).toBeNull()
  })

  it("leaving 'none' restores the prototype raycast (spec §11.5)", () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'none'
    sprite.hitTestMode = 'bounds'
    expect(typeof sprite.raycast).toBe('function')
    expect(Object.prototype.hasOwnProperty.call(sprite, 'raycast')).toBe(false)
  })
})

describe('Sprite2D.raycast', () => {
  it('bounds mode hits inside the scaled quad and misses outside', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.position.set(10, 10, 0)
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(10, 10).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(19, 19).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(21, 21).intersectObject(sprite)).toHaveLength(0)
  })

  it('radius mode misses the quad corner that bounds mode hits', () => {
    const sprite = makeSprite()
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(9, 9).intersectObject(sprite)).toHaveLength(0)
    expect(makeRaycaster(0, 9).intersectObject(sprite)).toHaveLength(1)
  })

  it('radius mode is an inscribed ellipse under non-uniform scale (spec §11.6)', () => {
    const sprite = makeSprite()
    sprite.scale.set(100, 10, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(45, 0).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(0, 4.5).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(45, 4.5).intersectObject(sprite)).toHaveLength(0)
  })

  it('hitRadius overrides the default 0.5 local radius', () => {
    const sprite = makeSprite()
    sprite.scale.set(20, 20, 1)
    sprite.hitRadius = 1.0
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(15, 0).intersectObject(sprite)).toHaveLength(1)
  })

  it('respects anchor without any raycast-side math (spec §11.4)', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.anchor = [0, 0]
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(10, 10).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(-5, -5).intersectObject(sprite)).toHaveLength(0)
  })

  it('populates the canonical intersection record', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    const [hit] = makeRaycaster(5, 5).intersectObject(sprite)
    expect(hit!.object).toBe(sprite)
    expect(hit!.distance).toBeCloseTo(10)
    expect(hit!.point.x).toBeCloseTo(5)
    expect(hit!.uv!.x).toBeCloseTo(0.75)
    expect(hit!.uv!.y).toBeCloseTo(0.75)
  })

  it('pushes at most one intersection per call (spec §11.3)', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(1)
  })

  it('honors near/far', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'bounds'
    sprite.updateMatrixWorld(true)
    const r = makeRaycaster(0, 0, 10)
    r.far = 5
    expect(r.intersectObject(sprite)).toHaveLength(0)
  })

  it('alpha mode rejects transparent pixels and accepts opaque ones', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'alpha'
    sprite.alphaMap = new AlphaMap(new Uint8Array([255, 255, 0, 0]), 2, 2)
    sprite.scale.set(20, 20, 1)
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(0, 5).intersectObject(sprite)).toHaveLength(1)
    expect(makeRaycaster(0, -5).intersectObject(sprite)).toHaveLength(0)
  })

  it('alphaThreshold gates the sample', () => {
    const sprite = makeSprite()
    sprite.hitTestMode = 'alpha'
    sprite.alphaMap = new AlphaMap(new Uint8Array([100, 100, 100, 100]), 2, 2)
    sprite.updateMatrixWorld(true)
    sprite.alphaThreshold = 0.5
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(0)
    sprite.alphaThreshold = 0.3
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(1)
  })

  it('alpha mode without an alphaMap falls back to bounds with one warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sprite = makeSprite()
    sprite.hitTestMode = 'alpha'
    sprite.updateMatrixWorld(true)
    expect(makeRaycaster(0, 0).intersectObject(sprite)).toHaveLength(1)
    makeRaycaster(0, 0).intersectObject(sprite)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
