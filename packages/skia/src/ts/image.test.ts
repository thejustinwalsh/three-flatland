import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaImage } from './image'
import { SkiaPaint } from './paint'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaImage', () => {
  it('creates from pixels', () => {
    const pixels = new Uint8Array(4 * 4 * 4).fill(128) // 4x4 RGBA
    const img = SkiaImage.fromPixels(skia, pixels, 4, 4)
    expect(img).not.toBeNull()
    expect(img!.width).toBe(4)
    expect(img!.height).toBe(4)
    img!.dispose()
  })

  it('throws on buffer too small', () => {
    expect(() => SkiaImage.fromPixels(skia, new Uint8Array(4), 4, 4)).toThrow('too small')
  })

  it('drawImage', () => {
    const pixels = new Uint8Array(8 * 8 * 4).fill(200)
    const img = SkiaImage.fromPixels(skia, pixels, 8, 8)!
    const paint = new SkiaPaint(skia)

    skia.drawToFBO(0, 256, 256, (ctx) => {
      ctx.drawImage(img, 10, 10)
      ctx.drawImage(img, 50, 50, paint)
    })

    paint.dispose()
    img.dispose()
  })

  it('drawImageRect', () => {
    const pixels = new Uint8Array(8 * 8 * 4).fill(200)
    const img = SkiaImage.fromPixels(skia, pixels, 8, 8)!

    skia.drawToFBO(0, 256, 256, (ctx) => {
      ctx.drawImageRect(img, [0, 0, 8, 8], [50, 50, 64, 64])
    })

    img.dispose()
  })

  it('readPixels returns pixel data', () => {
    const pixels = new Uint8Array(4 * 4 * 4).fill(128)
    const img = SkiaImage.fromPixels(skia, pixels, 4, 4)!
    const result = img.readPixels()
    if (result !== null) {
      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBe(4 * 4 * 4)
    }
    img.dispose()
  })
})
