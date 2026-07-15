import { describe, expect, it } from 'vitest'
import { atlasToRects, buildAtlasJson } from './build'
import type { AtlasJson } from './types'

describe('buildAtlasJson', () => {
  it('emits meta.sources with a single PNG entry instead of meta.image', () => {
    const json = buildAtlasJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [],
    })
    expect(json.meta).not.toHaveProperty('image')
    expect(json.meta.sources).toEqual([{ format: 'png', uri: 'hero.png' }])
  })

  it('infers the format from the source extension', () => {
    const json = buildAtlasJson({
      image: { fileName: 'hero.webp', width: 64, height: 64 },
      rects: [],
    })
    expect(json.meta.sources).toEqual([{ format: 'webp', uri: 'hero.webp' }])
  })

  it('hardcodes rotated:false/trimmed:false/full-size sourceSize for a freshly-packed rect (no passthrough fields set)', () => {
    const json = buildAtlasJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [{ id: 'a', x: 0, y: 0, w: 32, h: 32, name: 'a' }],
    })
    expect(json.frames.a).toEqual({
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      sourceSize: { w: 32, h: 32 },
    })
  })

  it('writes through rotated/trimmed/spriteSourceSize/sourceSize/pivot/vertices when present on the rect', () => {
    const json = buildAtlasJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects: [
        {
          id: 'a',
          x: 0,
          y: 0,
          w: 30,
          h: 32,
          name: 'a',
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
          sourceSize: { w: 32, h: 34 },
          pivot: { x: 0.5, y: 0.5 },
          vertices: [[0, 0]],
          verticesUV: [[0, 0]],
          triangles: [[0, 1, 2]],
        },
      ],
    })
    expect(json.frames.a).toEqual({
      frame: { x: 0, y: 0, w: 30, h: 32 },
      rotated: true,
      trimmed: true,
      spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
      sourceSize: { w: 32, h: 34 },
      pivot: { x: 0.5, y: 0.5 },
      vertices: [[0, 0]],
      verticesUV: [[0, 0]],
      triangles: [[0, 1, 2]],
    })
  })
})

describe('atlasToRects', () => {
  it('carries rotated/trimmed/spriteSourceSize/sourceSize/pivot/vertices through instead of dropping them', () => {
    const json: AtlasJson = {
      meta: { app: 'texturepacker', size: { w: 64, h: 64 } },
      frames: {
        a: {
          frame: { x: 0, y: 0, w: 30, h: 32 },
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
          sourceSize: { w: 32, h: 34 },
          pivot: { x: 0.5, y: 0.5 },
          vertices: [[0, 0]],
          verticesUV: [[0, 0]],
          triangles: [[0, 1, 2]],
        },
      },
    }
    let id = 0
    const [rect] = atlasToRects(json, () => `id-${id++}`)
    expect(rect).toEqual({
      id: 'id-0',
      x: 0,
      y: 0,
      w: 30,
      h: 32,
      name: 'a',
      rotated: true,
      trimmed: true,
      spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
      sourceSize: { w: 32, h: 34 },
      pivot: { x: 0.5, y: 0.5 },
      vertices: [[0, 0]],
      verticesUV: [[0, 0]],
      triangles: [[0, 1, 2]],
    })
  })

  it('load -> save round trip preserves rotation/trim/sourceSize exactly when the rect is untouched', () => {
    const json: AtlasJson = {
      meta: { app: 'texturepacker', size: { w: 64, h: 64 } },
      frames: {
        a: {
          frame: { x: 5, y: 5, w: 30, h: 32 },
          rotated: true,
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 30, h: 32 },
          sourceSize: { w: 32, h: 34 },
        },
      },
    }
    const rects = atlasToRects(json, () => 'id-0')
    const rebuilt = buildAtlasJson({
      image: { fileName: 'hero.png', width: 64, height: 64 },
      rects,
    })
    expect(rebuilt.frames.a).toEqual(json.frames.a)
  })
})
