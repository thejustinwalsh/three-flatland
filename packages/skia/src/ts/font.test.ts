import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SkiaContext } from './context'
import { SkiaFont } from './font'

let skia: SkiaContext
let fontData: Uint8Array

beforeAll(async () => {
  skia = await SkiaContext.create(null as unknown as WebGL2RenderingContext)
  fontData = new Uint8Array(readFileSync(resolve(__dirname, '../../third_party/skia/resources/fonts/abc/abc.ttf')))
})

describe('SkiaFont', () => {
  it('creates from font data', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    expect(font._handle).toBeGreaterThan(0)
    font.dispose()
  })

  it('throws on invalid data', () => {
    expect(() => SkiaFont.fromData(skia, new Uint8Array([0, 1, 2, 3]), 16)).toThrow()
  })

  it('setSize', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    font.setSize(24)
    font.dispose()
  })

  it('measureText returns width', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    const w = font.measureText('abc')
    expect(w).toBeGreaterThan(0)
    font.dispose()
  })

  it('draws text in a drawing context', async () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    const { SkiaPaint } = await import('./paint')
    const paint = new SkiaPaint(skia).setColor(1, 1, 1, 1)

    skia.drawToFBO(0, 256, 256, (ctx) => {
      ctx.drawText('abc', 10, 30, font, paint)
    })

    paint.dispose()
    font.dispose()
  })

  it('getMetrics returns ascent, descent, leading', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    const metrics = font.getMetrics()
    expect(metrics.ascent).toBeLessThan(0) // negative = above baseline
    expect(metrics.descent).toBeGreaterThan(0)
    expect(typeof metrics.leading).toBe('number')
    font.dispose()
  })

  it('getSize returns current size', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    expect(font.getSize()).toBeCloseTo(16, 1)
    font.setSize(24)
    expect(font.getSize()).toBeCloseTo(24, 1)
    font.dispose()
  })

  it('getGlyphIDs returns glyph IDs', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    const glyphs = font.getGlyphIDs('abc')
    expect(glyphs.length).toBeGreaterThanOrEqual(3)
    font.dispose()
  })

  it('getGlyphWidths returns widths', () => {
    const font = SkiaFont.fromData(skia, fontData, 16)
    const glyphs = font.getGlyphIDs('abc')
    const widths = font.getGlyphWidths(glyphs)
    expect(widths.length).toBe(glyphs.length)
    for (let i = 0; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(0)
    }
    font.dispose()
  })
})
