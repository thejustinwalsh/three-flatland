import { describe, it, expect } from 'vitest'
import { NodeIO, type Accessor, type ExtensionProperty } from '@gltf-transform/core'
import { readGlb } from './glb'
import { unpackBaked, convertV1BandTexture } from './baked'
import type { BakeInput } from './baked'
import { packBaked, FlSlugFontExtension } from './bake'
import { SLUG_EXTENSION_NAME } from './format'
import { packHeader, packRefCoord, packTextures, singlePageOrThrow } from './pipeline/texturePacker'
import type { Band, SlugGlyphData } from './types'

// Mirror the shader decode (see texturePacker.test.ts) so this file can
// unpack a v2 header/ref texel back to its raw (count, offset)/(x, y) pair —
// the inverse of `packHeader`/`packRefCoord`, needed to synthesize a v1
// (RG32Float) band texture from a real v2 (R32Float) one below.
const decodeHeader = (packed: number) => ({ count: packed >>> 14, offset: packed & 16383 })
const decodeRef = (packed: number) => ({ x: packed & 4095, y: packed >>> 12 })

// ---------------------------------------------------------------------------
// The narrow structural slice of `SlugRootProperty` (private to bake.ts) this
// file needs to read/rewrite an already-baked `FL_slug_font` extension.
// ---------------------------------------------------------------------------
interface SlugFontExtensionProperty extends ExtensionProperty {
  getMetadata(): Record<string, unknown>
  setMetadata(meta: Record<string, unknown>): unknown
  getAccessorRef(semantic: string): Accessor | null
}

// ---------------------------------------------------------------------------
// A tiny synthetic glyph set with REAL curve/band data (not placeholder
// filler), run through the production `packTextures`, so `bandLocation` and
// the band texture's header/ref layout are exactly what a real bake produces.
//
// Glyph 0: dedup-heavy — hBand[0] and hBand[2] share a curve-ref list with
//   each other AND with vBand[0] (non-adjacent + cross-group dedup).
// Glyph 1: EMPTY — no curves, no bands. Owns zero band texels; exercises the
//   "multiple glyphs share one bandLocation" edge case for glyph 5 below.
// Glyph 5: a second, distinct-bands glyph — proves the classification also
//   walks past an empty glyph to the next real footprint correctly.
// ---------------------------------------------------------------------------

const curve = (i: number) => ({ p0x: i, p0y: 0, p1x: i + 0.1, p1y: 0.1, p2x: i + 0.2, p2y: 0.2 })

function makeGlyph(id: number, hBands: Band[], vBands: Band[]): SlugGlyphData {
  return {
    glyphId: id,
    curves: [curve(0), curve(1), curve(2)],
    contourStarts: [0],
    bands: { hBands, vBands },
    bounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
    advanceWidth: 1,
    lsb: 0,
    page: 0,
    bandLocation: { x: 0, y: 0 },
    curveLocation: { x: 0, y: 0 },
  }
}

function makeEmptyGlyph(id: number): SlugGlyphData {
  return {
    glyphId: id,
    curves: [],
    contourStarts: [],
    bands: { hBands: [], vBands: [] },
    bounds: { xMin: 0, yMin: 0, xMax: 0, yMax: 0 },
    advanceWidth: 0.3,
    lsb: 0,
    page: 0,
    bandLocation: { x: 0, y: 0 },
    curveLocation: { x: 0, y: 0 },
  }
}

