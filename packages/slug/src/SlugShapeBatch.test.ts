import { describe, it, expect } from 'vitest'
import { Color, Matrix4, OrthographicCamera } from 'three'
import { SlugShapeBatch } from './SlugShapeBatch'
import { SlugShapeSet } from './SlugShapeSet'
import { SlugMaterial } from './SlugMaterial'
import { lineToQuadratic } from './pipeline/fontParser'
import type { QuadContour } from './types'

const STRIDE = 52
const OFFSET_POS = 0
const OFFSET_JAC = 8
const OFFSET_COLOR = 16
const OFFSET_MTX = 20
const OFFSET_CLIP = 36

function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

function makeSet(): { set: SlugShapeSet; unit: ReturnType<SlugShapeSet['registerShape']> } {
  const set = new SlugShapeSet()
  const unit = set.registerShape([rect(0, 0, 1, 1)])
  return { set, unit }
}

describe('SlugShapeBatch', () => {
  it('supports no-arg construction + property binding (R3F pattern)', () => {
    const batch = new SlugShapeBatch()
    expect(batch.shapes).toBeNull()
    const { set } = makeSet()
    batch.shapes = set
    expect(batch.shapes).toBe(set)
    expect(batch.material).toBeInstanceOf(SlugMaterial)
    expect((batch.material as SlugMaterial).font).toBe(set)
    batch.dispose()
  })

  it('is a duck-typed instanced mesh with the batch instance lanes', () => {
    const { set } = makeSet()
    const batch = new SlugShapeBatch({ shapes: set })
    expect(batch.isInstancedMesh).toBe(true)
    expect(batch.instanceMatrix).toBeNull()
    expect(batch.count).toBe(0)
    expect(batch.batchGeometry.getAttribute('glyphMtx0')).toBeDefined()
    expect(batch.batchGeometry.getAttribute('glyphClip0')).toBeDefined()
    batch.dispose()
  })

  it('rejects font binding — shapes is the source', () => {
    const batch = new SlugShapeBatch()
    expect(batch.font).toBeNull()
    expect(() => {
      batch.font = null
    }).toThrow(/shapes/)
    batch.dispose()
  })

  it('writeShape writes glyph-compatible pos/jac lanes scaled by `scale`', () => {
    const { set, unit } = makeSet()
    const batch = new SlugShapeBatch({ shapes: set })
    batch.writeShape(0, unit, { scale: 10, x: 5, y: 5 })
    batch.count = 1

    const a = batch.batchGeometry.instanceArray
    // Unit box at scale 10 from origin (5, 5): center (10, 10), half-size (5, 5)
    expect(a[OFFSET_POS]).toBe(10)
    expect(a[OFFSET_POS + 1]).toBe(10)
    expect(a[OFFSET_POS + 2]).toBe(5)
    expect(a[OFFSET_POS + 3]).toBe(5)
    // Jacobian invScale = 1/scale; band counts positive (not the rect sentinel)
    expect(a[OFFSET_JAC]).toBeCloseTo(0.1, 6)
    expect(a[OFFSET_JAC + 3]).toBeGreaterThan(0)
    // Defaults: white color, identity matrix, clip sentinel
    expect(Array.from(a.subarray(OFFSET_COLOR, OFFSET_COLOR + 4))).toEqual([1, 1, 1, 1])
    expect(a[OFFSET_MTX]).toBe(1)
    expect(a[OFFSET_CLIP + 3]).toBe(1)
    batch.dispose()
  })

  it('accepts handle ids, per-instance color / matrix / clip', () => {
    const { set, unit } = makeSet()
    const batch = new SlugShapeBatch({ shapes: set })
    const matrix = new Matrix4().makeTranslation(3, 0, 0)
    const clip = new Matrix4().set(1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1)
    batch.writeShape(0, unit.glyphId, {
      color: new Color(1, 0, 0),
      opacity: 0.5,
      matrix,
      clip,
    })
    const a = batch.batchGeometry.instanceArray
    expect(Array.from(a.subarray(OFFSET_COLOR, OFFSET_COLOR + 4))).toEqual([1, 0, 0, 0.5])
    expect(a[OFFSET_MTX + 12]).toBe(3) // translation in column 3
    expect(Array.from(a.subarray(OFFSET_CLIP, OFFSET_CLIP + 4))).toEqual([1, 0, 0, 0])
    batch.dispose()
  })

  it('writes a hidden degenerate for unknown handle ids (dense allocator slots)', () => {
    const { set } = makeSet()
    const batch = new SlugShapeBatch({ shapes: set })
    batch.writeShape(0, 999)
    const a = batch.batchGeometry.instanceArray
    expect(a[OFFSET_JAC + 3]).toBe(-1) // rect sentinel
    expect(a[OFFSET_COLOR + 3]).toBe(0) // alpha 0
    batch.dispose()
  })

  it('auto-grows capacity on out-of-range writes', () => {
    const { set, unit } = makeSet()
    const batch = new SlugShapeBatch({ shapes: set, capacity: 2 })
    batch.writeShape(7, unit)
    expect(batch.capacity).toBeGreaterThanOrEqual(8)
    batch.dispose()
  })

  it('re-binds its material when the set repacks after growth', () => {
    const { set, unit } = makeSet()
    const batch = new SlugShapeBatch({ shapes: set })
    batch.writeShape(0, unit, { scale: 32 })
    batch.count = 1

    const materialBefore = batch.material as SlugMaterial
    const textureBefore = set.curveTexture

    // Growth: register more shapes → repack → new texture objects
    for (let i = 0; i < 8; i++) set.registerShape([rect(0, 0, 0.25 + i / 32, 0.5)])
    expect(set.curveTexture).not.toBe(textureBefore)

    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.updateMatrixWorld(true)
    batch.updateMatrixWorld(true)
    batch.update(camera)

    const materialAfter = batch.material as SlugMaterial
    expect(materialAfter).not.toBe(materialBefore)
    expect(materialAfter.font).toBe(set)
    // A second update with no repack keeps the material stable
    batch.update(camera)
    expect(batch.material).toBe(materialAfter)
    batch.dispose()
  })

  it('defers binding while the set is empty, binds on first update after shapes exist', () => {
    const set = new SlugShapeSet()
    const batch = new SlugShapeBatch({ shapes: set })
    // Mesh's default material until the set has something to bind
    expect(batch.material).not.toBeInstanceOf(SlugMaterial)

    set.registerShape([rect(0, 0, 1, 1)])
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.updateMatrixWorld(true)
    batch.updateMatrixWorld(true)
    batch.update(camera)
    expect(batch.material).toBeInstanceOf(SlugMaterial)
    batch.dispose()
  })
})
