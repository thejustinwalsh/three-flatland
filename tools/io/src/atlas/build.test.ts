import { describe, expect, it } from 'vitest'
import { buildAtlasJson } from './build'

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
})
