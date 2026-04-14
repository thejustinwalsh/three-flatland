import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseFont } from './pipeline/fontParser.js'
import { packTextures } from './pipeline/texturePacker.js'
import { packBaked, unpackBaked, bakedURLs, BAKED_VERSION, cmapLookup, kernLookup } from './baked.js'
import type { BakeInput, BakedJSON } from './baked.js'

// Load Inter for tests
const fontPath = resolve(__dirname, '../../../examples/three/slug-text/public/Inter-Regular.ttf')
const fontBuffer = readFileSync(fontPath)
const arrayBuffer = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength)

const parsed = parseFont(arrayBuffer)
const textures = packTextures(parsed.glyphs)

// Extract a minimal cmap + kern for testing
import opentype from 'opentype.js'
const otFont = opentype.parse(arrayBuffer)

function extractTestCmap(): [number, number][] {
  const cmap: [number, number][] = []
  // Just ASCII for test speed
  for (let c = 0x20; c <= 0x7E; c++) {
    const g = otFont.charToGlyph(String.fromCharCode(c))
    if (g && g.index !== 0) cmap.push([c, g.index])
  }
  cmap.sort((a, b) => a[0]! - b[0]!)
  return cmap
}

function extractTestKern(glyphIds: Set<number>): [number, number, number][] {
  const kern: [number, number, number][] = []
  const ids = [...glyphIds].slice(0, 20) // limit for speed
  for (const g1 of ids) {
    for (const g2 of ids) {
      const glyph1 = otFont.glyphs.get(g1)
      const glyph2 = otFont.glyphs.get(g2)
      if (!glyph1 || !glyph2) continue
      const value = otFont.getKerningValue(glyph1, glyph2)
      if (value !== 0) kern.push([g1, g2, value])
    }
  }
  return kern
}

const cmap = extractTestCmap()
const kern = extractTestKern(new Set(parsed.glyphs.keys()))

const curveData = (textures.curveTexture as any).image.data as Uint16Array
const bandData = (textures.bandTexture as any).image.data as Float32Array
const curveWidth = (textures.curveTexture as any).image.width as number
const curveHeight = (textures.curveTexture as any).image.height as number
const bandHeight = (textures.bandTexture as any).image.height as number

const input: BakeInput = {
  metrics: {
    unitsPerEm: parsed.unitsPerEm,
    ascender: parsed.ascender,
    descender: parsed.descender,
    capHeight: parsed.capHeight,
  },
  textureWidth: curveWidth,
  curveTextureHeight: curveHeight,
  curveData,
  bandTextureHeight: bandHeight,
  bandData,
  glyphs: parsed.glyphs,
  cmap,
  kern,
}

describe('bakedURLs', () => {
  it('derives .slug.json and .slug.bin from font URL', () => {
    const urls = bakedURLs('/fonts/Inter-Regular.ttf')
    expect(urls.json).toBe('/fonts/Inter-Regular.slug.json')
    expect(urls.bin).toBe('/fonts/Inter-Regular.slug.bin')
  })

  it('handles paths without extension', () => {
    const urls = bakedURLs('/fonts/MyFont')
    expect(urls.json).toBe('/fonts/MyFont.slug.json')
    expect(urls.bin).toBe('/fonts/MyFont.slug.bin')
  })
})

describe('packBaked', () => {
  const { json, bin } = packBaked(input)

  it('produces correct version', () => {
    expect(json.version).toBe(BAKED_VERSION)
  })

  it('preserves font metrics', () => {
    expect(json.metrics.unitsPerEm).toBe(parsed.unitsPerEm)
    expect(json.metrics.ascender).toBe(parsed.ascender)
    expect(json.metrics.descender).toBe(parsed.descender)
    expect(json.metrics.capHeight).toBe(parsed.capHeight)
  })

  it('preserves glyph count', () => {
    expect(json.glyphs.count).toBe(parsed.glyphs.size)
  })

  it('preserves cmap count', () => {
    expect(json.cmap.count).toBe(cmap.length)
  })

  it('preserves kern count', () => {
    expect(json.kern.count).toBe(kern.length)
  })

  it('produces binary with correct total size', () => {
    const lastSection = json.kern
    expect(bin.byteLength).toBeGreaterThanOrEqual(lastSection.byteOffset)
  })

  it('curve texture data round-trips correctly', () => {
    // Half-float data — 2 bytes per element.
    const restored = new Uint16Array(
      bin.buffer, bin.byteOffset + json.curveTexture.byteOffset, json.curveTexture.byteLength / 2,
    )
    for (let i = 0; i < Math.min(100, restored.length); i++) {
      expect(restored[i]).toBe(curveData[i])
    }
  })

  it('band texture data round-trips correctly', () => {
    const restored = new Float32Array(
      bin.buffer, bin.byteOffset + json.bandTexture.byteOffset, json.bandTexture.byteLength / 4,
    )
    for (let i = 0; i < Math.min(100, restored.length); i++) {
      expect(restored[i]).toBe(bandData[i])
    }
  })
})

