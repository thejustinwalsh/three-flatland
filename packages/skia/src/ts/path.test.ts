import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPath } from './path'

let skia: SkiaContext
beforeAll(async () => {
  skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext)
})

describe('SkiaPath', () => {
  it('creates and disposes', () => {
    const path = new SkiaPath(skia)
    expect(path._handle).toBeGreaterThan(0)
    path.dispose()
  })

  it('fluent path building', () => {
    const path = new SkiaPath(skia)
      .moveTo(0, 0).lineTo(100, 0).lineTo(100, 100).close()
    path.dispose()
  })

  it('curves', () => {
    const path = new SkiaPath(skia)
      .moveTo(0, 0)
      .quadTo(50, -50, 100, 0)
      .cubicTo(120, 50, 80, 50, 100, 100)
      .arcTo(20, 20, 0, false, true, 50, 50)
      .close()
    path.dispose()
  })

  it('fill type', () => {
    const path = new SkiaPath(skia)
    path.setFillType('evenOdd')
    expect(path.getFillType()).toBe('evenOdd')
    path.setFillType('winding')
    expect(path.getFillType()).toBe('winding')
    path.dispose()
  })

  it('from SVG string', () => {
    const path = SkiaPath.fromSVGString(skia, 'M10 10 L100 10 L100 100 Z')
    expect(path).not.toBeNull()
    path!.dispose()
  })

  it('boolean operations', () => {
    const a = new SkiaPath(skia).moveTo(0, 0).lineTo(100, 0).lineTo(100, 100).lineTo(0, 100).close()
    const b = new SkiaPath(skia).moveTo(50, 50).lineTo(150, 50).lineTo(150, 150).lineTo(50, 150).close()

    const union = a.op(b, 'union')
    expect(union).not.toBeNull()
    union!.dispose()

    const simplified = a.simplify()
    expect(simplified).not.toBeNull()
    simplified!.dispose()

    a.dispose()
    b.dispose()
  })

  it('reset', () => {
    const path = new SkiaPath(skia).moveTo(10, 10).lineTo(20, 20).reset()
    path.dispose()
  })

  it('addRect adds rectangle contour', () => {
    const path = new SkiaPath(skia).addRect(0, 0, 100, 100)
    expect(path.isEmpty()).toBe(false)
    path.dispose()
  })

  it('addCircle adds circle', () => {
    const path = new SkiaPath(skia).addCircle(50, 50, 25)
    expect(path.isEmpty()).toBe(false)
    path.dispose()
  })

  it('addOval adds oval', () => {
    const path = new SkiaPath(skia).addOval(0, 0, 100, 50)
    expect(path.isEmpty()).toBe(false)
    path.dispose()
  })

  it('addRoundRect adds rounded rect', () => {
    const path = new SkiaPath(skia).addRoundRect(0, 0, 100, 50, 10, 10)
    expect(path.isEmpty()).toBe(false)
    path.dispose()
  })

  it('addArc adds arc', () => {
    const path = new SkiaPath(skia).addArc(0, 0, 100, 100, 0, 180)
    expect(path.isEmpty()).toBe(false)
    path.dispose()
  })

  it('addPath appends another path', () => {
    const a = new SkiaPath(skia).addRect(0, 0, 50, 50)
    const b = new SkiaPath(skia).addRect(50, 50, 50, 50)
    a.addPath(b)
    expect(a.isEmpty()).toBe(false)
    a.dispose()
    b.dispose()
  })

  it('getBounds returns bounding box', () => {
    const path = new SkiaPath(skia).addRect(10, 20, 30, 40)
    const bounds = path.getBounds()
    expect(bounds.x).toBeCloseTo(10, 1)
    expect(bounds.y).toBeCloseTo(20, 1)
    path.dispose()
  })

  it('computeTightBounds returns bounds', () => {
    const path = new SkiaPath(skia).addRect(10, 20, 30, 40)
    const bounds = path.computeTightBounds()
    expect(bounds.x).toBeCloseTo(10, 1)
    expect(bounds.y).toBeCloseTo(20, 1)
    path.dispose()
  })

  it('contains detects point inside', () => {
    const path = new SkiaPath(skia).addRect(0, 0, 100, 100)
    expect(path.contains(50, 50)).toBe(true)
    expect(path.contains(200, 200)).toBe(false)
    path.dispose()
  })

  it('conicTo does not throw', () => {
    const path = new SkiaPath(skia).moveTo(0, 0).conicTo(50, -50, 100, 0, 0.7)
    path.dispose()
  })

  it('transform returns new path', () => {
    const path = new SkiaPath(skia).addRect(0, 0, 100, 100)
    const transformed = path.transform([1, 0, 0, 0, 1, 0, 0, 0, 1])
    expect(transformed).not.toBeNull()
    expect(transformed).toBeInstanceOf(SkiaPath)
    transformed!.dispose()
    path.dispose()
  })

  it('copy creates independent path', () => {
    const path = new SkiaPath(skia).addRect(0, 0, 100, 100)
    const copied = path.copy()
    expect(copied).not.toBeNull()
    path.reset()
    expect(path.isEmpty()).toBe(true)
    expect(copied!.isEmpty()).toBe(false)
    path.dispose()
    copied!.dispose()
  })

  it('isEmpty on fresh path', () => {
    const path = new SkiaPath(skia)
    expect(path.isEmpty()).toBe(true)
    path.dispose()
  })

  it('rLineTo relative line', () => {
    const path = new SkiaPath(skia).moveTo(0, 0).rLineTo(100, 0)
    expect(path.isEmpty()).toBe(false)
    path.dispose()
  })

  it('rMoveTo, rQuadTo, rCubicTo, rConicTo do not throw', () => {
    const path = new SkiaPath(skia)
      .moveTo(0, 0)
      .rMoveTo(10, 10)
      .rQuadTo(50, -50, 100, 0)
      .rCubicTo(10, 20, 30, 40, 50, 60)
      .rConicTo(10, -10, 20, 0, 0.5)
    path.dispose()
  })

  it('offset modifies path', () => {
    const path = new SkiaPath(skia).addRect(0, 0, 10, 10)
    path.offset(100, 100)
    const bounds = path.getBounds()
    expect(bounds.x).toBeCloseTo(100, 1)
    expect(bounds.y).toBeCloseTo(100, 1)
    path.dispose()
  })

  it('countPoints returns point count', () => {
    const path = new SkiaPath(skia).moveTo(0, 0).lineTo(50, 0).lineTo(50, 50)
    expect(path.countPoints()).toBeGreaterThanOrEqual(3)
    path.dispose()
  })

  it('getPoint returns point', () => {
    const path = new SkiaPath(skia).moveTo(42, 99)
    const pt = path.getPoint(0)
    expect(pt.x).toBeCloseTo(42, 1)
    expect(pt.y).toBeCloseTo(99, 1)
    path.dispose()
  })
})
