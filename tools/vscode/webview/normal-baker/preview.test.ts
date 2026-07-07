import { describe, expect, it } from 'vitest'
import { bakePreviewNormalMap, computeLitComposite, orbitingLight } from './preview'

describe('bakePreviewNormalMap', () => {
  it('delegates to @three-flatland/normals — a flat opaque 1×1 pixel bakes to the flat-normal encoding', () => {
    const pixels = new Uint8Array([200, 100, 50, 255])
    const out = bakePreviewNormalMap(pixels, 1, 1, {})
    // R=G=128 (nx=ny=0), B=0 (default elevation), A copied from source.
    expect(Array.from(out)).toEqual([128, 128, 0, 255])
  })
})

describe('computeLitComposite', () => {
  // Two synthetic texels: pixel 0 is a flat normal (0,0,1); pixel 1 is
  // fully tilted toward +X (1,0,0). Both fully opaque.
  const normalRGBA = new Uint8Array([
    128,
    128,
    0,
    255, // flat
    255,
    128,
    0,
    255, // tilted toward +X (nx=1, ny=0, nz=0)
  ])

  it('lights a flat normal at full brightness under an overhead light', () => {
    const out = computeLitComposite(normalRGBA, { x: 0, y: 0, z: 1 })
    expect(out[0]).toBe(255)
    expect(out[1]).toBe(255)
    expect(out[2]).toBe(255)
    expect(out[3]).toBe(255) // alpha preserved
  })

  it('lights a normal at full brightness when the light matches its tilt exactly', () => {
    const out = computeLitComposite(normalRGBA, { x: 1, y: 0, z: 0 })
    expect(out[4]).toBe(255)
    expect(out[5]).toBe(255)
    expect(out[6]).toBe(255)
  })

  it('clamps a back-facing dot product to zero instead of going negative', () => {
    // Light directly opposite the +X-tilted texel's normal.
    const out = computeLitComposite(normalRGBA, { x: -1, y: 0, z: 0 })
    expect(out[4]).toBe(0)
    expect(out[5]).toBe(0)
    expect(out[6]).toBe(0)
  })

  it('normalizes a non-unit light vector', () => {
    const unit = computeLitComposite(normalRGBA, { x: 0, y: 0, z: 1 })
    const scaled = computeLitComposite(normalRGBA, { x: 0, y: 0, z: 50 })
    expect(scaled[0]).toBe(unit[0])
  })
})

describe('orbitingLight', () => {
  it('always returns a unit vector', () => {
    for (const t of [0, 1.3, 7.25, 42]) {
      const l = orbitingLight(t)
      expect(Math.hypot(l.x, l.y, l.z)).toBeCloseTo(1, 6)
    }
  })

  it('advances theta over time when motion is not reduced', () => {
    const a = orbitingLight(0)
    const b = orbitingLight(3)
    expect(a.x === b.x && a.y === b.y).toBe(false)
  })

  it('pins the light at theta=0 when reducedMotion is set, regardless of time', () => {
    const a = orbitingLight(0, { reducedMotion: true })
    const b = orbitingLight(9999, { reducedMotion: true })
    expect(a).toEqual(b)
  })
})
