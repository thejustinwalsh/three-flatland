import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaShader } from './shader'
import { SkiaImage } from './image'
import { SkiaPaint } from './paint'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaShader', () => {
  it('fractalNoise', () => {
    const s = SkiaShader.fractalNoise(skia, 0.05, 0.05, 4, 42)
    expect(s).not.toBeNull()
    s!.dispose()
  })

  it('turbulence', () => {
    const s = SkiaShader.turbulence(skia, 0.1, 0.1, 2, 0)
    expect(s).not.toBeNull()
    s!.dispose()
  })

  it('image shader', () => {
    const img = SkiaImage.fromPixels(skia, new Uint8Array(16).fill(255), 2, 2)!
    const s = SkiaShader.image(skia, img, 'repeat', 'repeat')
    expect(s).not.toBeNull()
    s!.dispose()
    img.dispose()
  })

  it('attaches to paint', () => {
    const s = SkiaShader.fractalNoise(skia, 0.05, 0.05, 4, 0)!
    const p = new SkiaPaint(skia).setShader(s)
    p.clearShader()
    p.dispose()
    s.dispose()
  })

  it('color creates solid color shader', () => {
    const s = SkiaShader.color(skia, 1, 0, 0, 1)
    expect(s).not.toBeNull()
    expect(s!._handle).toBeGreaterThan(0)
    s!.dispose()
  })

  it('blend creates blended shader', () => {
    const a = SkiaShader.color(skia, 1, 0, 0, 1)!
    const b = SkiaShader.color(skia, 0, 0, 1, 1)!
    const blended = SkiaShader.blend(skia, 'srcOver', a, b)
    expect(blended).not.toBeNull()
    expect(blended!._handle).toBeGreaterThan(0)
    blended!.dispose()
    a.dispose()
    b.dispose()
  })

  it('linearGradient creates gradient shader', () => {
    const s = SkiaShader.linearGradient(skia, 0, 0, 100, 0, [0xFFFF0000, 0xFF0000FF], [0, 1])
    expect(s).not.toBeNull()
    expect(s!._handle).toBeGreaterThan(0)
    s!.dispose()
  })

  it('radialGradient creates gradient shader', () => {
    const s = SkiaShader.radialGradient(skia, 50, 50, 50, [0xFFFF0000, 0xFF0000FF], [0, 1])
    expect(s).not.toBeNull()
    expect(s!._handle).toBeGreaterThan(0)
    s!.dispose()
  })

  it('sweepGradient creates gradient shader', () => {
    const s = SkiaShader.sweepGradient(skia, 50, 50, [0xFFFF0000, 0xFF00FF00, 0xFF0000FF], [0, 0.5, 1])
    expect(s).not.toBeNull()
    expect(s!._handle).toBeGreaterThan(0)
    s!.dispose()
  })

  it('twoPointConicalGradient creates gradient shader', () => {
    const s = SkiaShader.twoPointConicalGradient(skia, 30, 30, 10, 60, 60, 50, [0xFFFF0000, 0xFF0000FF], [0, 1])
    expect(s).not.toBeNull()
    expect(s!._handle).toBeGreaterThan(0)
    s!.dispose()
  })
})
