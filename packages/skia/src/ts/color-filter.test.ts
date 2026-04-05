import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaColorFilter } from './color-filter'
import { SkiaPaint } from './paint'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaColorFilter', () => {
  it('blend', () => {
    const f = SkiaColorFilter.blend(skia, 0xFFFF0000, 'srcOver')
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('matrix (grayscale)', () => {
    const f = SkiaColorFilter.matrix(skia, [
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0,      0,      0,      1, 0,
    ])
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('matrix throws on wrong length', () => {
    expect(() => SkiaColorFilter.matrix(skia, [1, 2, 3])).toThrow('20 elements')
  })

  it('compose', () => {
    const a = SkiaColorFilter.blend(skia, 0xFFFF0000, 'srcOver')!
    const b = SkiaColorFilter.linearToSRGB(skia)!
    const f = SkiaColorFilter.compose(skia, a, b)
    expect(f).not.toBeNull()
    f!.dispose()
    a.dispose()
    b.dispose()
  })

  it('lerp', () => {
    const a = SkiaColorFilter.blend(skia, 0xFFFF0000, 'srcOver')!
    const b = SkiaColorFilter.blend(skia, 0xFF0000FF, 'srcOver')!
    const f = SkiaColorFilter.lerp(skia, 0.5, a, b)
    expect(f).not.toBeNull()
    f!.dispose()
    a.dispose()
    b.dispose()
  })

  it('table', () => {
    const table = new Uint8Array(256)
    for (let i = 0; i < 256; i++) table[i] = 255 - i
    const f = SkiaColorFilter.table(skia, table)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('table throws on wrong length', () => {
    expect(() => SkiaColorFilter.table(skia, new Uint8Array(10))).toThrow('256 entries')
  })

  it('tableARGB', () => {
    const identity = new Uint8Array(256)
    for (let i = 0; i < 256; i++) identity[i] = i
    const f = SkiaColorFilter.tableARGB(skia, identity, identity, identity, identity)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('linearToSRGB', () => {
    const f = SkiaColorFilter.linearToSRGB(skia)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('srgbToLinear', () => {
    const f = SkiaColorFilter.srgbToLinear(skia)
    expect(f).not.toBeNull()
    f!.dispose()
  })

  it('attaches to paint', () => {
    const f = SkiaColorFilter.blend(skia, 0xFF0000FF, 'srcOver')!
    const p = new SkiaPaint(skia).setColorFilter(f)
    p.clearColorFilter()
    p.dispose()
    f.dispose()
  })

  it('luma creates luminance filter', () => {
    const f = SkiaColorFilter.luma(skia)
    expect(f).not.toBeNull()
    expect(f!._handle).toBeGreaterThan(0)
    f!.dispose()
  })
})
