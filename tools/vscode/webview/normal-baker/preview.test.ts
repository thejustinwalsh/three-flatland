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
  // Three synthetic texels, all fully opaque:
  //   0: flat normal (0,0,1), elevation 0
  //   1: flat normal (0,0,1), elevation 1 — SAME normal as texel 0, only
  //      elevation differs, to isolate elevation's effect on lighting
  //      from the normal's own contribution
  //   2: tilted toward +X (1,0,0), elevation 0
  const normalRGBA = new Uint8Array([
    128,
    128,
    0,
    255, // flat, elevation 0
    128,
    128,
    255,
    255, // flat, elevation 1
    255,
    128,
    0,
    255, // tilted +X, elevation 0
  ])

  it('lights a flat normal at full brightness under an overhead light at matching height', () => {
    const out = computeLitComposite(normalRGBA, { x: 0, y: 0, lightHeight: 1 })
    expect(out[0]).toBe(255)
    expect(out[1]).toBe(255)
    expect(out[2]).toBe(255)
    expect(out[3]).toBe(255) // alpha preserved
  })

  it('lights a normal at full brightness when the light matches its tilt exactly', () => {
    const out = computeLitComposite(normalRGBA, { x: 1, y: 0, lightHeight: 0 })
    expect(out[8]).toBe(255)
    expect(out[9]).toBe(255)
    expect(out[10]).toBe(255)
  })

  it('clamps a back-facing dot product to zero instead of going negative', () => {
    const out = computeLitComposite(normalRGBA, { x: -1, y: 0, lightHeight: 0 })
    expect(out[8]).toBe(0)
    expect(out[9]).toBe(0)
    expect(out[10]).toBe(0)
  })

  it('reads elevation from the B channel — same normal, different elevation, different light', () => {
    // Light directly overhead at height 1. Texel 0 (elevation 0) sees the
    // light straight up (Lz = 1 - 0 = 1, full brightness). Texel 1 (same
    // normal, elevation 1) sees the light AT its own height (Lz = 1 - 1 =
    // 0, grazing — the light is level with the surface, not above it).
    const out = computeLitComposite(normalRGBA, { x: 0, y: 0, lightHeight: 1 })
    expect(out[0]).toBe(255) // texel 0: full brightness
    expect(out[4]).toBe(0) // texel 1: grazing → zero
  })

  it("a light below a texel's elevation stops lighting it (torch-below-wall-cap case)", () => {
    // lightHeight 0.5, texel 1 at elevation 1 → Lz = 0.5 - 1 = -0.5 (light
    // is BELOW the surface) → clamped to zero, not a wrapped/negative value.
    const out = computeLitComposite(normalRGBA, { x: 0, y: 0, lightHeight: 0.5 })
    expect(out[4]).toBe(0)
  })

  it('normalizes a non-unit light vector', () => {
    const unit = computeLitComposite(normalRGBA, { x: 0, y: 0, lightHeight: 1 })
    const scaled = computeLitComposite(normalRGBA, { x: 0, y: 0, lightHeight: 50 })
    // Both have elevation-0 lz proportional to their lightHeight — scaling
    // lightHeight scales lz the same way scaling z used to, so the
    // normalized result at texel 0 (elevation 0) is identical.
    expect(scaled[0]).toBe(unit[0])
  })
})

describe('orbitingLight', () => {
  it('always returns a unit vector in the XY plane', () => {
    for (const t of [0, 1.3, 7.25, 42]) {
      const l = orbitingLight(t)
      expect(Math.hypot(l.x, l.y)).toBeCloseTo(1, 6)
    }
  })

  it('holds lightHeight fixed regardless of orbit position', () => {
    const a = orbitingLight(0, { lightHeight: 0.75 })
    const b = orbitingLight(3, { lightHeight: 0.75 })
    expect(a.lightHeight).toBe(0.75)
    expect(b.lightHeight).toBe(0.75)
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
