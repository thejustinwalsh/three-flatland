import { describe, it, expect } from 'vitest'
import { bakeNormalMapFromPixels, bakedNormalURL } from './bake.js'

// Helpers for readable pixel assembly.
function solidSquare(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 4)
  buf.fill(255)
  return buf
}

function alphaAt(buf: Uint8Array, x: number, y: number, w: number): number {
  return buf[(y * w + x) * 4 + 3]!
}

function rgbAt(
  buf: Uint8Array,
  x: number,
  y: number,
  w: number
): [number, number, number] {
  const i = (y * w + x) * 4
  return [buf[i]!, buf[i + 1]!, buf[i + 2]!]
}

describe('bakeNormalMapFromPixels', () => {
  it('produces a flat normal on fully-opaque input (no gradient)', () => {
    const w = 8
    const h = 8
    const input = solidSquare(w, h)
    const out = bakeNormalMapFromPixels(input, w, h)

    // Encoding: R/G = nx/ny (128 = 0), B = elevation (0 = ground).
    // Runtime reconstructs nz = sqrt(1 − nx² − ny²) = 1 for a flat bake.
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const [r, g, b] = rgbAt(out, x, y, w)
        expect(r).toBe(128)
        expect(g).toBe(128)
        expect(b).toBe(0)
      }
    }
  })

  it('preserves the source alpha channel', () => {
    const w = 4
    const h = 4
    const input = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      input[i * 4 + 3] = i * 16 // 0, 16, 32, …
    }
    const out = bakeNormalMapFromPixels(input, w, h)
    for (let i = 0; i < w * h; i++) {
      expect(out[i * 4 + 3]).toBe(input[i * 4 + 3])
    }
  })

  it('encodes edges with xy components pointing outward from the silhouette', () => {
    // Construct a vertical-edge step: left half alpha=255, right half alpha=0.
    // The gradient dx at the boundary is negative (going right decreases alpha),
    // so the baked normal's x should be positive (= outward from the filled side).
    const w = 4
    const h = 4
    const input = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        input[idx + 3] = x < w / 2 ? 255 : 0
      }
    }

    const out = bakeNormalMapFromPixels(input, w, h)

    // At the transition (x=1 or x=2, mid rows) we expect a strong +x in the normal.
    const [r1] = rgbAt(out, 1, 2, w)
    const [r2] = rgbAt(out, 2, 2, w)
    // r > 128 → normal.x > 0 (pointing toward the filled side).
    expect(r1).toBeGreaterThan(128)
    expect(r2).toBeGreaterThan(128)
    // nz reconstruction at runtime = sqrt(1 − nx² − ny²), always ≥ 0 —
    // no direct B-channel assertion needed here since B now carries
    // elevation (0 by default).
  })

  it('scales gradient with strength option', () => {
    const w = 4
    const h = 4
    const input = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        input[idx + 3] = x < w / 2 ? 255 : 0
      }
    }

    const low = bakeNormalMapFromPixels(input, w, h, { strength: 0.1 })
    const high = bakeNormalMapFromPixels(input, w, h, { strength: 4 })

    // Greater strength → greater deviation of r from the flat-normal 128.
    const lowDev = Math.abs(rgbAt(low, 1, 2, w)[0] - 128)
    const highDev = Math.abs(rgbAt(high, 1, 2, w)[0] - 128)
    expect(highDev).toBeGreaterThan(lowDev)
  })

  it('clamps at image borders (no out-of-bounds reads)', () => {
    // 1×1 image must produce a valid flat normal — proves border clamping works.
    const out = bakeNormalMapFromPixels(new Uint8Array([0, 0, 0, 200]), 1, 1)
    expect(out.length).toBe(4)
    const [r, g, b] = rgbAt(out, 0, 0, 1)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(0) // elevation default = ground
    expect(alphaAt(out, 0, 0, 1)).toBe(200)
  })
})

describe('bakedNormalURL', () => {
  it('swaps .png for .normal.png', () => {
    expect(bakedNormalURL('/sprites/knight.png')).toBe('/sprites/knight.normal.png')
  })

  it('preserves query strings', () => {
    expect(bakedNormalURL('/sprites/knight.png?v=3')).toBe(
      '/sprites/knight.normal.png?v=3'
    )
  })

  it('is case-insensitive on the extension', () => {
    expect(bakedNormalURL('/x.PNG')).toBe('/x.normal.png')
  })
})
