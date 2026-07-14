import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DataUtils } from 'three'
import { parseFont } from './fontParser'
import { packTextures, packRefCoord, unpackRefCoord, halfFloatHullMax } from './texturePacker'

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

  it('stores finite band data (headers integer, ref R packed integer, ref G em hull)', () => {
    const { textures } = loadAndPack()
    const data = textures.bandTexture.image.data as Float32Array
    for (let i = 0; i < Math.min(data.length, 2000); i++) {
      expect(Number.isFinite(data[i]!)).toBe(true)
    }
  })

  it('packs each band ref as (packed-coord R, axis-hull G) matching the curve texels', () => {
    // Walk glyph H's bands and validate the v2 ref layout end-to-end: R unpacks
    // to a valid curve texel, G equals the max axis coord of the SAME half-float
    // control points the shader decodes (a safe outward early-exit bound).
    const { glyphs, textures } = loadAndPack()
    const W = textures.textureWidth
    const bandData = textures.bandTexture.image.data as Float32Array
    const curveData = textures.curveTexture.image.data as Uint16Array
    const h = glyphs.get(161)! // H glyph
    const base = h.bandLocation.y * W + h.bandLocation.x
    const numH = h.bands.hBands.length

    const checkGroup = (bands: typeof h.bands.hBands, headerBase: number, axis: 0 | 1) => {
      let sawRef = false
      for (let b = 0; b < bands.length; b++) {
        const hdr = (headerBase + b) * 2
        const count = bandData[hdr]!
        const listOffset = bandData[hdr + 1]!
        expect(count).toBe(bands[b]!.curveIndices.length)
        for (let j = 0; j < count; j++) {
          const refLinear = base + listOffset + j
          const packed = bandData[refLinear * 2]! // R = curve-texel linear offset
          const hull = bandData[refLinear * 2 + 1]! // G = axis hull-max (em-space)
          const { x: cx, y: cy } = unpackRefCoord(packed)
          expect(cx).toBeGreaterThanOrEqual(0)
          expect(cx).toBeLessThan(W)
          expect(cy).toBeGreaterThanOrEqual(0)
          // packed IS the linear curve-texel offset; texel0=[p0,p1], texel1=[p2]
          const c0 = packed * 4
          const c1 = (packed + 1) * 4
          const a0 = DataUtils.fromHalfFloat(curveData[c0 + axis]!)
          const a1 = DataUtils.fromHalfFloat(curveData[c0 + 2 + axis]!)
          const a2 = DataUtils.fromHalfFloat(curveData[c1 + axis]!)
          expect(hull).toBe(Math.max(a0, a1, a2))
          expect(hull).toBeGreaterThanOrEqual(a0)
          expect(hull).toBeGreaterThanOrEqual(a1)
          expect(hull).toBeGreaterThanOrEqual(a2)
          sawRef = true
        }
      }
      expect(sawRef).toBe(true)
    }

    checkGroup(h.bands.hBands, base, 0) // h-bands pack max-X
    checkGroup(h.bands.vBands, base + numH, 1) // v-bands pack max-Y
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

describe('packRefCoord / unpackRefCoord', () => {
  it('round-trips a range of curve-texel coords', () => {
    for (const y of [0, 1, 2, 100, 4095]) {
      for (const x of [0, 1, 2048, 4095]) {
        expect(unpackRefCoord(packRefCoord(x, y))).toEqual({ x, y })
      }
    }
  })

  it('matches the shader unpack (& (W-1), >> 12)', () => {
    const packed = packRefCoord(1234, 56)
    expect(packed).toBe(56 * 4096 + 1234)
    // The shader uses bitAnd(4095) / shiftRight(12); arithmetic must agree.
    expect(packed & 4095).toBe(1234)
    expect(packed >>> 12).toBe(56)
    expect(Math.floor(packed / 4096)).toBe(56)
  })

  it('stays exactly float32-representable at the max curve row', () => {
    const packed = packRefCoord(4095, 4095)
    expect(packed).toBe(2 ** 24 - 1)
    expect(Math.fround(packed)).toBe(packed) // lossless in float32
  })

  it('throws when the curve row would overflow the packing', () => {
    expect(() => packRefCoord(0, 4096)).toThrow(/exact-integer range/)
  })
})

describe('halfFloatHullMax (early-exit hull, outward-safe)', () => {
  it('returns the max of the half-float-rounded control points', () => {
    const a = 0.12345
    const b = -0.98765
    const c = 1.05
    const ha = DataUtils.fromHalfFloat(DataUtils.toHalfFloat(a))
    const hb = DataUtils.fromHalfFloat(DataUtils.toHalfFloat(b))
    const hc = DataUtils.fromHalfFloat(DataUtils.toHalfFloat(c))
    const hull = halfFloatHullMax(a, b, c)
    expect(hull).toBe(Math.max(ha, hb, hc))
    // Outward-safe: >= every value the shader decodes, so the early-exit
    // never culls a curve the shader would include.
    expect(hull).toBeGreaterThanOrEqual(ha)
    expect(hull).toBeGreaterThanOrEqual(hb)
    expect(hull).toBeGreaterThanOrEqual(hc)
  })

  it('is idempotent under re-rounding (safe to feed already-decoded texels)', () => {
    const vals: [number, number, number] = [0.3, -0.7, 1.1]
    const decoded = vals.map((v) => DataUtils.fromHalfFloat(DataUtils.toHalfFloat(v))) as [
      number,
      number,
      number,
    ]
    expect(halfFloatHullMax(...decoded)).toBe(halfFloatHullMax(...vals))
  })
})
