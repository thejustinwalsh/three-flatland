import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import schema from './schema.json' with { type: 'json' }
import { validateNormalDescriptor, formatNormalDescriptorErrors } from './validator'

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validate = ajv.compile(schema as object)

describe('normal-descriptor.schema.json', () => {
  it('accepts an empty descriptor (all fields optional)', () => {
    expect(validate({})).toBe(true)
  })

  it('accepts a descriptor with only root-level defaults', () => {
    const json = {
      version: 1,
      bump: 'luminance',
      direction: 'south',
      pitch: 0.5,
      strength: 2,
      elevation: 0.5,
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts a numeric (radian) direction at the descriptor root', () => {
    expect(validate({ direction: 1.2 })).toBe(true)
  })

  it('accepts every NormalBump enum value', () => {
    for (const bump of ['alpha', 'luminance', 'red', 'green', 'blue', 'none']) {
      expect(validate({ bump })).toBe(true)
    }
  })

  it('accepts every NormalDirection string alias', () => {
    const directions = [
      'flat',
      'up',
      'north',
      'down',
      'south',
      'left',
      'west',
      'right',
      'east',
      'up-left',
      'north-west',
      'up-right',
      'north-east',
      'down-left',
      'south-west',
      'down-right',
      'south-east',
    ]
    for (const direction of directions) {
      expect(validate({ direction })).toBe(true)
    }
  })

  it('accepts a fully-populated region', () => {
    const json = {
      regions: [
        {
          x: 0,
          y: 0,
          w: 16,
          h: 16,
          bump: 'none',
          direction: 'south',
          pitch: 0.3,
          strength: -1,
          elevation: 0.5,
        },
      ],
    }
    expect(validate(json)).toBe(true)
  })

  it('accepts a minimal region (only x/y/w/h required)', () => {
    expect(validate({ regions: [{ x: 0, y: 0, w: 16, h: 16 }] })).toBe(true)
  })

  it('rejects an unknown top-level property', () => {
    expect(validate({ regionz: [] })).toBe(false)
  })

  it('rejects an unknown property on a region', () => {
    expect(validate({ regions: [{ x: 0, y: 0, w: 16, h: 16, opacity: 1 }] })).toBe(false)
  })

  it('rejects a bad direction enum value', () => {
    expect(validate({ direction: 'northeast' })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0, w: 16, h: 16, direction: 'diagonal' }] })).toBe(false)
  })

  it('rejects an out-of-range elevation', () => {
    expect(validate({ elevation: 1.5 })).toBe(false)
    expect(validate({ elevation: -0.1 })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0, w: 16, h: 16, elevation: 2 }] })).toBe(false)
  })

  it('rejects negative or zero region width/height', () => {
    expect(validate({ regions: [{ x: 0, y: 0, w: -16, h: 16 }] })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0, w: 16, h: -16 }] })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0, w: 0, h: 16 }] })).toBe(false)
  })

  it('rejects negative region x/y', () => {
    expect(validate({ regions: [{ x: -1, y: 0, w: 16, h: 16 }] })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: -1, w: 16, h: 16 }] })).toBe(false)
  })

  it('rejects fractional region x/y/w/h — pixel coordinates must be integers', () => {
    // packages/normals/src/bake.ts indexes pixel buffers with these values
    // directly ((y * width + x) * 4) — a fractional coordinate would
    // silently misalign every texel read in the region.
    expect(validate({ regions: [{ x: 0.5, y: 0, w: 16, h: 16 }] })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0.5, w: 16, h: 16 }] })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0, w: 16.5, h: 16 }] })).toBe(false)
    expect(validate({ regions: [{ x: 0, y: 0, w: 16, h: 16.5 }] })).toBe(false)
  })

  it('rejects a region missing a required field', () => {
    expect(validate({ regions: [{ x: 0, y: 0, w: 16 }] })).toBe(false)
  })

  it('rejects an unknown version', () => {
    expect(validate({ version: 2 })).toBe(false)
  })

  it('accepts version 1', () => {
    expect(validate({ version: 1 })).toBe(true)
  })
})

describe('validateNormalDescriptor', () => {
  it('accepts a valid descriptor and surfaces no errors', () => {
    expect(
      validateNormalDescriptor({ direction: 'south', regions: [{ x: 0, y: 0, w: 8, h: 8 }] })
    ).toBe(true)
    expect(formatNormalDescriptorErrors()).toBe('')
  })

  it('rejects an invalid descriptor and surfaces a formatted error', () => {
    expect(validateNormalDescriptor({ regions: [{ x: 0, y: 0, w: -8, h: 8 }] })).toBe(false)
    expect(formatNormalDescriptorErrors()).toMatch(/\/regions\/0\/w/)
  })
})
