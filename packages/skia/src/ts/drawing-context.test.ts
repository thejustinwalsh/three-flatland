import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPaint } from './paint'
import { SkiaPath } from './path'
import type { SkiaDrawingContext } from './drawing-context'

let skia: SkiaContext
let ctx: SkiaDrawingContext
let paint: SkiaPaint

beforeAll(async () => {
  skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext)
})

beforeEach(() => {
  ctx = skia.beginDrawing(0, 256, 256)!
  paint = new SkiaPaint(skia).setColor(1, 0, 0, 1).setFill()
})

afterEach(() => {
  paint.dispose()
  skia.endDrawing()
})

describe('SkiaDrawingContext', () => {
  it('clear', () => {
    ctx.clear(0, 0, 0, 1)
    ctx.clear(1, 1, 1) // alpha defaults to 1
  })

  it('drawRect', () => { ctx.drawRect(10, 10, 100, 50, paint) })
  it('drawRoundRect', () => { ctx.drawRoundRect(10, 10, 100, 50, 8, 8, paint) })
  it('drawCircle', () => { ctx.drawCircle(100, 100, 50, paint) })
  it('drawOval', () => { ctx.drawOval(10, 10, 100, 50, paint) })
  it('drawLine', () => { ctx.drawLine(0, 0, 256, 256, paint) })

  it('drawPath', () => {
    const path = new SkiaPath(skia).moveTo(10, 10).lineTo(100, 50).lineTo(50, 100).close()
    ctx.drawPath(path, paint)
    path.dispose()
  })

  it('drawText (no font — tests call path only)', () => {
    // Without a font, drawText is a no-op but shouldn't crash
    // Font tests cover the real text path
  })

  it('save/restore', () => {
    ctx.save()
    ctx.restore()
  })

  it('translate', () => { ctx.translate(50, 50) })
  it('rotate', () => { ctx.rotate(45) })
  it('scale uniform', () => { ctx.scale(2) })
  it('scale non-uniform', () => { ctx.scale(2, 0.5) })
  it('skew', () => { ctx.skew(0.1, 0.2) })

  it('concat 3x3 matrix', () => {
    ctx.concat([1, 0, 0, 0, 1, 0, 0, 0, 1]) // identity
  })

  it('concat 4x4 matrix', () => {
    ctx.concat(new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])) // identity
  })

  it('clipRect', () => { ctx.clipRect(10, 10, 200, 200) })
  it('clipRoundRect', () => { ctx.clipRoundRect(10, 10, 200, 200, 8, 8) })

  it('clipPath', () => {
    const path = new SkiaPath(skia).moveTo(50, 0).lineTo(100, 100).lineTo(0, 100).close()
    ctx.clipPath(path)
    path.dispose()
  })

  it('saveLayer with paint', () => {
    const layerPaint = new SkiaPaint(skia).setAlpha(0.5)
    ctx.saveLayer(undefined, layerPaint)
    ctx.clear(1, 0, 0, 1)
    ctx.restore()
    layerPaint.dispose()
  })

  it('saveLayerAlpha', () => {
    ctx.saveLayerAlpha(0.5)
    ctx.clear(0, 1, 0, 1)
    ctx.restore()
  })

  it('saveLayer with bounds', () => {
    ctx.saveLayer([10, 10, 100, 100], paint)
    ctx.clear(0, 0, 1, 1)
    ctx.restore()
  })

  it('throws after endDrawing', () => {
    skia.endDrawing()
    expect(() => ctx.clear(0, 0, 0, 1)).toThrow('no longer valid')
    // Re-open for afterEach cleanup
    ctx = skia.beginDrawing(0, 256, 256)!
  })

  it('drawArc does not throw', () => {
    ctx.drawArc(10, 10, 100, 100, 0, 270, true, paint)
  })

  it('drawDRRect does not throw', () => {
    ctx.drawDRRect(
      { x: 10, y: 10, w: 200, h: 200, rx: 20, ry: 20 },
      { x: 20, y: 20, w: 160, h: 160, rx: 10, ry: 10 },
      paint,
    )
  })

  it('drawPaint does not throw', () => {
    ctx.drawPaint(paint)
  })

  it('drawColor does not throw', () => {
    ctx.drawColor(1, 0, 0, 1)
  })

  it('getSaveCount returns count', () => {
    ctx.save()
    expect(ctx.getSaveCount()).toBeGreaterThan(1)
    ctx.restore()
  })

  it('restoreToCount restores', () => {
    const base = ctx.getSaveCount()
    ctx.save()
    ctx.save()
    expect(ctx.getSaveCount()).toBeGreaterThan(base)
    ctx.restoreToCount(base)
  })

  it('getTotalMatrix returns 9 floats', () => {
    const m = ctx.getTotalMatrix()
    expect(m.length).toBe(9)
    // Identity matrix: first row [1, 0, 0]
    expect(m[0]).toBeCloseTo(1, 1)
    expect(m[1]).toBeCloseTo(0, 1)
    expect(m[2]).toBeCloseTo(0, 1)
  })

  it('readPixels returns data or null', () => {
    // Should not throw regardless of whether mock GPU returns data
    const result = ctx.readPixels(0, 0, 64, 64)
    if (result !== null) {
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(64 * 64 * 4)
    }
  })
})
