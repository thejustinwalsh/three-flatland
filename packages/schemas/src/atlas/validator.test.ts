import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import schema from './schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

const minimalFrames = {}
const baseSize = { w: 64, h: 64 }

import { validateAtlas, formatAtlasErrors } from './validator'

describe('atlas.schema.json', () => {
  it('rejects sidecars missing meta.sources', () => {
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
})