describe('unpackBaked', () => {
  const { json, bin } = packBaked(input)
  const unpacked = unpackBaked(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), json)

  it('restores correct number of glyphs', () => {
    expect(unpacked.glyphs.size).toBe(parsed.glyphs.size)
  })

  it('restores glyph bounds correctly', () => {
    for (const [id, original] of parsed.glyphs) {
      const restored = unpacked.glyphs.get(id)
      expect(restored).toBeDefined()
      expect(restored!.bounds.xMin).toBeCloseTo(original.bounds.xMin, 5)
      expect(restored!.bounds.yMin).toBeCloseTo(original.bounds.yMin, 5)
      expect(restored!.bounds.xMax).toBeCloseTo(original.bounds.xMax, 5)
      expect(restored!.bounds.yMax).toBeCloseTo(original.bounds.yMax, 5)
    }
  })

  it('restores glyph advance widths correctly', () => {
    for (const [id, original] of parsed.glyphs) {
      const restored = unpacked.glyphs.get(id)
      expect(restored!.advanceWidth).toBeCloseTo(original.advanceWidth, 5)
    }
  })

  it('restores band counts correctly', () => {
    for (const [id, original] of parsed.glyphs) {
      const restored = unpacked.glyphs.get(id)
      expect(restored!.bands.hBands.length).toBe(original.bands.hBands.length)
      expect(restored!.bands.vBands.length).toBe(original.bands.vBands.length)
    }
  })

  it('restores band curve indices correctly', () => {
    // Spot check a few glyphs
    let checked = 0
    for (const [id, original] of parsed.glyphs) {
      if (checked > 10) break
      const restored = unpacked.glyphs.get(id)!
      for (let b = 0; b < original.bands.hBands.length; b++) {
        expect(restored.bands.hBands[b]!.curveIndices).toEqual(original.bands.hBands[b]!.curveIndices)
      }
      for (let b = 0; b < original.bands.vBands.length; b++) {
        expect(restored.bands.vBands[b]!.curveIndices).toEqual(original.bands.vBands[b]!.curveIndices)
      }
      checked++
    }
  })

  it('restores cmap data', () => {
    expect(unpacked.cmapCodes.length).toBe(cmap.length)
    expect(unpacked.cmapGlyphs.length).toBe(cmap.length)
  })

  it('restores kern data', () => {
    expect(unpacked.kernCount).toBe(kern.length)
  })
})

describe('cmapLookup', () => {
  const { json, bin } = packBaked(input)
  const unpacked = unpackBaked(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), json)

  it('finds known character mappings', () => {
    // 'A' = 0x41 should map to a valid glyph
    const glyphId = cmapLookup(0x41, unpacked.cmapCodes, unpacked.cmapGlyphs)
    expect(glyphId).toBeGreaterThan(0)
  })

  it('returns 0 for unmapped characters', () => {
    const glyphId = cmapLookup(0xFFFF, unpacked.cmapCodes, unpacked.cmapGlyphs)
    expect(glyphId).toBe(0)
  })
})

describe('kernLookup', () => {
  const { json, bin } = packBaked(input)
  const unpacked = unpackBaked(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength), json)

  it('finds known kerning pairs', () => {
    if (kern.length === 0) return // skip if no kerning
    const [g1, g2, value] = kern[0]!
    const found = kernLookup(g1, g2, unpacked.kernData, unpacked.kernCount)
    expect(found).toBe(value)
  })

  it('returns 0 for unknown pairs', () => {
    const found = kernLookup(99999, 99999, unpacked.kernData, unpacked.kernCount)
    expect(found).toBe(0)
  })
})
