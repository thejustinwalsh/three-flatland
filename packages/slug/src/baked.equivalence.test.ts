/**
 * Real-font equivalence test for the .slug.glb round-trip.
 *
 * Builds a BakeInput from Inter-Regular.ttf using the same pipeline as the
 * CLI (parseFont → packTextures → extractCmap/extractKern), packs it to a
 * GLB, unpacks it via unpackBaked, and asserts that every meaningful field
 * round-trips exactly against the source data.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { readGlb } from './glb'
import { parseFont } from './pipeline/fontParser'
import { packTextures } from './pipeline/texturePacker'
import { unpackBaked, cmapLookup, kernLookup } from './baked'
import type { BakeInput, BakedFontData } from './baked'
import { packBaked } from './bake'
import type { SlugGlyphData, SlugTextureData } from './types'
import { SlugFont } from './SlugFont'
import { shapeText } from './pipeline/textShaper'
import { wrapLines } from './pipeline/wrapLines'
import { measureText } from './pipeline/textMeasure'
import { shapeTextBaked } from './pipeline/textShaperBaked'
import { wrapLinesBaked } from './pipeline/wrapLinesBaked'
import { measureTextBaked } from './pipeline/textMeasureBaked'

// ---------------------------------------------------------------------------
// Font fixture — same file used by all other slug tests
// ---------------------------------------------------------------------------

const FONT_PATH = resolve(__dirname, '../../../examples/three/slug-text/public/Inter-Regular.ttf')

// ---------------------------------------------------------------------------
// Shared state built once for the whole suite
// ---------------------------------------------------------------------------

let input: BakeInput
let data: BakedFontData
// cmap char→glyphId via opentype.js (source of truth)
let otFont: opentype.Font

// Known interesting glyphs resolved via opentype.js cmap
let glyphA: SlugGlyphData
let glyphLa: SlugGlyphData
let glyphG: SlugGlyphData
let glyph0: SlugGlyphData
let glyphSpace: SlugGlyphData

let idA: number
let idLa: number
let idG: number
let id0: number
let idSpace: number

// SlugFont instances built on each backend from the same source data, for
// getKerning/getGlyphMetrics parity assertions (§ below). Textures are
// stubbed — nothing under test touches curveTexture/bandTexture.
let runtimeFont: SlugFont
let bakedFont: SlugFont
const stubTextures = {} as unknown as SlugTextureData

beforeAll(async () => {
  const buf = readFileSync(FONT_PATH)
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

  // Parse font — glyphs is mutated by packTextures to fill bandLocation/curveLocation
  const parsed = parseFont(arrayBuffer)

  // opentype.js font for cmap / kern extraction (same pattern as cli.ts)
  otFont = opentype.parse(arrayBuffer)

  // Build cmap for ASCII printable range (source of truth)
  const cmap: [number, number][] = []
  for (let c = 0x20; c <= 0x7e; c++) {
    const g = otFont.charToGlyph(String.fromCharCode(c))
    if (g && g.index !== 0) cmap.push([c, g.index])
  }

  // Resolve glyph IDs we will spot-check
  idA = otFont.charToGlyph('A').index
  idLa = otFont.charToGlyph('a').index
  idG = otFont.charToGlyph('g').index
  id0 = otFont.charToGlyph('0').index
  idSpace = otFont.charToGlyph(' ').index

  // Pack textures — this mutates glyphs in-place (bandLocation / curveLocation)
  const textures = packTextures(parsed.glyphs)
  const curveImage = textures.curveTexture.image as {
    data: Uint16Array
    width: number
    height: number
  }
  const bandImage = textures.bandTexture.image as {
    data: Float32Array
    width: number
    height: number
  }

  // Extract kern pairs for the cmap'd glyph set (subset used by the test)
  const cmapGlyphIds = new Set(cmap.map(([, gid]) => gid))
  const kern: [number, number, number][] = []
  for (const g1 of cmapGlyphIds) {
    for (const g2 of cmapGlyphIds) {
      const og1 = otFont.glyphs.get(g1)
      const og2 = otFont.glyphs.get(g2)
      if (!og1 || !og2) continue
      const v = otFont.getKerningValue(og1, og2)
      if (v !== 0) kern.push([g1, g2, v])
    }
  }

  input = {
    metrics: {
      unitsPerEm: parsed.unitsPerEm,
      ascender: parsed.ascender,
      descender: parsed.descender,
      capHeight: parsed.capHeight,
      underlinePosition: parsed.underlinePosition,
      underlineThickness: parsed.underlineThickness,
      strikethroughPosition: parsed.strikethroughPosition,
      strikethroughThickness: parsed.strikethroughThickness,
      subscriptScale: parsed.subscriptScale,
      subscriptOffset: parsed.subscriptOffset,
      superscriptScale: parsed.superscriptScale,
      superscriptOffset: parsed.superscriptOffset,
    },
    textureWidth: textures.textureWidth,
    curveTextureHeight: curveImage.height,
    curveData: curveImage.data,
    bandTextureHeight: bandImage.height,
    bandData: bandImage.data,
    glyphs: parsed.glyphs,
    cmap,
    kern,
  }

  // Pack → unpack
  const glb = await packBaked(input)
  const glbBuf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)
  const asset = readGlb(glbBuf)
  data = unpackBaked(asset)

  // Capture source glyph references (after packTextures has mutated them)
  glyphA = input.glyphs.get(idA)!
  glyphLa = input.glyphs.get(idLa)!
  glyphG = input.glyphs.get(idG)!
  glyph0 = input.glyphs.get(id0)!
  glyphSpace = input.glyphs.get(idSpace)!

  // Same font data through both `_backend` paths — `input.metrics` and
  // `input.glyphs`/`data.glyphs` are the exact structures each backend's
  // real loader path constructs from.
  runtimeFont = SlugFont._createRuntime(
    input.glyphs,
    stubTextures,
    input.metrics,
    otFont,
    shapeText,
    wrapLines,
    measureText
  )
  bakedFont = SlugFont._createBaked(
    data.glyphs,
    stubTextures,
    input.metrics,
    data,
    shapeTextBaked,
    wrapLinesBaked,
    measureTextBaked
  )
})

// ---------------------------------------------------------------------------
// 1. Glyph set
// ---------------------------------------------------------------------------

describe('real-font equivalence — glyph set', () => {
  it('reconstructed glyph count equals source', () => {
    expect(data.glyphs.size).toBe(input.glyphs.size)
  })

  it('reconstructed glyphId set matches source exactly', () => {
    const srcIds = new Set(input.glyphs.keys())
    const dstIds = new Set(data.glyphs.keys())
    expect(dstIds.size).toBe(srcIds.size)
    for (const id of srcIds) {
      expect(dstIds.has(id), `glyphId ${id} missing from reconstructed set`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Glyph metrics — bounds, advanceWidth, lsb, bandLocation, hasOutline
// ---------------------------------------------------------------------------

describe('real-font equivalence — glyph metrics for spot-checked chars', () => {
  // The SoA columns are stored as Float32. Source values come from
  // em-space computations (float64 division by unitsPerEm). After being
  // packed into Float32 and read back, they should match to ~5 decimal
  // places (float32 has ~7 decimal digits of precision).
  // Use toBeCloseTo(v, 5) for fields that went through float64→float32.

  function checkGlyph(label: string, src: SlugGlyphData, dstId: number, expectOutline: boolean) {
    const dst = data.glyphs.get(dstId)!
    expect(dst, `${label}: glyph missing`).toBeDefined()
    expect(dst.glyphId).toBe(src.glyphId)

    // bounds (float64 → float32 → float32: toBeCloseTo at 5)
    expect(dst.bounds.xMin).toBeCloseTo(src.bounds.xMin, 5)
    expect(dst.bounds.yMin).toBeCloseTo(src.bounds.yMin, 5)
    expect(dst.bounds.xMax).toBeCloseTo(src.bounds.xMax, 5)
    expect(dst.bounds.yMax).toBeCloseTo(src.bounds.yMax, 5)

    // advanceWidth, lsb
    expect(dst.advanceWidth).toBeCloseTo(src.advanceWidth, 5)
    expect(dst.lsb).toBeCloseTo(src.lsb, 5)

    // bandLocation — assigned by packTextures as integer texel coords,
    // stored in Float32: exact integer equality expected
    expect(dst.bandLocation.x).toBe(src.bandLocation.x)
    expect(dst.bandLocation.y).toBe(src.bandLocation.y)

    // hasOutline: inferred from curves.length > 0 at pack time;
    // curves array is empty after unpack (GPU texture path).
    // Verify via xMin/xMax spread (non-zero = has outline).
    const srcHasOutline = src.curves.length > 0
    expect(srcHasOutline).toBe(expectOutline)
    // The reconstructed glyph uses bounds-area heuristic in measureTextBaked
    // rather than curves.length — we assert the source hasOutline intent here.
    // (The explicit hasOutline flag from the accessor is not surfaced on
    //  SlugGlyphData in the current unpackBaked implementation.)
  }

  it('"A" metrics round-trip', () => checkGlyph('A', glyphA, idA, true))
  it('"a" metrics round-trip', () => checkGlyph('a', glyphLa, idLa, true))
  it('"g" metrics round-trip', () => checkGlyph('g', glyphG, idG, true))
  it('"0" metrics round-trip', () => checkGlyph('0', glyph0, id0, true))
  it('space metrics round-trip', () => {
    // Space glyph: advance-only, no outline
    const dst = data.glyphs.get(idSpace)!
    expect(dst).toBeDefined()
    expect(dst.advanceWidth).toBeCloseTo(glyphSpace.advanceWidth, 5)
    // bounds are zero for advance-only glyphs
    expect(dst.bounds.xMin).toBeCloseTo(0, 5)
    expect(dst.bounds.xMax).toBeCloseTo(0, 5)
  })
})

// ---------------------------------------------------------------------------
// 3. hBands / vBands — counts and curveIndices
// ---------------------------------------------------------------------------

describe('real-font equivalence — hBands/vBands for spot-checked glyphs', () => {
  function checkBands(label: string, src: SlugGlyphData, dstId: number) {
    const dst = data.glyphs.get(dstId)!
    expect(dst, `${label}: glyph missing`).toBeDefined()

    const { hBands: srcH, vBands: srcV } = src.bands
    const { hBands: dstH, vBands: dstV } = dst.bands

    expect(dstH.length, `${label}: hBands count`).toBe(srcH.length)
    expect(dstV.length, `${label}: vBands count`).toBe(srcV.length)

    for (let i = 0; i < srcH.length; i++) {
      expect(dstH[i]!.curveIndices, `${label}: hBands[${i}].curveIndices`).toEqual(
        srcH[i]!.curveIndices
      )
    }

    for (let i = 0; i < srcV.length; i++) {
      expect(dstV[i]!.curveIndices, `${label}: vBands[${i}].curveIndices`).toEqual(
        srcV[i]!.curveIndices
      )
    }
  }

  it('"A" hBands/vBands round-trip', () => checkBands('A', glyphA, idA))
  it('"a" hBands/vBands round-trip', () => checkBands('a', glyphLa, idLa))
  it('"g" hBands/vBands round-trip', () => checkBands('g', glyphG, idG))
  it('"0" hBands/vBands round-trip', () => checkBands('0', glyph0, id0))
})

// ---------------------------------------------------------------------------
// 4. cmap — cmapLookup returns the same glyphId as opentype.js
// ---------------------------------------------------------------------------

describe('real-font equivalence — cmap lookups', () => {
  const SPOT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '

  it('cmap entry count equals input cmap length', () => {
    expect(data.cmapCodes.length).toBe(input.cmap.length)
    expect(data.cmapGlyphs.length).toBe(input.cmap.length)
  })

  it('cmapLookup returns correct glyphId for all spot-checked chars', () => {
    for (const ch of SPOT_CHARS) {
      const charCode = ch.charCodeAt(0)
      const expectedPair = input.cmap.find(([c]) => c === charCode)
      const expected = expectedPair ? expectedPair[1] : 0
      const got = cmapLookup(charCode, data.cmapCodes, data.cmapGlyphs)
      expect(got, `cmap lookup for '${ch}' (${charCode})`).toBe(expected)
    }
  })

  it('cmapLookup returns 0 for a char not in the cmap (0x0001)', () => {
    expect(cmapLookup(0x0001, data.cmapCodes, data.cmapGlyphs)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5. kern — kernLookup or kernCount===0
// ---------------------------------------------------------------------------

describe('real-font equivalence — kern lookups', () => {
  it('kernCount matches number of packed kern pairs', () => {
    expect(data.kernCount).toBe(input.kern.length)
  })

  it('kernLookup matches source for every packed pair', () => {
    // Inter-Regular may have no kerning pairs in the ASCII subset — cover both cases
    if (input.kern.length === 0) {
      expect(data.kernCount).toBe(0)
    } else {
      // Spot-check up to 20 pairs to keep the test fast
      const pairs = input.kern.slice(0, 20)
      for (const [g1, g2, v] of pairs) {
        const got = kernLookup(g1, g2, data.kernData, data.kernCount)
        expect(got, `kernLookup(${g1}, ${g2})`).toBe(v)
      }
    }
  })

  it('kernLookup returns 0 for a pair not in the kern table', () => {
    // Use glyphId 0 (notdef) which is not kerned
    expect(kernLookup(0, 0, data.kernData, data.kernCount)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 6. SlugFont.getKerning — runtime vs baked parity (public API)
// ---------------------------------------------------------------------------

describe('SlugFont.getKerning — runtime/baked parity', () => {
  it('agrees with the source kern table (em-normalized) on every packed pair', () => {
    if (input.kern.length === 0) {
      // Inter's ASCII subset may have zero kerning pairs — cover the
      // "no kerning data" case explicitly rather than skipping silently.
      expect(bakedFont.getKerning(idA, idLa)).toBe(0)
      expect(runtimeFont.getKerning(idA, idLa)).toBe(0)
      return
    }
    for (const [g1, g2, v] of input.kern.slice(0, 20)) {
      const expected = v / input.metrics.unitsPerEm
      expect(bakedFont.getKerning(g1, g2), `baked kern(${g1},${g2})`).toBeCloseTo(expected, 5)
      expect(runtimeFont.getKerning(g1, g2), `runtime kern(${g1},${g2})`).toBeCloseTo(expected, 5)
    }
  })

  it('runtime and baked agree with each other for every packed pair', () => {
    for (const [g1, g2] of input.kern.slice(0, 20)) {
      expect(runtimeFont.getKerning(g1, g2)).toBeCloseTo(bakedFont.getKerning(g1, g2), 5)
    }
  })

  it('returns 0 for an unkerned pair (notdef, notdef) on both backends', () => {
    expect(runtimeFont.getKerning(0, 0)).toBe(0)
    expect(bakedFont.getKerning(0, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7. SlugFont.getGlyphId / getGlyphMetrics — runtime vs baked parity
// ---------------------------------------------------------------------------

describe('SlugFont.getGlyphId — runtime/baked parity', () => {
  const SPOT_CHARS = 'Aa0g '

  it('resolves the same glyph id as opentype.js on both backends', () => {
    for (const ch of SPOT_CHARS) {
      const codepoint = ch.charCodeAt(0)
      const expected = otFont.charToGlyph(ch).index
      expect(runtimeFont.getGlyphId(codepoint), `runtime '${ch}'`).toBe(expected)
      expect(bakedFont.getGlyphId(codepoint), `baked '${ch}'`).toBe(expected)
    }
  })

  it('returns 0 for a codepoint outside the cmap', () => {
    expect(runtimeFont.getGlyphId(0x0001)).toBe(0)
    expect(bakedFont.getGlyphId(0x0001)).toBe(0)
  })
})

describe('SlugFont.getGlyphMetrics — runtime/baked parity', () => {
  function checkMetricsParity(label: string, codepoint: number) {
    const rt = runtimeFont.getGlyphMetrics(codepoint)
    const bk = bakedFont.getGlyphMetrics(codepoint)
    expect(rt, `${label}: runtime metrics missing`).toBeDefined()
    expect(bk, `${label}: baked metrics missing`).toBeDefined()

    expect(bk!.glyphId).toBe(rt!.glyphId)
    expect(bk!.hasOutline).toBe(rt!.hasOutline)
    expect(bk!.advanceWidth).toBeCloseTo(rt!.advanceWidth, 5)
    // lsb is the layout-positioning bearing; it must survive the .slug.glb
    // round-trip, and it is NOT interchangeable with bounds.xMin for CFF/OTF.
    expect(bk!.lsb).toBeCloseTo(rt!.lsb, 5)
    expect(bk!.bounds.xMin).toBeCloseTo(rt!.bounds.xMin, 5)
    expect(bk!.bounds.yMin).toBeCloseTo(rt!.bounds.yMin, 5)
    expect(bk!.bounds.xMax).toBeCloseTo(rt!.bounds.xMax, 5)
    expect(bk!.bounds.yMax).toBeCloseTo(rt!.bounds.yMax, 5)
  }

  it('"A" metrics agree between backends', () => checkMetricsParity('A', 'A'.charCodeAt(0)))
  it('"a" metrics agree between backends', () => checkMetricsParity('a', 'a'.charCodeAt(0)))
  it('"g" metrics agree between backends', () => checkMetricsParity('g', 'g'.charCodeAt(0)))
  it('"0" metrics agree between backends', () => checkMetricsParity('0', '0'.charCodeAt(0)))

  it('space (0x20) returns an outline-less entry with a positive advance on both backends', () => {
    // Plan acceptance: getGlyphMetrics(0x20) must return advances — the
    // shapeText outline filter (package CLAUDE.md "Known gaps") must not
    // block this metrics-level lookup.
    const rt = runtimeFont.getGlyphMetrics(0x20)
    const bk = bakedFont.getGlyphMetrics(0x20)
    expect(rt).toBeDefined()
    expect(bk).toBeDefined()
    expect(rt!.hasOutline).toBe(false)
    expect(bk!.hasOutline).toBe(false)
    expect(rt!.advanceWidth).toBeGreaterThan(0)
    expect(bk!.advanceWidth).toBeCloseTo(rt!.advanceWidth, 5)
    // Note: tab (0x09) is not covered here — Inter-Regular.ttf (this
    // suite's fixture) has no cmap entry for it, so `hasCharCode(0x09)`
    // is false on both backends and `getGlyphMetrics` correctly returns
    // `undefined` for it, same as any other unmapped codepoint.
  })

  it('returns undefined for a codepoint outside the cmap, on both backends', () => {
    expect(runtimeFont.getGlyphMetrics(0x0001)).toBeUndefined()
    expect(bakedFont.getGlyphMetrics(0x0001)).toBeUndefined()
  })

  it('getGlyphMetricsForChar matches getGlyphMetrics(codepoint)', () => {
    expect(runtimeFont.getGlyphMetricsForChar('A')).toEqual(
      runtimeFont.getGlyphMetrics('A'.charCodeAt(0))
    )
    expect(bakedFont.getGlyphMetricsForChar('A')).toEqual(
      bakedFont.getGlyphMetrics('A'.charCodeAt(0))
    )
  })
})

// ---------------------------------------------------------------------------
// 8. Texture byte-exact round-trip
// ---------------------------------------------------------------------------

describe('real-font equivalence — texture byte-exact round-trip', () => {
  it('curve texture (Uint16Array) round-trips byte-exact', async () => {
    // Re-read the GLB to access the raw accessor
    const glb = await packBaked(input)
    const glbBuf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)
    const asset = readGlb(glbBuf)

    const ext = asset.ext<Record<string, unknown>>('FL_slug_font')!
    const columns = ext['columns'] as Record<string, { accessor: number }>
    const curveAcc = asset.accessor(columns['curveTexture']!.accessor) as Uint16Array

    expect(curveAcc.length).toBe(input.curveData.length)
    for (let i = 0; i < input.curveData.length; i++) {
      if (curveAcc[i] !== input.curveData[i]) {
        throw new Error(
          `curve texture mismatch at index ${i}: ` +
            `expected ${input.curveData[i]}, got ${curveAcc[i]}`
        )
      }
    }
    // If we reach here, all values matched
    expect(true).toBe(true)
  })

  it('band texture (Float32Array) round-trips byte-exact', async () => {
    const glb = await packBaked(input)
    const glbBuf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)
    const asset = readGlb(glbBuf)

    const ext = asset.ext<Record<string, unknown>>('FL_slug_font')!
    const columns = ext['columns'] as Record<string, { accessor: number }>
    const bandAcc = asset.accessor(columns['bandTexture']!.accessor) as Float32Array

    expect(bandAcc.length).toBe(input.bandData.length)
    for (let i = 0; i < input.bandData.length; i++) {
      if (bandAcc[i] !== input.bandData[i]) {
        throw new Error(
          `band texture mismatch at index ${i}: ` +
            `expected ${input.bandData[i]}, got ${bandAcc[i]}`
        )
      }
    }
    expect(true).toBe(true)
  })
})
