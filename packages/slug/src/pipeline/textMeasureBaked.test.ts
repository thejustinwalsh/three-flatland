import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { parseFont } from './fontParser.js'
import { packTextures } from './texturePacker.js'
import { measureText } from './textMeasure.js'
import { measureTextBaked } from './textMeasureBaked.js'
import { packBaked, unpackBaked } from '../baked.js'
import type { BakedFontData, BakedJSON } from '../baked.js'
import type { SlugGlyphData } from '../types.js'

const FONT_PATH = resolve(__dirname, '../../../../examples/three/slug-text/public/Inter-Regular.ttf')
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

let glyphs: Map<number, SlugGlyphData>
let unitsPerEm: number
let ascender: number
let descender: number
let baked: BakedFontData
let otFont: opentype.Font

beforeAll(() => {
  const parsed = parseFont(arrayBuffer)
  glyphs = parsed.glyphs
  unitsPerEm = parsed.unitsPerEm
  ascender = parsed.ascender
  descender = parsed.descender
  otFont = opentype.parse(arrayBuffer)

  // Build a minimal BakedFontData with just cmap + kern lookups.
  const cmapCodes: number[] = []
  const cmapGlyphs: number[] = []
  for (let c = 0x20; c <= 0x7E; c++) {
    const g = otFont.charToGlyph(String.fromCharCode(c))
    if (g && g.index !== 0) {
      cmapCodes.push(c)
      cmapGlyphs.push(g.index)
    }
  }
  baked = {
    glyphs,
    cmapCodes: new Uint16Array(cmapCodes),
    cmapGlyphs: new Uint16Array(cmapGlyphs),
    kernData: new Int16Array(0),
    kernCount: 0,
  } as unknown as BakedFontData
})

describe('measureTextBaked', () => {
  it('width matches the opentype path to within half-float precision', () => {
    const runtime = measureText(otFont, glyphs, 'Hello', 48)
    const bakedMeasured = measureTextBaked(baked, glyphs, unitsPerEm, ascender, descender, 'Hello', 48)
    expect(bakedMeasured.width).toBeCloseTo(runtime.width, 2)
  })

  it('fontBoundingBoxAscent + Descent = fontSize * (asc − desc)', () => {
    const m = measureTextBaked(baked, glyphs, unitsPerEm, ascender, descender, 'x', 48)
    expect(m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)
      .toBeCloseTo(48 * (ascender - descender), 3)
  })

  it('empty string returns zero width + zero ink bounds', () => {
    const m = measureTextBaked(baked, glyphs, unitsPerEm, ascender, descender, '', 48)
    expect(m.width).toBe(0)
    expect(m.actualBoundingBoxLeft).toBe(0)
    expect(m.actualBoundingBoxRight).toBe(0)
  })

  it('width scales linearly with fontSize', () => {
    const a = measureTextBaked(baked, glyphs, unitsPerEm, ascender, descender, 'Hello', 24)
    const b = measureTextBaked(baked, glyphs, unitsPerEm, ascender, descender, 'Hello', 48)
    expect(b.width).toBeCloseTo(a.width * 2, 2)
  })

  /**
   * Regression: unpackBaked discards the glyph `curves` array at runtime
   * (curve data lives in the GPU texture), so any outline-detection
   * heuristic based on `curves.length > 0` misfires and the ink-bounds
   * accumulator silently skips every glyph — returning a zero-size
   * actualBoundingBox. The measure code must use bounds-area instead.
   */
  it('roundtrip via pack/unpack still produces non-zero ink bounds', () => {
    const textures = packTextures(glyphs)
    const curveData = (textures.curveTexture.image as { data: Uint16Array }).data
    const bandData = (textures.bandTexture.image as { data: Float32Array }).data
    const curveHeight = (textures.curveTexture.image as { height: number }).height
    const bandHeight = (textures.bandTexture.image as { height: number }).height

    // Build a minimal cmap so the roundtrip has something to index.
    const cmap: [number, number][] = []
    for (let c = 0x20; c <= 0x7E; c++) {
      const g = otFont.charToGlyph(String.fromCharCode(c))
      if (g && g.index !== 0) cmap.push([c, g.index])
    }

    const { json, bin } = packBaked({
      metrics: { unitsPerEm, ascender, descender, capHeight: ascender },
      textureWidth: textures.textureWidth,
      curveTextureHeight: curveHeight,
      curveData,
      bandTextureHeight: bandHeight,
      bandData,
      glyphs,
      cmap,
      kern: [],
    })
    const roundtripped = unpackBaked(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, json as BakedJSON)

    const m = measureTextBaked(
      roundtripped,
      roundtripped.glyphs,
      unitsPerEm,
      ascender,
      descender,
      'Hello',
      48,
    )
    expect(m.width).toBeGreaterThan(0)
    // Real ink bounds — cap-height is ~73% of em, should be nonzero
    // and strictly less than the font ascent (48 * 0.97 ≈ 46.5).
    expect(m.actualBoundingBoxAscent).toBeGreaterThan(0)
    expect(m.actualBoundingBoxAscent).toBeLessThan(m.fontBoundingBoxAscent)
    // Right side of ink should be close to (but not greater than) width.
    expect(m.actualBoundingBoxRight).toBeGreaterThan(m.width * 0.9)
    expect(m.actualBoundingBoxRight).toBeLessThanOrEqual(m.width + 0.5)
  })
})
