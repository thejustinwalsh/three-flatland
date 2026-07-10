import { describe, it, expect } from 'vitest'
import { SlugShapeSet } from './SlugShapeSet'
import { lineToQuadratic } from './pipeline/fontParser'
import type { QuadContour } from './types'

/** Closed axis-aligned rectangle contour (exact degenerate quads). */
function rect(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x1, y0, s),
    lineToQuadratic(x1, y0, x1, y1, s),
    lineToQuadratic(x1, y1, x0, y1, s),
    lineToQuadratic(x0, y1, x0, y0, s),
  ]
}

/** Reversed rectangle (hole under nonzero winding). */
function rectReversed(x0: number, y0: number, x1: number, y1: number): QuadContour {
  const s = 1 / 1024
  return [
    lineToQuadratic(x0, y0, x0, y1, s),
    lineToQuadratic(x0, y1, x1, y1, s),
    lineToQuadratic(x1, y1, x1, y0, s),
    lineToQuadratic(x1, y0, x0, y0, s),
  ]
}

describe('SlugShapeSet', () => {
  it('registers shapes with sequential ids, bounds, and bands', () => {
    const set = new SlugShapeSet()
    const a = set.registerShape([rect(0, 0, 1, 1)])
    const b = set.registerShape([rect(0, 0, 0.5, 0.25)])

    expect(a.glyphId).toBe(0)
    expect(b.glyphId).toBe(1)
    expect(set.shapeCount).toBe(2)
    expect(set.getShape(0)).toBe(a)

    expect(a.bounds).toEqual({ xMin: 0, yMin: 0, xMax: 1, yMax: 1 })
    expect(b.bounds.xMax).toBeCloseTo(0.5, 6)
    expect(a.bands.hBands.length).toBeGreaterThan(0)
    expect(a.bands.vBands.length).toBeGreaterThan(0)
    // Shape "metrics": advance = ink width, lsb = ink start
    expect(a.advanceWidth).toBe(1)
    expect(a.lsb).toBe(0)
  })

  it('supports multi-contour shapes (holes)', () => {
    const set = new SlugShapeSet()
    const donut = set.registerShape([rect(0, 0, 1, 1), rectReversed(0.25, 0.25, 0.75, 0.75)])
    expect(donut.contourStarts).toEqual([0, 4])
    expect(donut.curves).toHaveLength(8)
  })

  it('throws on an empty shape and on texture access with no shapes', () => {
    const set = new SlugShapeSet()
    expect(() => set.registerShape([])).toThrow(/no curves/)
    expect(() => set.curveTexture).toThrow(/no shapes/)
  })

  it('packs lazily and bumps version per repack', () => {
    const set = new SlugShapeSet()
    set.registerShape([rect(0, 0, 1, 1)])
    const v1 = set.version
    const t1 = set.curveTexture
    // No registration → same pack
    expect(set.version).toBe(v1)
    expect(set.curveTexture).toBe(t1)

    set.registerShape([rect(0, 0, 0.5, 0.5)])
    const v2 = set.version
    expect(v2).toBe(v1 + 1)
    expect(set.curveTexture).not.toBe(t1)
  })

  it('growth preserves previously registered shapes (locations AND texels)', () => {
    const set = new SlugShapeSet()
    const first = set.registerShape([rect(0, 0, 1, 1), rectReversed(0.25, 0.25, 0.75, 0.75)])
    const second = set.registerShape([rect(0.1, 0.1, 0.9, 0.4)])

    // Pack once, snapshot shape 0/1 state
    const curveData1 = (set.curveTexture.image.data as Uint16Array).slice()
    const bandData1 = (set.bandTexture.image.data as Float32Array).slice()
    const curveLoc = { ...first.curveLocation }
    const bandLoc = { ...first.bandLocation }
    const curveLoc2 = { ...second.curveLocation }
    const bandLoc2 = { ...second.bandLocation }
    const height1 = set.curveTexture.image.height

    // Register enough shapes to force the curve texture to grow a row
    // (4096 texels per row; each rect shape uses 5 texels + band words).
    for (let i = 0; i < 900; i++) {
      set.registerShape([rect(0, 0, 0.5 + (i % 7) / 16, 0.5 + (i % 5) / 16)])
    }

    const curveData2 = set.curveTexture.image.data as Uint16Array
    const bandData2 = set.bandTexture.image.data as Float32Array

    // Previously registered shapes did not move…
    expect(first.curveLocation).toEqual(curveLoc)
    expect(first.bandLocation).toEqual(bandLoc)
    expect(second.curveLocation).toEqual(curveLoc2)
    expect(second.bandLocation).toEqual(bandLoc2)

    // …and their packed texels are bit-identical. Compare the prefix up to
    // shape 2's start (covers shape 0 and 1 entirely).
    const curvePrefix = (curveLoc2.y * 4096 + curveLoc2.x) * 4
    const bandPrefix = (bandLoc2.y * 4096 + bandLoc2.x) * 2
    expect(curvePrefix).toBeGreaterThan(0)
    expect(bandPrefix).toBeGreaterThan(0)
    expect(Array.from(curveData2.subarray(0, curvePrefix))).toEqual(
      Array.from(curveData1.subarray(0, curvePrefix))
    )
    expect(Array.from(bandData2.subarray(0, bandPrefix))).toEqual(
      Array.from(bandData1.subarray(0, bandPrefix))
    )

    // The texture did actually grow (the invariant was exercised, not vacuous)
    expect(set.curveTexture.image.height).toBeGreaterThan(height1)
  })

  it('quantizes registered curves to float32 (bit-exact serialization contract)', () => {
    const set = new SlugShapeSet()
    const wonky = 0.1 + 0.2 // not float32-representable
    const handle = set.registerShape([
      [
        { p0x: 0, p0y: 0, p1x: wonky, p1y: wonky, p2x: 1, p2y: 0 },
        lineToQuadratic(1, 0, 0, 0, 1 / 1024),
      ],
    ])
    expect(handle.curves[0]!.p1x).toBe(Math.fround(wonky))
  })
})
