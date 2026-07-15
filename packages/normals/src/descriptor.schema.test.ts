// Type↔schema parity: `NormalSourceDescriptor` (descriptor.ts) is the
// authoritative TypeScript type — nothing here is generated from it. This
// suite proves the JSON Schema published at
// @three-flatland/schemas/normal-descriptor stays a faithful mirror: every
// field the hand-authored type allows must validate, and real-world
// descriptor JSON (the Dungeon_Tileset example) must validate byte-for-byte.
//
// See packages/schemas/src/normal-descriptor/ for the schema + validator
// source. That location — not packages/normals — is this repo's convention
// for schema authorship (mirrors packages/schemas/src/atlas/); the schema
// intentionally does not live alongside descriptor.ts so the browser-safe
// normals bundle never pulls in Ajv.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  validateNormalDescriptor,
  formatNormalDescriptorErrors,
} from '@three-flatland/schemas/normal-descriptor'
import type { NormalSourceDescriptor, NormalRegion } from './descriptor.js'

describe('validateNormalDescriptor — type parity with NormalSourceDescriptor', () => {
  it('accepts a descriptor populated with every root-level field', () => {
    const descriptor: NormalSourceDescriptor = {
      version: 1,
      bump: 'luminance',
      direction: 'south-west',
      pitch: 0.6,
      strength: 1.5,
      elevation: 0.25,
    }
    expect(validateNormalDescriptor(descriptor)).toBe(true)
  })

  it('accepts a region populated with every optional field', () => {
    const region: NormalRegion = {
      x: 4,
      y: 8,
      w: 16,
      h: 12,
      bump: 'red',
      direction: 1.1,
      pitch: 0.4,
      strength: -2,
      elevation: 1,
    }
    const descriptor: NormalSourceDescriptor = { regions: [region] }
    expect(validateNormalDescriptor(descriptor)).toBe(true)
  })

  it('accepts a descriptor with only the required region fields', () => {
    const region: NormalRegion = { x: 0, y: 0, w: 16, h: 16 }
    expect(validateNormalDescriptor({ regions: [region] })).toBe(true)
  })

  it('accepts an empty descriptor (every field is optional on the type)', () => {
    const descriptor: NormalSourceDescriptor = {}
    expect(validateNormalDescriptor(descriptor)).toBe(true)
  })
})

describe('validateNormalDescriptor — real-world fixture', () => {
  it('accepts the Dungeon_Tileset.normal.json example verbatim', () => {
    const fixturePath = fileURLToPath(
      new URL(
        '../../../examples/react/lighting/public/sprites/Dungeon_Tileset.normal.json',
        import.meta.url
      )
    )
    const json = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
    expect(validateNormalDescriptor(json)).toBe(true)
    expect(formatNormalDescriptorErrors()).toBe('')
  })
})

describe('validateNormalDescriptor — invalid fixtures', () => {
  it('rejects a bad direction enum value', () => {
    expect(validateNormalDescriptor({ direction: 'northeast' })).toBe(false)
  })

  it('rejects an elevation out of [0, 1]', () => {
    expect(validateNormalDescriptor({ elevation: 1.2 })).toBe(false)
  })

  it('rejects a region with negative width/height', () => {
    expect(validateNormalDescriptor({ regions: [{ x: 0, y: 0, w: -4, h: 4 }] })).toBe(false)
  })

  it('rejects fractional region coordinates — bake.ts indexes pixel buffers with them directly', () => {
    const region: NormalRegion = { x: 0.5, y: 0, w: 16, h: 16 }
    expect(validateNormalDescriptor({ regions: [region] })).toBe(false)
  })

  it('rejects an unknown version', () => {
    expect(validateNormalDescriptor({ version: 2 })).toBe(false)
  })
})
