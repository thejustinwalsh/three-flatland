import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPaint } from './paint'

let skia: SkiaContext

beforeAll(async () => {
  skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext)
})

describe('SkiaPaint', () => {
  it('creates and disposes', () => {
    const paint = new SkiaPaint(skia)
    expect(paint._handle).toBeGreaterThan(0)
    paint.dispose()
    expect(paint._handle).toBe(0)
  })

  it('fluent color + fill', () => {
    const paint = new SkiaPaint(skia)
      .setColor(1, 0, 0, 1)
      .setFill()
    expect(paint._handle).toBeGreaterThan(0)
    paint.dispose()
  })

  it('stroke with cap/join/miter', () => {
    const paint = new SkiaPaint(skia)
      .setStroke(3)
      .setStrokeCap('round')
      .setStrokeJoin('bevel')
      .setStrokeMiter(8)
    paint.dispose()
  })

  it('alpha and blend mode', () => {
    const paint = new SkiaPaint(skia)
      .setAlpha(0.5)
      .setBlendMode('multiply')
      .setAntiAlias(true)
    paint.dispose()
  })

  it('blur styles', () => {
    const paint = new SkiaPaint(skia)
    paint.setBlur(4, 'normal')
    paint.setBlur(4, 'solid')
    paint.setBlur(4, 'outer')
    paint.setBlur(4, 'inner')
    paint.clearBlur()
    paint.dispose()
  })

  it('dash', () => {
    const paint = new SkiaPaint(skia)
      .setDash([10, 5, 3, 5], 0)
    paint.clearDash()
    paint.dispose()
  })

  it('linear gradient', () => {
    const paint = new SkiaPaint(skia)
      .setLinearGradient(0, 0, 100, 0, [0xFFFF0000, 0xFF0000FF], [0, 1])
    paint.clearShader()
    paint.dispose()
  })

  it('radial gradient', () => {
    new SkiaPaint(skia)
      .setRadialGradient(50, 50, 50, [0xFFFF0000, 0xFF0000FF], [0, 1])
      .dispose()
  })

  it('sweep gradient', () => {
    new SkiaPaint(skia)
      .setSweepGradient(50, 50, [0xFFFF0000, 0xFF00FF00, 0xFF0000FF], [0, 0.5, 1])
      .dispose()
  })

  it('two point conical gradient', () => {
    new SkiaPaint(skia)
      .setTwoPointConicalGradient(30, 30, 10, 60, 60, 50, [0xFFFF0000, 0xFF0000FF], [0, 1])
      .dispose()
  })

  it('getColor returns color components', () => {
    const paint = new SkiaPaint(skia).setColor(0.5, 0.3, 0.1, 1.0)
    const c = paint.getColor()
    expect(c.r).toBeCloseTo(0.5, 1)
    expect(c.g).toBeCloseTo(0.3, 1)
    expect(c.b).toBeCloseTo(0.1, 1)
    expect(c.a).toBeCloseTo(1.0, 1)
    paint.dispose()
  })

  it('getAlpha returns alpha', () => {
    const paint = new SkiaPaint(skia).setAlpha(0.7)
    expect(paint.getAlpha()).toBeCloseTo(0.7, 1)
    paint.dispose()
  })

  it('getBlendMode returns blend mode', () => {
    const paint = new SkiaPaint(skia).setBlendMode('multiply')
    expect(paint.getBlendMode()).toBe('multiply')
    paint.dispose()
  })

  it('getStrokeCap returns cap', () => {
    const paint = new SkiaPaint(skia).setStrokeCap('round')
    expect(paint.getStrokeCap()).toBe('round')
    paint.dispose()
  })

  it('getStrokeJoin returns join', () => {
    const paint = new SkiaPaint(skia).setStrokeJoin('bevel')
    expect(paint.getStrokeJoin()).toBe('bevel')
    paint.dispose()
  })

  it('getStrokeWidth returns width', () => {
    const paint = new SkiaPaint(skia).setStroke(3.5)
    expect(paint.getStrokeWidth()).toBeCloseTo(3.5, 1)
    paint.dispose()
  })

  it('getStrokeMiter returns miter', () => {
    const paint = new SkiaPaint(skia).setStrokeMiter(8.0)
    expect(paint.getStrokeMiter()).toBeCloseTo(8.0, 1)
    paint.dispose()
  })

  it('getStyle returns fill or stroke', () => {
    const paint = new SkiaPaint(skia)
    paint.setFill()
    expect(paint.getStyle()).toBe('fill')
    paint.setStroke(2)
    expect(paint.getStyle()).toBe('stroke')
    paint.dispose()
  })

  it('copy creates independent paint', () => {
    const original = new SkiaPaint(skia).setColor(1, 0, 0, 1)
    const copied = original.copy()
    original.setColor(0, 1, 0, 1)
    const origColor = original.getColor()
    const copyColor = copied.getColor()
    expect(origColor.r).toBeCloseTo(0, 1)
    expect(origColor.g).toBeCloseTo(1, 1)
    expect(copyColor.r).toBeCloseTo(1, 1)
    expect(copyColor.g).toBeCloseTo(0, 1)
    original.dispose()
    copied.dispose()
  })
})
