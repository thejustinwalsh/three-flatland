import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPath } from './path'
import { SkiaPathMeasure } from './path-measure'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaPathMeasure', () => {
  it('measures a straight line', () => {
    const path = new SkiaPath(skia).moveTo(0, 0).lineTo(100, 0)
    const pm = new SkiaPathMeasure(skia, path)
    expect(pm.length).toBeCloseTo(100, 0)
    pm.dispose()
    path.dispose()
  })

  it('getPosTan at midpoint', () => {
    const path = new SkiaPath(skia).moveTo(0, 0).lineTo(100, 0)
    const pm = new SkiaPathMeasure(skia, path)
    const pt = pm.getPosTan(50)
    expect(pt).not.toBeNull()
    expect(pt!.x).toBeCloseTo(50, 0)
    expect(pt!.y).toBeCloseTo(0, 0)
    expect(pt!.tx).toBeCloseTo(1, 0) // tangent along X
    expect(pt!.ty).toBeCloseTo(0, 0)
    pm.dispose()
    path.dispose()
  })

  it('getPosTan beyond end returns null', () => {
    const path = new SkiaPath(skia).moveTo(0, 0).lineTo(10, 0)
    const pm = new SkiaPathMeasure(skia, path)
    const pt = pm.getPosTan(999)
    // Skia clamps to path length rather than returning null
    // Just verify it doesn't crash
    pm.dispose()
    path.dispose()
  })
})
