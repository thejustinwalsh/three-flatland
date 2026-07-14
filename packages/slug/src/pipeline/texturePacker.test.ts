import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DataUtils } from 'three'
import { parseFont } from './fontParser'
import { packHeader, packRefCoord, packTextures } from './texturePacker'
import type { Band, SlugGlyphData } from '../types'

// Mirror the shader decode (shaders/slugFragment.ts + slugStroke.ts):
//   header  = curveCount << 14 | curveListOffset
//   curveRef = texelY << 12 | texelX
const decodeHeader = (packed: number) => ({ count: packed >>> 14, offset: packed & 16383 })
const decodeRef = (packed: number) => ({ x: packed & 4095, y: packed >>> 12 })

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

describe('band texel packing (R32F, packed single channel)', () => {
  it('packHeader round-trips count/offset through the shader decode', () => {
    const cases: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [40, 1234],
      [512, 16383], // MAX_SAFE_BAND_CURVES count, max offset
      [1023, 16383], // both fields at max → 2^24-1
    ]
    for (const [count, offset] of cases) {
      const packed = packHeader(count, offset)
      expect(Number.isInteger(packed)).toBe(true)
      expect(packed).toBeLessThanOrEqual(16_777_215) // 2^24-1, exact in float32
      // Round-trips through a float32 store, exactly (integers ≤ 2^24-1).
      expect(new Float32Array([packed])[0]).toBe(packed)
      const d = decodeHeader(packed)
      expect(d.count).toBe(count)
      expect(d.offset).toBe(offset)
    }
  })

  it('packRefCoord round-trips texelX/texelY through the shader decode', () => {
    const cases: [number, number][] = [
      [0, 0],
      [4095, 0],
      [0, 4095],
      [123, 45],
      [4095, 4095], // both fields at max → 2^24-1
    ]
    for (const [x, y] of cases) {
      const packed = packRefCoord(x, y)
      expect(Number.isInteger(packed)).toBe(true)
      expect(packed).toBeLessThanOrEqual(16_777_215)
      expect(new Float32Array([packed])[0]).toBe(packed)
      const d = decodeRef(packed)
      expect(d.x).toBe(x)
      expect(d.y).toBe(y)
    }
  })

  it('both encodings pack their max input to exactly 2^24-1', () => {
    expect(packHeader(1023, 16383)).toBe(16_777_215)
    expect(packRefCoord(4095, 4095)).toBe(16_777_215)
  })

  it('packHeader guards out-of-range count/offset with a RangeError', () => {
    expect(() => packHeader(1024, 0)).toThrow(RangeError) // count > 1023
    expect(() => packHeader(0, 16384)).toThrow(RangeError) // offset > 16383
    expect(() => packHeader(-1, 0)).toThrow(RangeError)
    expect(() => packHeader(1.5, 0)).toThrow(RangeError)
  })

  it('packRefCoord guards out-of-range texelY with a RangeError', () => {
    expect(() => packRefCoord(0, 4096)).toThrow(RangeError) // texelY > 4095
    expect(() => packRefCoord(0, -1)).toThrow(RangeError)
    expect(() => packRefCoord(0, 1.5)).toThrow(RangeError)
  })

  // Build a single synthetic glyph whose bands reference three curves laid out
  // as one contour, so curveTexelMap is [0, 1, 2] → packRefCoord decodes to
  // x = curve index, y = 0. Lets a test read a band's refs back as curve indices.
  const curve = (i: number) => ({
    p0x: i,
    p0y: 0,
    p1x: i + 0.1,
    p1y: 0.1,
    p2x: i + 0.2,
    p2y: 0.2,
  })
  function makeGlyph(hBands: Band[], vBands: Band[]): SlugGlyphData {
    return {
      glyphId: 1,
      curves: [curve(0), curve(1), curve(2)],
      contourStarts: [0],
      bands: { hBands, vBands },
      bounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
      advanceWidth: 1,
      lsb: 0,
      bandLocation: { x: 0, y: 0 },
      curveLocation: { x: 0, y: 0 },
    }
  }

  it('dedups ANY identical curve-ref list (not just adjacent); distinct lists stay distinct', () => {
    // hBand[0] and hBand[2] are identical but NON-adjacent (the old adjacent-only
    // dedup would re-emit hBand[2]); hBand[1] is distinct; the vBand repeats the
    // same list across the h/v group boundary.
    const glyph = makeGlyph(
      [{ curveIndices: [0, 1] }, { curveIndices: [2] }, { curveIndices: [0, 1] }],
      [{ curveIndices: [0, 1] }]
    )
    const { bandTexture, textureWidth } = packTextures(new Map([[1, glyph]]))
    const data = bandTexture.image.data as Float32Array
    const base = glyph.bandLocation.y * textureWidth + glyph.bandLocation.x

    // Header layout: 3 hBand headers, then 1 vBand header.
    const h0 = decodeHeader(data[base + 0]!)
    const h1 = decodeHeader(data[base + 1]!)
    const h2 = decodeHeader(data[base + 2]!)
    const v0 = decodeHeader(data[base + 3]!)

    // Counts are untouched by dedup.
    expect(h0.count).toBe(2)
    expect(h1.count).toBe(1)
    expect(h2.count).toBe(2)
    expect(v0.count).toBe(2)

    // Identical lists share ONE offset — non-adjacent (h2) and cross-group (v0).
    expect(h2.offset).toBe(h0.offset)
    expect(v0.offset).toBe(h0.offset)
    // A distinct list gets its own offset.
    expect(h1.offset).not.toBe(h0.offset)

    // The shared offset decodes to exactly curve indices [0, 1]; the distinct
    // one to [2] — dedup shares storage without changing what a band resolves to.
    expect(decodeRef(data[base + h0.offset]!)).toEqual({ x: 0, y: 0 })
    expect(decodeRef(data[base + h0.offset + 1]!)).toEqual({ x: 1, y: 0 })
    expect(decodeRef(data[base + h1.offset]!)).toEqual({ x: 2, y: 0 })

    // Only two distinct lists are emitted (2 + 1 ref texels) after the 4 headers,
    // so the whole glyph occupies 7 band texels — the [0,1] list is stored once.
    expect(h0.offset).toBe(4) // first ref list starts right after the 4 headers
    expect(h1.offset).toBe(6) // [0,1] took texels 4-5, [2] starts at 6
  })

  it('every real-font band texel decodes to valid (count,offset) or (x,y) ranges', () => {
    const { textures } = loadAndPack()
    const data = textures.bandTexture.image.data as Float32Array
    // Spot-check the first 2000 populated texels: each is either a header or a
    // curve-ref, and both decodes must land inside their field bounds.
    for (let i = 0; i < Math.min(data.length, 2000); i++) {
      const v = data[i]!
      if (v === 0) continue
      expect(Number.isInteger(v)).toBe(true)
      const h = decodeHeader(v)
      const r = decodeRef(v)
      expect(h.count).toBeLessThanOrEqual(1023)
      expect(h.offset).toBeLessThanOrEqual(16383)
      expect(r.x).toBeLessThanOrEqual(4095)
      expect(r.y).toBeLessThanOrEqual(4095)
    }
  })
})
