import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DataUtils } from 'three'
import { parseFont } from './fontParser'
import { packTextures } from './texturePacker'

const FONT_PATH = resolve(
  __dirname,
  '../../../../examples/three/slug-text/public/Inter-Regular.ttf'
)

function loadAndPack() {
  const buf = readFileSync(FONT_PATH)
  const { glyphs } = parseFont(buf.buffer as ArrayBuffer)
  return { glyphs, textures: packTextures(glyphs) }
}

describe('texturePacker', () => {
  it('creates power-of-2 textures', () => {
    const { textures } = loadAndPack()
    const { curveTexture, bandTexture } = textures

    const cw = curveTexture.image.width
    const ch = curveTexture.image.height
    const bw = bandTexture.image.width
    const bh = bandTexture.image.height

    expect(cw & (cw - 1)).toBe(0) // power of 2
    expect(ch & (ch - 1)).toBe(0)
    expect(bw & (bw - 1)).toBe(0)
    expect(bh & (bh - 1)).toBe(0)
  })

  it('sets texture width to 4096', () => {
    const { textures } = loadAndPack()
    expect(textures.textureWidth).toBe(4096)
    expect(textures.curveTexture.image.width).toBe(4096)
    expect(textures.bandTexture.image.width).toBe(4096)
  })

  it('assigns valid band locations to all glyphs', () => {
    const { glyphs } = loadAndPack()
    for (const glyph of glyphs.values()) {
      expect(glyph.bandLocation.x).toBeGreaterThanOrEqual(0)
      expect(glyph.bandLocation.x).toBeLessThan(4096)
      expect(glyph.bandLocation.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('assigns valid curve locations to all glyphs', () => {
    const { glyphs } = loadAndPack()
    for (const glyph of glyphs.values()) {
      expect(glyph.curveLocation.x).toBeGreaterThanOrEqual(0)
      expect(glyph.curveLocation.x).toBeLessThan(4096)
      expect(glyph.curveLocation.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('stores curve data as finite float values', () => {
    const { textures } = loadAndPack()
    const data = textures.curveTexture.image.data as Float32Array
    // Spot check first 1000 values — all should be finite
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      expect(isFinite(data[i]!)).toBe(true)
    }
  })

  it('stores band data as non-negative integer-valued floats', () => {
    const { textures } = loadAndPack()
    const data = textures.bandTexture.image.data as Float32Array
    // Band data encodes integers as floats — all should be >= 0 and integer-valued
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      const v = data[i]!
      if (v !== 0) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v % 1).toBeCloseTo(0, 5) // integer-valued
      }
    }
  })

  it('curve texture contains correct control point data for glyph H', () => {
    const { glyphs, textures } = loadAndPack()
    const h = glyphs.get(161)! // H glyph
    // Curve texture is RGBA16F — decode Uint16 half-float bits back to Float32.
    const data = textures.curveTexture.image.data as Uint16Array
    const width = textures.textureWidth

    const cx = h.curveLocation.x
    const cy = h.curveLocation.y
    const idx = (cy * width + cx) * 4

    const p0x = DataUtils.fromHalfFloat(data[idx]!)
    const p0y = DataUtils.fromHalfFloat(data[idx + 1]!)
    const p1x = DataUtils.fromHalfFloat(data[idx + 2]!)
    const p1y = DataUtils.fromHalfFloat(data[idx + 3]!)

    // Half-float has ~3 decimal digits of precision in [-1, 1] range —
    // loosen tolerance from 5 to 3.
    expect(p0x).toBeCloseTo(h.curves[0]!.p0x, 3)
    expect(p0y).toBeCloseTo(h.curves[0]!.p0y, 3)
    expect(p1x).toBeCloseTo(h.curves[0]!.p1x, 3)
    expect(p1y).toBeCloseTo(h.curves[0]!.p1y, 3)
  })
})
