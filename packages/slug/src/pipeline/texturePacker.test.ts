import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { DataUtils } from 'three'
import { parseFont } from './fontParser'
import { packHeader, packRefCoord, packTextures } from './texturePacker'

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
