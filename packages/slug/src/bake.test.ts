/**
 * Ecosystem-integration tests for the registerable `FlSlugFontExtension`.
 *
 * A `NodeIO` WITH the extension registered reads a `.slug.glb` made by
 * `packBaked` and keeps the accessor refs intact in the property graph.
 * A `NodeIO` WITHOUT it refuses the `extensionsRequired` file.
 */

import { describe, it, expect } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { packBaked, FlSlugFontExtension } from './bake'
import type { BakeInput } from './baked'
import type { SlugGlyphData } from './types'

function makeTinyInput(): BakeInput {
  const textureWidth = 2
  const curveTextureHeight = 1
  const curveData = new Uint16Array(textureWidth * curveTextureHeight * 4)
  for (let i = 0; i < curveData.length; i++) curveData[i] = i + 1

  const bandTextureHeight = 1
  const bandData = new Float32Array(textureWidth * bandTextureHeight * 2)
  for (let i = 0; i < bandData.length; i++) bandData[i] = (i + 1) * 0.5

  const glyph: SlugGlyphData = {
    glyphId: 1,
    curves: [],
    contourStarts: [],
    bounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
    bandLocation: { x: 0, y: 0 },
    curveLocation: { x: 0, y: 0 },
    advanceWidth: 1,
    lsb: 0,
    bands: { hBands: [{ curveIndices: [0] }], vBands: [] },
  }

  const glyphs = new Map<number, SlugGlyphData>()
  glyphs.set(glyph.glyphId, glyph)

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
    cmap: [[65, 1]],
    kern: [[1, 1, -10]],
  }
}

describe('FlSlugFontExtension — registerable glTF-Transform extension', () => {
  it('exposes the FL_slug_font extension name', () => {
    expect((FlSlugFontExtension as unknown as { EXTENSION_NAME: string }).EXTENSION_NAME).toBe('FL_slug_font')
  })

  it('a registered NodeIO round-trips .slug.glb with accessor refs intact', async () => {
    const glb = await packBaked(makeTinyInput())

    const io = new NodeIO().registerExtensions([FlSlugFontExtension])
    const doc = await io.readBinary(glb)

    // The extension property must be attached to the root with all accessor
    // refs resolved back into the property graph (not dropped).
    const prop = doc.getRoot().getExtension<{
      listAccessorSemantics(): string[]
      getAccessorRef(semantic: string): unknown
      getMetadata(): Record<string, unknown>
    }>('FL_slug_font')
    expect(prop, 'FL_slug_font property attached to root').toBeTruthy()

    const semantics = prop!.listAccessorSemantics()
    for (const key of [
      'glyphId',
      'bounds',
      'bandLoc',
      'advanceWidth',
      'lsb',
      'hasOutline',
      'cmap',
      'kern',
      'bandOffsets',
      'bandData',
      'curveTexture',
      'bandTexture',
    ]) {
      expect(semantics, `semantic ${key} present`).toContain(key)
      expect(prop!.getAccessorRef(key), `accessor ref for ${key} resolved`).toBeTruthy()
    }

    // Metadata survives the round-trip too.
    expect(prop!.getMetadata()['version']).toBe(1)

    // Re-write to confirm the registered extension round-trips without loss.
    const rewritten = await io.writeBinary(doc)
    expect(rewritten).toBeInstanceOf(Uint8Array)
  })

  it('a NodeIO WITHOUT the extension refuses the required file', async () => {
    const glb = await packBaked(makeTinyInput())

    // packBaked marks FL_slug_font as extensionsRequired — an unregistered
    // reader must throw rather than silently misread.
    const io = new NodeIO()
    await expect(io.readBinary(glb)).rejects.toThrow(/Missing required extension/)
  })
})
