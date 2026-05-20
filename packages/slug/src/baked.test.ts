import { describe, it, expect } from 'vitest'
import { readAsset } from '@three-flatland/asset'
import { packBaked, bakedURLs } from './baked'
import type { BakeInput } from './baked'
import type { SlugGlyphData, QuadCurve } from './types'

// ---------------------------------------------------------------------------
// Synthetic BakeInput — two glyphs, tiny textures, one cmap/kern entry,
// non-trivial band data per glyph.
//
// Glyph 0 (notdef-like): 1 hBand with 2 curve indices, 0 vBands.
// Glyph 3 (A-like):      1 hBand with 1 curve index, 1 vBand with 1 index.
// ---------------------------------------------------------------------------

function makeSyntheticInput(): BakeInput {
  // Tiny 4×2 RGBA16F curve texture (4 × 2 × 4ch × 2 bytes = 64 bytes)
  const textureWidth = 4
  const curveTextureHeight = 2
  const curveData = new Uint16Array(textureWidth * curveTextureHeight * 4)
  for (let i = 0; i < curveData.length; i++) curveData[i] = i + 1

  // Tiny 4×1 RG-F32 band texture (4 × 1 × 2ch × 4 bytes = 32 bytes)
  const bandTextureHeight = 1
  const bandData = new Float32Array(textureWidth * bandTextureHeight * 2)
  for (let i = 0; i < bandData.length; i++) bandData[i] = (i + 1) * 0.5

  const glyph0: SlugGlyphData = {
    glyphId: 0,
    curves: [],
    contourStarts: [],
    bounds: { xMin: 0.1, yMin: 0.2, xMax: 0.8, yMax: 0.9 },
    bandLocation: { x: 0.0, y: 0.0 },
    curveLocation: { x: 0.0, y: 0.0 },
    advanceWidth: 0.5,
    lsb: 0.05,
    bands: {
      hBands: [{ curveIndices: [0, 1] }],
      vBands: [],
    },
  }

  const glyph3: SlugGlyphData = {
    glyphId: 3,
    curves: [
      { p0x: 0, p0y: 0, p1x: 0.5, p1y: 1, p2x: 1, p2y: 0 } satisfies QuadCurve,
    ],
    contourStarts: [0],
    bounds: { xMin: 0.0, yMin: 0.0, xMax: 1.0, yMax: 1.0 },
    bandLocation: { x: 0.25, y: 0.0 },
    curveLocation: { x: 0.0, y: 0.0 },
    advanceWidth: 1.0,
    lsb: 0.0,
    bands: {
      hBands: [{ curveIndices: [2] }],
      vBands: [{ curveIndices: [3] }],
    },
  }

  const glyphs = new Map<number, SlugGlyphData>()
  glyphs.set(glyph0.glyphId, glyph0)
  glyphs.set(glyph3.glyphId, glyph3)

  return {
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
    textureWidth,
    curveTextureHeight,
    curveData,
    bandTextureHeight,
    bandData,
    glyphs,
    cmap: [[65, 3]],     // 'A' → glyphId 3
    kern: [[3, 3, -10]],
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function bakeAndRead(input: BakeInput) {
  const glb = await packBaked(input)
  // readAsset needs a standalone ArrayBuffer (no offset)
  const buf = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength)
  const asset = readAsset(buf)
  const ext = asset.ext<Record<string, unknown>>('FL_slug_font')!
  const columns = ext['columns'] as Record<string, { accessor: number }>
  return { glb, asset, ext, columns }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('packBaked — returns .glb', () => {
  it('returns a Uint8Array beginning with GLB magic bytes', async () => {
    const glb = await packBaked(makeSyntheticInput())
    expect(glb).toBeInstanceOf(Uint8Array)
    // GLB magic 0x46546C67 LE = "glTF"
    const view = new DataView(glb.buffer, glb.byteOffset)
    expect(view.getUint32(0, true)).toBe(0x46546c67)
  })

  it('readAsset exposes FL_slug_font extension', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    expect(ext).toBeDefined()
  })

  it('extension carries version 1', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    expect(ext['version']).toBe(1)
  })

  it('extension carries metrics', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    const metrics = ext['metrics'] as Record<string, unknown>
    expect(metrics['unitsPerEm']).toBe(2048)
    expect(metrics['ascender']).toBe(1984)
    expect(metrics['descender']).toBe(-494)
    expect(metrics['capHeight']).toBe(1456)
  })

  it('extension carries glyphs.count', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    const glyphsMeta = ext['glyphs'] as Record<string, unknown>
    expect(glyphsMeta['count']).toBe(2)
  })

  it('extension carries kern.stride = 3', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    const kernMeta = ext['kern'] as Record<string, unknown>
    expect(kernMeta['stride']).toBe(3)
  })

  it('extension carries curveTexture dims and format', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    const ct = ext['curveTexture'] as Record<string, unknown>
    expect(ct['width']).toBe(4)
    expect(ct['height']).toBe(2)
    expect(ct['format']).toBe('rgba16f')
  })

  it('extension carries bandTexture dims and format', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    const bt = ext['bandTexture'] as Record<string, unknown>
    expect(bt['width']).toBe(4)
    expect(bt['height']).toBe(1)
    expect(bt['format']).toBe('rg32f')
  })

  it('extension carries bands.glyphCount', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    const bands = ext['bands'] as Record<string, unknown>
    expect(bands['glyphCount']).toBe(2)
  })

  it('columns has all expected accessor refs', async () => {
    const { columns } = await bakeAndRead(makeSyntheticInput())
    for (const key of [
      'glyphId', 'bounds', 'bandLoc', 'advanceWidth', 'lsb', 'hasOutline',
      'cmap', 'kern', 'bandOffsets', 'bandData', 'curveTexture', 'bandTexture',
    ]) {
      expect(typeof columns[key]!.accessor, `columns.${key}.accessor`).toBe('number')
    }
  })

  it('glyphId accessor: sorted ascending by glyphId', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const view = asset.accessor(columns['glyphId']!.accessor) as Float32Array
    expect(view).toBeInstanceOf(Float32Array)
    expect(view.length).toBe(2)
    expect(view[0]).toBe(0)
    expect(view[1]).toBe(3)
  })

  it('bounds accessor: VEC4 per glyph in sorted order', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const view = asset.accessor(columns['bounds']!.accessor) as Float32Array
    expect(view).toBeInstanceOf(Float32Array)
    expect(view.length).toBe(8)  // 2 glyphs × 4 components
    // Glyph 0: xMin=0.1 yMin=0.2 xMax=0.8 yMax=0.9
    expect(view[0]).toBeCloseTo(0.1, 5)
    expect(view[1]).toBeCloseTo(0.2, 5)
    expect(view[2]).toBeCloseTo(0.8, 5)
    expect(view[3]).toBeCloseTo(0.9, 5)
    // Glyph 3: xMin=0.0 yMin=0.0 xMax=1.0 yMax=1.0
    expect(view[4]).toBeCloseTo(0.0, 5)
    expect(view[5]).toBeCloseTo(0.0, 5)
    expect(view[6]).toBeCloseTo(1.0, 5)
    expect(view[7]).toBeCloseTo(1.0, 5)
  })

  it('hasOutline: 0 for curves-less glyph, 1 for outlined glyph', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const view = asset.accessor(columns['hasOutline']!.accessor) as Float32Array
    expect(view[0]).toBe(0)  // glyph 0 has no curves
    expect(view[1]).toBe(1)  // glyph 3 has 1 curve
  })

  it('cmap accessor: VEC2 [charCode, glyphId]', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const view = asset.accessor(columns['cmap']!.accessor) as Uint16Array
    expect(view).toBeInstanceOf(Uint16Array)
    expect(view.length).toBe(2)  // 1 entry × 2 u16
    expect(view[0]).toBe(65)  // charCode 'A'
    expect(view[1]).toBe(3)   // glyphId
  })

  it('kern accessor: SHORT SCALAR, stride 3, [g1, g2, value]', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const view = asset.accessor(columns['kern']!.accessor) as Int16Array
    expect(view).toBeInstanceOf(Int16Array)
    expect(view.length).toBe(3)  // 1 triple × 3
    expect(view[0]).toBe(3)    // g1
    expect(view[1]).toBe(3)    // g2
    expect(view[2]).toBe(-10)  // value
  })

  it('bandOffsets: FLOAT SCALAR N+1, prefix-sum word offsets', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const offsets = asset.accessor(columns['bandOffsets']!.accessor) as Float32Array
    expect(offsets).toBeInstanceOf(Float32Array)
    expect(offsets.length).toBe(3)  // glyphCount + 1
    expect(offsets[0]).toBe(0)
    // Glyph 0: [numH=1, numV=0, hCount0=2, hIdx0=0, hIdx1=1] = 5 words
    expect(offsets[1]).toBe(5)
    // Glyph 3: [numH=1, numV=1, hCount0=1, hIdx0=2, vCount0=1, vIdx0=3] = 6 words
    expect(offsets[2]).toBe(11)
  })

  it('bandData: USHORT SCALAR, correct flat word stream', async () => {
    const { asset, columns } = await bakeAndRead(makeSyntheticInput())
    const data = asset.accessor(columns['bandData']!.accessor) as Uint16Array
    expect(data).toBeInstanceOf(Uint16Array)
    expect(data.length).toBe(11)  // 5 + 6
    // Glyph 0 words: [1, 0, 2, 0, 1]
    expect(data[0]).toBe(1)  // numH
    expect(data[1]).toBe(0)  // numV
    expect(data[2]).toBe(2)  // hBand0 count
    expect(data[3]).toBe(0)  // hBand0 idx 0
    expect(data[4]).toBe(1)  // hBand0 idx 1
    // Glyph 3 words: [1, 1, 1, 2, 1, 3]
    expect(data[5]).toBe(1)  // numH
    expect(data[6]).toBe(1)  // numV
    expect(data[7]).toBe(1)  // hBand0 count
    expect(data[8]).toBe(2)  // hBand0 idx 0
    expect(data[9]).toBe(1)  // vBand0 count
    expect(data[10]).toBe(3) // vBand0 idx 0
  })

  it('curveTexture accessor: USHORT SCALAR, correct half-float bits', async () => {
    const input = makeSyntheticInput()
    const { asset, columns } = await bakeAndRead(input)
    const view = asset.accessor(columns['curveTexture']!.accessor) as Uint16Array
    expect(view).toBeInstanceOf(Uint16Array)
    expect(view.length).toBe(4 * 2 * 4)  // width × height × 4 channels
    for (let i = 0; i < view.length; i++) {
      expect(view[i]).toBe(i + 1)
    }
  })

  it('bandTexture accessor: FLOAT SCALAR, correct values', async () => {
    const input = makeSyntheticInput()
    const { asset, columns } = await bakeAndRead(input)
    const view = asset.accessor(columns['bandTexture']!.accessor) as Float32Array
    expect(view).toBeInstanceOf(Float32Array)
    expect(view.length).toBe(4 * 1 * 2)  // width × height × 2 channels
    for (let i = 0; i < view.length; i++) {
      expect(view[i]).toBeCloseTo((i + 1) * 0.5, 5)
    }
  })

  it('strokeSets absent when none configured', async () => {
    const { ext } = await bakeAndRead(makeSyntheticInput())
    expect(ext['strokeSets']).toBeUndefined()
  })

  it('strokeSets present and round-trips when configured', async () => {
    const strokeSets = [
      {
        width: 0.025,
        joinStyle: 'miter' as const,
        capStyle: 'flat' as const,
        miterLimit: 4,
        glyphIdOffset: 3000,
      },
    ]
    const { ext } = await bakeAndRead({ ...makeSyntheticInput(), strokeSets })
    expect(ext['strokeSets']).toEqual(strokeSets)
  })
})

describe('bakedURLs', () => {
  it('derives .slug.glb from font URL', () => {
    expect(bakedURLs('/fonts/Inter-Regular.ttf')).toBe('/fonts/Inter-Regular.slug.glb')
  })

  it('handles paths without extension', () => {
    expect(bakedURLs('/fonts/MyFont')).toBe('/fonts/MyFont.slug.glb')
  })
})
