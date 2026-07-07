import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import schema from './schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

const minimalFrames = {}
const baseSize = { w: 64, h: 64 }

import { validateAtlas, formatAtlasErrors } from './validator'

describe('atlas.schema.json', () => {
  it('rejects sidecars missing both meta.sources and meta.image', () => {
    const json = { meta: { app: 'a', version: '1', size: baseSize, scale: '1' }, frames: minimalFrames }
    expect(validate(json)).toBe(false)
  })

  it('rejects empty meta.sources arrays', () => {
    const json = { meta: { app: 'a', version: '1', size: baseSize, scale: '1', sources: [] }, frames: minimalFrames }
    expect(validate(json)).toBe(false)
  })

  it('accepts a valid single-source sidecar', () => {
    const json = {
      meta: { app: 'a', version: '1', size: baseSize, scale: '1',
        sources: [{ format: 'png', uri: 'hero.png' }] },
      frames: minimalFrames,
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts multi-format sources', () => {
    const json = {
      meta: { app: 'a', version: '1', size: baseSize, scale: '1',
        sources: [{ format: 'webp', uri: 'hero.webp' }, { format: 'png', uri: 'hero.png' }] },
      frames: minimalFrames,
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts a raw TexturePacker JSON-Hash export with only meta.image', () => {
    // Real TexturePacker/Aseprite output — no `sources`, just the legacy
    // single-file `image` string. Must validate as-is (decision #2, #117).
    const json = {
      meta: { app: 'TexturePacker', version: '1.0', image: 'hero.png', size: baseSize, scale: '1' },
      frames: {
        hero_idle_0: {
          frame: { x: 0, y: 0, w: 32, h: 32 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
          sourceSize: { w: 32, h: 32 },
        },
      },
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts a frame with a three-flatland mesh', () => {
    const json = {
      meta: { size: baseSize, scale: '1', sources: [{ format: 'png', uri: 'hero.png' }] },
      frames: {
        hero_idle_0: {
          frame: { x: 0, y: 0, w: 32, h: 32 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
          sourceSize: { w: 32, h: 32 },
          mesh: {
            verts: [
              [-0.5, -0.5, 0, 0],
              [0.5, -0.5, 1, 0],
              [0.5, 0.5, 1, 1],
            ],
            indices: [0, 1, 2],
          },
        },
      },
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts a frame with TexturePacker vertices/verticesUV/triangles', () => {
    const json = {
      meta: { size: baseSize, scale: '1', image: 'hero.png' },
      frames: {
        hero_idle_0: {
          frame: { x: 0, y: 0, w: 32, h: 32 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
          sourceSize: { w: 32, h: 32 },
          vertices: [
            [0, 0],
            [32, 0],
            [32, 32],
          ],
          verticesUV: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          triangles: [[0, 1, 2]],
        },
      },
    }
    expect(validate(json)).toBe(true)
  })
})

describe('validateAtlas (format-uniqueness layer)', () => {
  it('rejects duplicate formats in meta.sources', () => {
    const json = {
      meta: { app: 'a', version: '1', size: { w: 64, h: 64 }, scale: '1',
        sources: [{ format: 'png', uri: 'a.png' }, { format: 'png', uri: 'b.png' }] },
      frames: {},
    }
    expect(validateAtlas(json)).toBe(false)
    expect(formatAtlasErrors()).toMatch(/duplicate format/i)
  })

  it('accepts unique formats', () => {
    const json = {
      meta: { app: 'a', version: '1', size: { w: 64, h: 64 }, scale: '1',
        sources: [{ format: 'png', uri: 'a.png' }, { format: 'webp', uri: 'a.webp' }] },
      frames: {},
    }
    expect(validateAtlas(json)).toBe(true)
  })

  it('accepts a meta.image-only sidecar without a sources array to dedupe', () => {
    // Regression: the format-uniqueness pass used to assume `meta.sources`
    // always exists and would throw on an image-only atlas.
    const json = {
      meta: { app: 'a', version: '1', size: { w: 64, h: 64 }, scale: '1', image: 'a.png' },
      frames: {},
    }
    expect(validateAtlas(json)).toBe(true)
  })
})
