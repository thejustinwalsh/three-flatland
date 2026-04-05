import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaImageFilter } from './image-filter'
import { SkiaColorFilter } from './color-filter'
import { SkiaPaint } from './paint'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaImageFilter', () => {
  it('blur', () => {
    const f = SkiaImageFilter.blur(skia, 4, 4)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('blur with input', () => {
    const inner = SkiaImageFilter.offset(skia, 10, 10)!
    const f = SkiaImageFilter.blur(skia, 4, 4, inner)
    expect(f).not.toBeNull()
    f!.dispose()
    inner.dispose()
  })

  it('dropShadow', () => {
    const f = SkiaImageFilter.dropShadow(skia, 4, 4, 3, 3, 0x80000000)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('dropShadowOnly', () => {
    const f = SkiaImageFilter.dropShadowOnly(skia, 4, 4, 3, 3, 0x80000000)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('offset', () => {
    const f = SkiaImageFilter.offset(skia, 10, -5)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('compose', () => {
    const a = SkiaImageFilter.blur(skia, 2, 2)!
    const b = SkiaImageFilter.offset(skia, 5, 5)!
    const f = SkiaImageFilter.compose(skia, a, b)
    expect(f).not.toBeNull()
    f!.dispose()
    a.dispose()
    b.dispose()
  })

  it('dilate', () => {
    const f = SkiaImageFilter.dilate(skia, 3, 3)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('erode', () => {
    const f = SkiaImageFilter.erode(skia, 2, 2)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('colorFilter as image filter', () => {
    const cf = SkiaColorFilter.blend(skia, 0xFFFF0000, 'srcOver')!
    const f = SkiaImageFilter.colorFilter(skia, cf)
    expect(f).not.toBeNull()
    f!.dispose()
    cf.dispose()
  })

  it('displacementMap', () => {
    const disp = SkiaImageFilter.blur(skia, 2, 2)!
    const f = SkiaImageFilter.displacementMap(skia, 'red', 'green', 10, disp)
    expect(f).not.toBeNull()
    f!.dispose()
    disp.dispose()
  })

  it('attaches to paint', () => {
    const f = SkiaImageFilter.blur(skia, 4, 4)!
    const p = new SkiaPaint(skia).setImageFilter(f)
    p.clearImageFilter()
    p.dispose()
    f.dispose()
  })

  it('blend creates blended filter', () => {
    const bg = SkiaImageFilter.blur(skia, 2, 2)!
    const fg = SkiaImageFilter.offset(skia, 5, 5)!
    const f = SkiaImageFilter.blend(skia, 'srcOver', bg, fg)
    expect(f).not.toBeNull()
    expect(f!._handle).toBeGreaterThan(0)
    f!.dispose()
    bg.dispose()
    fg.dispose()
  })

  it('matrixTransform creates transform filter', () => {
    // Identity 3x3 matrix
    const f = SkiaImageFilter.matrixTransform(skia, [1, 0, 0, 0, 1, 0, 0, 0, 1])
    expect(f).not.toBeNull()
    expect(f!._handle).toBeGreaterThan(0)
    f!.dispose()
  })
})
