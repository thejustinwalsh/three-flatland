import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPictureRecorder, SkiaPicture } from './picture'

let skia: SkiaContext
beforeAll(async () => { skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext) })

describe('SkiaPictureRecorder', () => {
  it('record and replay', () => {
    const rec = new SkiaPictureRecorder(skia)
    expect(rec._handle).toBeGreaterThan(0)

    const canvasOk = rec.beginRecording(0, 0, 256, 256)
    expect(canvasOk).toBeTruthy()

    const pic = rec.finishRecording()
    expect(pic).not.toBeNull()
    expect(pic).toBeInstanceOf(SkiaPicture)

    skia.drawToFBO(0, 256, 256, (ctx) => {
      ctx.drawPicture(pic!)
    })

    pic!.dispose()
    rec.dispose()
  })
})
