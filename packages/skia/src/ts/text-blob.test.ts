import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SkiaContext } from './context'
import { SkiaFont } from './font'
import { SkiaPaint } from './paint'
import { SkiaTextBlob } from './text-blob'

let skia: SkiaContext
let font: SkiaFont

beforeAll(async () => {
  skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext)
  const fontData = new Uint8Array(readFileSync(resolve(__dirname, '../../third_party/skia/resources/fonts/abc/abc.ttf')))
  font = new SkiaFont(skia, fontData, 16)
})

describe('SkiaTextBlob', () => {
  it('fromText', () => {
    const blob = SkiaTextBlob.fromText(skia, 'abc', font)
    expect(blob).not.toBeNull()
    blob!.dispose()
  })

  it('draws text blob', () => {
    const blob = SkiaTextBlob.fromText(skia, 'abc', font)!
    const paint = new SkiaPaint(skia).setColor(1, 1, 1, 1)

    skia.drawToFBO(0, 256, 256, (ctx) => {
      ctx.drawTextBlob(blob, 10, 30, paint)
    })

    paint.dispose()
    blob.dispose()
  })
})
