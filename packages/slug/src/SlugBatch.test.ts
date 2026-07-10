import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { Color, Matrix4 } from 'three'
import { parseFont } from './pipeline/fontParser'
import { packTextures } from './pipeline/texturePacker'
import { shapeText } from './pipeline/textShaper'
import { wrapLines } from './pipeline/wrapLines'
import { measureText } from './pipeline/textMeasure'
import { SlugFont } from './SlugFont'
import { SlugBatch, SlugBatchGeometry } from './SlugBatch'
import { SlugGeometry } from './SlugGeometry'
import { SlugMaterial } from './SlugMaterial'
import { SlugStrokeMaterial } from './SlugStrokeMaterial'

const FONT_PATH = resolve(__dirname, '../../../examples/three/slug-text/public/Inter-Regular.ttf')
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

const STRIDE = 52
const OFFSET_COLOR = 16
const OFFSET_MTX = 20
const OFFSET_CLIP = 36

let font: SlugFont

beforeAll(() => {
  const parsed = parseFont(arrayBuffer)
  const textures = packTextures(parsed.glyphs)
  const otFont = opentype.parse(arrayBuffer)
  font = SlugFont._createRuntime(
    parsed.glyphs,
    textures,
    {
      unitsPerEm: parsed.unitsPerEm,
      ascender: parsed.ascender,
      descender: parsed.descender,
      capHeight: parsed.capHeight,
    },
    otFont,
    shapeText,
    wrapLines,
    measureText
  )
})

function instanceSlice(geometry: SlugBatchGeometry, index: number): Float32Array {
  return geometry.instanceArray.slice(index * STRIDE, (index + 1) * STRIDE)
}