async function makeSyntheticV2Bake() {
  const glyphs = new Map<number, SlugGlyphData>([
    [
      0,
      makeGlyph(
        0,
        [{ curveIndices: [0, 1] }, { curveIndices: [2] }, { curveIndices: [0, 1] }],
        [{ curveIndices: [0, 1] }]
      ),
    ],
    [1, makeEmptyGlyph(1)],
    [5, makeGlyph(5, [{ curveIndices: [0] }], [{ curveIndices: [1] }])],
  ])

  const packed = singlePageOrThrow(packTextures(glyphs), 'baked.v1compat.test')

  const input: BakeInput = {
    metrics: {
      unitsPerEm: 2048,
      ascender: 1984,
      descender: -494,
      capHeight: 1456,
      underlinePosition: -150,
      underlineThickness: 50,
      strikethroughPosition: 530,
      strikethroughThickness: 50,
      subscriptScale: { x: 0.65, y: 0.65 },
      subscriptOffset: { x: 0, y: -200 },
      superscriptScale: { x: 0.65, y: 0.65 },
      superscriptOffset: { x: 0, y: 500 },
    },
    textureWidth: packed.textureWidth,
    curveTextureHeight: packed.curveTexture.image.height,
    curveData: packed.curveTexture.image.data as Uint16Array,
    bandTextureHeight: packed.bandTexture.image.height,
    bandData: packed.bandTexture.image.data as Float32Array,
    glyphs,
    cmap: [[65, 0]],
    kern: [],
  }

  const v2Bytes = await packBaked(input)
  const buf = v2Bytes.buffer.slice(v2Bytes.byteOffset, v2Bytes.byteOffset + v2Bytes.byteLength)
  return { v2Bytes, asset: readGlb(buf), textureWidth: packed.textureWidth }
}

/**
 * Test-only inverse of `convertV1BandTexture`: unpack a real v2 (R32Float)
 * band texture back into the v1 (RG32Float) raw `[count, offset]`/
 * `[texelX, texelY]` layout, using the SAME footprint classification (ground
 * truth from `unpackBaked`'s glyph map) so the synthesized v1 fixture is
 * internally consistent — a genuine pre-d58148ea-shaped bake, not arbitrary
 * filler.
 */
function inversePackToV1(
  v2BandData: Float32Array,
  textureWidth: number,
  glyphs: Map<number, SlugGlyphData>
): Float32Array {
  const v1BandData = new Float32Array(v2BandData.length * 2)

  const owners = Array.from(glyphs.values())
    .map((g) => ({
      start: g.bandLocation.y * textureWidth + g.bandLocation.x,
      headerCount: g.bands.hBands.length + g.bands.vBands.length,
    }))
    .filter((g) => g.headerCount > 0)
    .sort((a, b) => a.start - b.start)

  for (const { start, headerCount } of owners) {
    let footprint = headerCount
    for (let h = 0; h < headerCount; h++) {
      const texel = start + h
      const { count, offset } = decodeHeader(v2BandData[texel]!)
      v1BandData[texel * 2] = count
      v1BandData[texel * 2 + 1] = offset
      if (offset + count > footprint) footprint = offset + count
    }
    for (let r = headerCount; r < footprint; r++) {
      const texel = start + r
      const { x, y } = decodeRef(v2BandData[texel]!)
      v1BandData[texel * 2] = x
      v1BandData[texel * 2 + 1] = y
    }
  }

  return v1BandData
}

describe('convertV1BandTexture — unit', () => {
  it('converts headers and refs, matching packHeader/packRefCoord exactly', () => {
    // One glyph: bandLocation (0,0), 1 hBand (2 curves), 1 vBand (1 curve),
    // no dedup — header texels [0,1], ref texels [2,3,4].
    const glyph = makeGlyph(0, [{ curveIndices: [10, 11] }], [{ curveIndices: [12] }])
    glyph.bandLocation = { x: 0, y: 0 }
    const glyphs = new Map([[0, glyph]])

    // Raw v1 layout: header0=[count2,offset2] (hBand0), header1=[count1,offset4]
    // (vBand0), ref2=[texelX7,texelY0], ref3=[texelX8,texelY0] (hBand0's list),
    // ref4=[texelX9,texelY1] (vBand0's list).
    const v1 = new Float32Array([2, 2, 1, 4, 7, 0, 8, 0, 9, 1])

    const v2 = convertV1BandTexture(v1, 4, glyphs)
    expect(v2.length).toBe(5)
    expect(v2[0]).toBe(packHeader(2, 2))
    expect(v2[1]).toBe(packHeader(1, 4))
    expect(v2[2]).toBe(packRefCoord(7, 0))
    expect(v2[3]).toBe(packRefCoord(8, 0))
    expect(v2[4]).toBe(packRefCoord(9, 1))
  })

  it('gives an empty glyph a zero-length footprint (no texels touched)', () => {
    const empty = makeEmptyGlyph(0)
    empty.bandLocation = { x: 0, y: 0 }
    const real = makeGlyph(1, [{ curveIndices: [0] }], [])
    real.bandLocation = { x: 0, y: 0 } // shares the empty glyph's start — legal
    const glyphs = new Map([
      [0, empty],
      [1, real],
    ])

    const v1 = new Float32Array([1, 1, 3, 0]) // header(count1,offset1), ref(x3,y0)
    const v2 = convertV1BandTexture(v1, 4, glyphs)
    expect(v2[0]).toBe(packHeader(1, 1))
    expect(v2[1]).toBe(packRefCoord(3, 0))
  })

  it('throws when a real glyph does not abut the next owning glyph', () => {
    const a = makeGlyph(0, [{ curveIndices: [0] }], [])
    a.bandLocation = { x: 0, y: 0 }
    const b = makeGlyph(1, [{ curveIndices: [0] }], [])
    b.bandLocation = { x: 5, y: 0 } // wrong — glyph 0's footprint is [0,2), not [0,5)
    const glyphs = new Map([
      [0, a],
      [1, b],
    ])
    const v1 = new Float32Array(12)
    v1[0] = 1 // count
    v1[1] = 1 // offset
    v1[2] = 0 // ref x
    v1[3] = 0 // ref y

    expect(() => convertV1BandTexture(v1, 8, glyphs)).toThrow(/does not abut/)
  })
})

