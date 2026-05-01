import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import schema from './atlas.schema.json' with { type: 'json' }

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

const minimalFrames = {}
const baseSize = { w: 64, h: 64 }

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
