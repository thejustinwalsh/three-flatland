import { describe, it, expect, beforeAll } from 'vitest'
import { SkiaContext } from './context'
import { SkiaPaint } from './paint'

let skia: SkiaContext

beforeAll(async () => {
  skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext)
})

describe('SkiaContext', () => {
  it('create returns a context', () => {
    expect(skia).toBeInstanceOf(SkiaContext)
    expect(skia.isDestroyed).toBe(false)
  })

  it('beginDrawing returns a drawing context', () => {
    const ctx = skia.beginDrawing(0, 256, 256)
    expect(ctx).not.toBeNull()
    skia.endDrawing()
  })

  it('endDrawing without begin is safe', () => {
    skia.endDrawing() // no-op
  })

  it('drawToFBO calls callback and returns true', () => {
    let called = false
    const result = skia.drawToFBO(0, 128, 128, (ctx) => {
      called = true
      ctx.clear(0, 0, 0, 1)
    })
    expect(result).toBe(true)
    expect(called).toBe(true)
  })

  it('drawToFBO handles exceptions in callback', () => {
    expect(() => {
      skia.drawToFBO(0, 128, 128, () => {
        throw new Error('test error')
      })
    }).toThrow('test error')
    // endDrawing should have been called via finally
    // verify we can start a new draw pass
    const ctx = skia.beginDrawing(0, 64, 64)
    expect(ctx).not.toBeNull()
    skia.endDrawing()
  })

  it('throws if beginDrawing called while already drawing', () => {
    skia.beginDrawing(0, 64, 64)
    expect(() => skia.beginDrawing(0, 64, 64)).toThrow('Already in a draw pass')
    skia.endDrawing()
  })

  it('flush does not throw', () => {
    expect(() => skia.flush()).not.toThrow()
  })

  it('resetGLState does not throw', () => {
    expect(() => skia.resetGLState()).not.toThrow()
  })

  it('writeString allocates in WASM memory', () => {
    const [ptr, len] = skia._writeString('hello')
    expect(ptr).toBeGreaterThan(0)
    expect(len).toBe(5)
  })

  it('writeBytes allocates in WASM memory', () => {
    const [ptr, len] = skia._writeBytes(new Uint8Array([1, 2, 3]))
    expect(ptr).toBeGreaterThan(0)
    expect(len).toBe(3)
  })

  it('writeF32 allocates in WASM memory', () => {
    const ptr = skia._writeF32([1.0, 2.0, 3.0])
    expect(ptr).toBeGreaterThan(0)
  })

  it('writeU32 allocates in WASM memory', () => {
    const ptr = skia._writeU32([0xFF0000FF, 0x00FF00FF])
    expect(ptr).toBeGreaterThan(0)
  })
})