describe('convertV1BandTexture — round-trip through a synthetic v1 .slug.glb', () => {
  it('loads a v1 bake without throwing (version gate accepts v1)', async () => {
    const { asset } = await makeSyntheticV2Bake()
    expect(() => unpackBaked(asset)).not.toThrow()
  })

  it('produces a v2 band texture byte-identical to the original v2 bake', async () => {
    const { v2Bytes, asset: v2Asset, textureWidth } = await makeSyntheticV2Bake()
    const v2Baked = unpackBaked(v2Asset)
    const v2Ext = v2Asset.ext<Record<string, unknown>>('FL_slug_font')!
    const v2Columns = v2Ext['columns'] as Record<string, { accessor: number }>
    const v2BandOriginal = v2Asset.accessor(v2Columns['bandTexture']!.accessor) as Float32Array

    // ── Synthesize a v1 (RG32Float) fixture from the real v2 bake ──
    const v1BandData = inversePackToV1(v2BandOriginal, textureWidth, v2Baked.glyphs)

    const io = new NodeIO().registerExtensions([FlSlugFontExtension])
    const doc = await io.readBinary(new Uint8Array(v2Bytes))
    const prop = doc.getRoot().getExtension<SlugFontExtensionProperty>(SLUG_EXTENSION_NAME)!
    const bandAccessor = prop.getAccessorRef('bandTexture')!
    bandAccessor.setArray(v1BandData)
    const metadata = prop.getMetadata()
    prop.setMetadata({
      ...metadata,
      version: 1,
      bandTexture: { ...(metadata['bandTexture'] as Record<string, unknown>), format: 'rg32f' },
    })
    const v1Bytes = await io.writeBinary(doc)

    // ── Load the synthetic v1 buffer through the production read path ──
    const v1Buf = v1Bytes.buffer.slice(v1Bytes.byteOffset, v1Bytes.byteOffset + v1Bytes.byteLength)
    const v1Asset = readGlb(v1Buf)
    const v1Ext = v1Asset.ext<Record<string, unknown>>('FL_slug_font')!
    expect(v1Ext['version']).toBe(1)

    const v1Baked = unpackBaked(v1Asset) // must not throw now that MIN_VERSION is 1
    const v1Columns = v1Ext['columns'] as Record<string, { accessor: number }>
    const v1BandRaw = v1Asset.accessor(v1Columns['bandTexture']!.accessor) as Float32Array
    expect(v1BandRaw.length).toBe(v2BandOriginal.length * 2)

    const v2Converted = convertV1BandTexture(v1BandRaw, textureWidth, v1Baked.glyphs)

    expect(v2Converted.length).toBe(v2BandOriginal.length)
    for (let i = 0; i < v2Converted.length; i++) {
      expect(v2Converted[i]).toBe(v2BandOriginal[i])
    }
  })
})