describe('SlugBatchGeometry', () => {
  it('exposes the 5 SlugGeometry attributes plus mtx/clip lanes over ONE interleaved buffer', () => {
    const geometry = new SlugBatchGeometry(8)
    const names = [
      'glyphPos',
      'glyphTex',
      'glyphJac',
      'glyphBand',
      'glyphColor',
      'glyphMtx0',
      'glyphMtx1',
      'glyphMtx2',
      'glyphMtx3',
      'glyphClip0',
      'glyphClip1',
      'glyphClip2',
      'glyphClip3',
    ]
    const buffers = new Set<unknown>()
    for (const name of names) {
      const attr = geometry.getAttribute(name)
      expect(attr, name).toBeDefined()
      expect(attr.itemSize, name).toBe(4)
      expect(
        (attr as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute
      ).toBe(true)
      buffers.add((attr as unknown as { data: unknown }).data)
    }
    expect(buffers.size).toBe(1)
  })
})

describe('SlugBatch writer', () => {
  it('duck-types an instanced mesh without a consumable instanceMatrix', () => {
    const batch = new SlugBatch({ font })
    expect(batch.isInstancedMesh).toBe(true)
    expect(batch.instanceMatrix).toBeNull()
    expect(batch.count).toBe(0)
    expect(batch.frustumCulled).toBe(false)
    expect(batch.material).toBeInstanceOf(SlugMaterial)
  })

  it('writeGlyph matches SlugGeometry.setGlyphs on the 5 shared vec4s', () => {
    const fontSize = 32
    const glyphs = font.shapeText('Hi!', fontSize)
    expect(glyphs.length).toBeGreaterThan(0)

    const reference = new SlugGeometry()
    reference.setGlyphs(glyphs, font, { r: 0.25, g: 0.5, b: 0.75, a: 1 })

    const batch = new SlugBatch({ font })
    for (let i = 0; i < glyphs.length; i++) {
      const pg = glyphs[i]!
      batch.writeGlyph(i, pg.glyphId, font, {
        x: pg.x,
        y: pg.y,
        fontSize: pg.scale * font.unitsPerEm,
        color: { r: 0.25, g: 0.5, b: 0.75, a: 1 },
      })
    }
    batch.count = glyphs.length

    for (const name of ['glyphPos', 'glyphTex', 'glyphJac', 'glyphBand', 'glyphColor']) {
      const ref = reference.getAttribute(name)
      const got = batch.batchGeometry.getAttribute(name)
      for (let i = 0; i < glyphs.length; i++) {
        for (const c of ['getX', 'getY', 'getZ', 'getW'] as const) {
          expect(got[c](i), `${name}[${i}].${c}`).toBe(ref[c](i))
        }
      }
    }
  })

  it('writes identity matrix lanes and the clip-disabled sentinel by default', () => {
    const batch = new SlugBatch({ font })
    const glyphs = font.shapeText('A', 16)
    batch.writeGlyph(0, glyphs[0]!.glyphId, font)

    const inst = instanceSlice(batch.batchGeometry, 0)
    expect(Array.from(inst.slice(OFFSET_MTX, OFFSET_MTX + 16))).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ])
    expect(Array.from(inst.slice(OFFSET_CLIP, OFFSET_CLIP + 16))).toEqual([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
  })

  it('writes matrix lanes as columns and clip lanes as plane ROWS', () => {
    const batch = new SlugBatch({ font })
    const glyphs = font.shapeText('A', 16)

    const matrix = new Matrix4().makeRotationZ(0.5).setPosition(3, 4, 5)
    // prettier-ignore
    const clip = new Matrix4().set(
      1, 0, 0, -10,   // plane 0: x >= 10
      -1, 0, 0, 20,   // plane 1: x <= 20
      0, 1, 0, -1,    // plane 2: y >= 1
      0, -1, 0, 2     // plane 3: y <= 2
    )
    batch.writeGlyph(0, glyphs[0]!.glyphId, font, { matrix, clip })

    const inst = instanceSlice(batch.batchGeometry, 0)
    expect(Array.from(inst.slice(OFFSET_MTX, OFFSET_MTX + 16))).toEqual(
      Array.from(new Float32Array(matrix.elements))
    )
    expect(Array.from(inst.slice(OFFSET_CLIP, OFFSET_CLIP + 16))).toEqual([
      1, 0, 0, -10, -1, 0, 0, 20, 0, 1, 0, -1, 0, -1, 0, 2,
    ])
  })

  it('supports per-glyph color as Color + opacity and as RGBA', () => {
    const batch = new SlugBatch({ font })
    const glyphs = font.shapeText('AB', 16)
    batch.writeGlyph(0, glyphs[0]!.glyphId, font, { color: new Color(1, 0, 0), opacity: 0.5 })
    batch.writeGlyph(1, glyphs[1]!.glyphId, font, { color: { r: 0, g: 1, b: 0, a: 0.25 } })

    const a = instanceSlice(batch.batchGeometry, 0)
    const b = instanceSlice(batch.batchGeometry, 1)
    expect(Array.from(a.slice(OFFSET_COLOR, OFFSET_COLOR + 4))).toEqual([1, 0, 0, 0.5])
    expect(Array.from(b.slice(OFFSET_COLOR, OFFSET_COLOR + 4))).toEqual([0, 1, 0, 0.25])
  })

  it('writeRect writes the glyphJac.w = -1 sentinel', () => {
    const batch = new SlugBatch({ font })
    batch.writeRect(0, { x: 5, y: -2, width: 10, height: 1 })
    const inst = instanceSlice(batch.batchGeometry, 0)
    expect(Array.from(inst.slice(0, 4))).toEqual([5, -2, 5, 0.5])
    expect(inst[8]).toBe(1) // invScale finite
    expect(inst[11]).toBe(-1) // sentinel
  })

  it('writeGlyph for an unknown glyphId writes a hidden degenerate instance', () => {
    const batch = new SlugBatch({ font })
    batch.writeGlyph(0, 0xffffff, font)
    const inst = instanceSlice(batch.batchGeometry, 0)
    expect(inst[11]).toBe(-1) // rect sentinel path
    expect(Array.from(inst.slice(0, 4))).toEqual([0, 0, 0, 0]) // zero size
    expect(inst[OFFSET_COLOR + 3]).toBe(0) // alpha 0
  })

  it('ensureCapacity grows by ≥1.5×, preserves contents, and rebinds attributes', () => {
    const batch = new SlugBatch({ font, capacity: 4 })
    const glyphs = font.shapeText('abcd', 16)
    for (let i = 0; i < 4; i++) {
      batch.writeGlyph(i, glyphs[i]!.glyphId, font, { x: i * 10, fontSize: 16 })
    }
    const before = Array.from(batch.batchGeometry.instanceArray.slice(0, 4 * STRIDE))
    const attrBefore = batch.batchGeometry.getAttribute('glyphPos')

    batch.ensureCapacity(5)
    expect(batch.capacity).toBeGreaterThanOrEqual(6) // ceil(4 * 1.5)
    expect(Array.from(batch.batchGeometry.instanceArray.slice(0, 4 * STRIDE))).toEqual(before)
    expect(batch.batchGeometry.getAttribute('glyphPos')).not.toBe(attrBefore)

    // No-op when capacity already suffices
    const attrAfter = batch.batchGeometry.getAttribute('glyphPos')
    batch.ensureCapacity(2)
    expect(batch.batchGeometry.getAttribute('glyphPos')).toBe(attrAfter)
  })

  it('writeGlyph auto-grows past capacity', () => {
    const batch = new SlugBatch({ font, capacity: 2 })
    const glyphs = font.shapeText('a', 16)
    batch.writeGlyph(7, glyphs[0]!.glyphId, font)
    expect(batch.capacity).toBeGreaterThanOrEqual(8)
  })

  it('copyWithin moves whole instances', () => {
    const batch = new SlugBatch({ font })
    const glyphs = font.shapeText('xyz', 24)
    for (let i = 0; i < 3; i++) {
      batch.writeGlyph(i, glyphs[i]!.glyphId, font, { x: glyphs[i]!.x, fontSize: 24 })
    }
    const third = Array.from(instanceSlice(batch.batchGeometry, 2))
    batch.copyWithin(0, 2, 3)
    expect(Array.from(instanceSlice(batch.batchGeometry, 0))).toEqual(third)
  })

  it('bucket simulation: activate/deactivate/compact equals a from-scratch rebuild', () => {
    // Mirrors uikit's sorted-bucket allocator: glyphs activate at the end
    // of the live range; a deactivated slot is filled by shifting the tail
    // left with copyWithin (order-preserving compaction).
    const text = 'BucketSim'
    const glyphs = font.shapeText(text, 20)
    const params = glyphs.map((pg, i) => ({
      glyphId: pg.glyphId,
      x: pg.x,
      y: pg.y,
      fontSize: 20,
      matrix: new Matrix4().setPosition(i * 2, i, 0),
      color: { r: i / 10, g: 1 - i / 10, b: 0.5, a: 1 },
    }))

    const batch = new SlugBatch({ font, capacity: 2 })
    const live: number[] = [] // indices into params, in buffer order

    const activate = (p: number) => {
      batch.writeGlyph(live.length, params[p]!.glyphId, font, params[p]!)
      live.push(p)
      batch.count = live.length
    }
    const deactivate = (slot: number) => {
      // shift tail left over the hole
      batch.copyWithin(slot, slot + 1, live.length)
      live.splice(slot, 1)
      batch.count = live.length
    }

    for (let p = 0; p < params.length; p++) activate(p)
    deactivate(0)
    deactivate(3)
    activate(0)
    deactivate(live.length - 2)

    // From-scratch rebuild in the surviving order
    const rebuilt = new SlugBatch({ font, capacity: 2 })
    for (let slot = 0; slot < live.length; slot++) {
      rebuilt.writeGlyph(slot, params[live[slot]!]!.glyphId, font, params[live[slot]!]!)
    }
    rebuilt.count = live.length

    expect(batch.count).toBe(rebuilt.count)
    const gotLive = Array.from(batch.batchGeometry.instanceArray.slice(0, live.length * STRIDE))
    const expectedLive = Array.from(
      rebuilt.batchGeometry.instanceArray.slice(0, live.length * STRIDE)
    )
    expect(gotLive).toEqual(expectedLive)
  })
})

describe('batch material construction', () => {
  it('SlugMaterial builds with instanceTransform + instanceClip', () => {
    const material = new SlugMaterial(font, { instanceTransform: true, instanceClip: true })
    expect(material.positionNode).toBeDefined()
    expect(material.colorNode).toBeDefined()
    material.dispose()
  })

  it('SlugStrokeMaterial builds with instanceTransform + instanceClip', () => {
    const material = new SlugStrokeMaterial(font, {
      instanceTransform: true,
      instanceClip: true,
      strokeHalfWidth: 0.03,
    })
    expect(material.positionNode).toBeDefined()
    expect(material.colorNode).toBeDefined()
    material.dispose()
  })

  it('SlugBatch accepts a caller-supplied stroke material via .material', () => {
    const batch = new SlugBatch({ font })
    const stroke = new SlugStrokeMaterial(font, { instanceTransform: true, instanceClip: true })
    batch.material = stroke
    batch.setViewportSize(256, 256)
    expect(batch.material).toBe(stroke)
  })
})
