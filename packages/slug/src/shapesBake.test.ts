import { describe, it, expect } from 'vitest'
import { packShapeSet } from './bake'
import { SlugShapeSet } from './SlugShapeSet'
import { cubicToQuadraticsAdaptive, lineToQuadratic } from './pipeline/fontParser'
import type { QuadContour } from './types'

function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

function curvy(): QuadContour {
  const contour = cubicToQuadraticsAdaptive(0, 0, 1.5, 0.1, 1.5, 0.9, 0, 1, 0.0035)
  contour.push(lineToQuadratic(0, 1, 0, 0, 1 / 1024))
  return contour
}

function buildSet(): SlugShapeSet {
  const set = new SlugShapeSet()
  set.registerShape([rect(0, 0, 1, 1), rect(0.25, 0.25, 0.75, 0.75).reverse()])
  set.registerShape([curvy()])
  set.registerShape([rect(0.1, 0.4, 0.9, 0.6)])
  return set
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('packShapeSet / SlugShapeSet.fromBaked round trip', () => {
  it('round-trips shapes losslessly (curves, contours, bands, bounds)', async () => {
    const set = buildSet()
    const glb = await packShapeSet(set)
    const loaded = SlugShapeSet.fromBaked(toArrayBuffer(glb))

    expect(loaded.shapeCount).toBe(set.shapeCount)
    for (const [id, original] of set.glyphs) {
      const restored = loaded.glyphs.get(id)!
      expect(restored, `shape ${id}`).toBeDefined()
      // registerShape quantizes to float32, so the float32 accessors
      // round-trip BIT-exactly — plain deep equality, no closeTo.
      expect(restored.curves).toEqual(original.curves)
      expect(restored.contourStarts).toEqual(original.contourStarts)
      expect(restored.bands).toEqual(original.bands)
      expect(restored.bounds).toEqual(original.bounds)
      expect(restored.advanceWidth).toEqual(original.advanceWidth)
      expect(restored.lsb).toEqual(original.lsb)
    }
  })

  it('packs to bit-identical GPU textures (pixel identity by construction)', async () => {
    const set = buildSet()
    const glb = await packShapeSet(set)
    const loaded = SlugShapeSet.fromBaked(toArrayBuffer(glb))

    expect(Array.from(loaded.curveTexture.image.data as Uint16Array)).toEqual(
      Array.from(set.curveTexture.image.data as Uint16Array)
    )
    expect(Array.from(loaded.bandTexture.image.data as Float32Array)).toEqual(
      Array.from(set.bandTexture.image.data as Float32Array)
    )
    for (const [id, original] of set.glyphs) {
      const restored = loaded.glyphs.get(id)!
      expect(restored.bandLocation).toEqual(original.bandLocation)
      expect(restored.curveLocation).toEqual(original.curveLocation)
    }
  })

  it('round-trips free-form metadata and stays growable after load', async () => {
    const set = buildSet()
    const meta = { icons: { activity: { handles: [0], fills: [[1, 1, 1, 1]] } } }
    const glb = await packShapeSet(set, meta)
    const loaded = SlugShapeSet.fromBaked(toArrayBuffer(glb))

    expect(loaded.meta).toEqual(meta)

    // Ids continue after the baked range; growth works post-load
    const next = loaded.registerShape([rect(0, 0, 0.3, 0.3)])
    expect(next.glyphId).toBe(3)
    expect(loaded.curveTexture).toBeDefined()
  })

  it('refuses an empty set and unknown versions', async () => {
    await expect(packShapeSet(new SlugShapeSet())).rejects.toThrow(/no shapes/)

    const glb = await packShapeSet(buildSet())
    // Byte-patch `"version":1` → `"version":9` in the JSON chunk (same
    // length, GLB offsets stay valid; no text re-encode of binary data).
    const needle = new TextEncoder().encode('"version":1')
    const bytes = glb.slice()
    const at = bytes.findIndex((_, i) => needle.every((b, j) => bytes[i + j] === b))
    expect(at).toBeGreaterThan(0)
    bytes[at + needle.length - 1] = '9'.charCodeAt(0)
    expect(() => SlugShapeSet.fromBaked(toArrayBuffer(bytes))).toThrow(/version/)
  })
})
