import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPathEffect } from './path-effect'
import { SkiaPath } from './path'
import { SkiaPaint } from './paint'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaPathEffect', () => {
  it('dash', () => {
    const pe = SkiaPathEffect.dash(skia, [10, 5], 0)
    expect(pe).not.toBeNull()
    pe!.dispose()
  })

  it('corner', () => {
    const pe = SkiaPathEffect.corner(skia, 8)
    expect(pe).not.toBeNull()
    pe!.dispose()
  })

  it('discrete', () => {
    const pe = SkiaPathEffect.discrete(skia, 10, 2, 42)
    expect(pe).not.toBeNull()
    pe!.dispose()
  })

  it('trim', () => {
    const pe = SkiaPathEffect.trim(skia, 0, 0.5)
    expect(pe).not.toBeNull()
    pe!.dispose()
  })

  it('trim inverted', () => {
    const pe = SkiaPathEffect.trim(skia, 0.2, 0.8, true)
    expect(pe).not.toBeNull()
    pe!.dispose()
  })

  it('path1D', () => {
    const stamp = new SkiaPath(skia).moveTo(-2, -2).lineTo(2, -2).lineTo(2, 2).lineTo(-2, 2).close()
    const pe = SkiaPathEffect.path1D(skia, stamp, 10, 0, 'translate')
    expect(pe).not.toBeNull()
    pe!.dispose()
    stamp.dispose()
  })

  it('compose', () => {
    const a = SkiaPathEffect.corner(skia, 4)!
    const b = SkiaPathEffect.trim(skia, 0.1, 0.9)!
    const pe = SkiaPathEffect.compose(skia, a, b)
    expect(pe).not.toBeNull()
    pe!.dispose()
    a.dispose()
    b.dispose()
  })

  it('sum', () => {
    const a = SkiaPathEffect.corner(skia, 4)!
    const b = SkiaPathEffect.discrete(skia, 5, 1, 0)!
    const pe = SkiaPathEffect.sum(skia, a, b)
    expect(pe).not.toBeNull()
    pe!.dispose()
    a.dispose()
    b.dispose()
  })

  it('attaches to paint', () => {
    const pe = SkiaPathEffect.corner(skia, 8)!
    const p = new SkiaPaint(skia).setPathEffect(pe)
    p.clearPathEffect()
    p.dispose()
    pe.dispose()
  })

  it('path2D creates 2D path effect', () => {
    const stamp = new SkiaPath(skia).moveTo(-2, -2).lineTo(2, -2).lineTo(2, 2).lineTo(-2, 2).close()
    // Identity 3x3 matrix
    const pe = SkiaPathEffect.path2D(skia, [1, 0, 0, 0, 1, 0, 0, 0, 1], stamp)
    expect(pe).not.toBeNull()
    expect(pe!._handle).toBeGreaterThan(0)
    pe!.dispose()
    stamp.dispose()
  })
})
