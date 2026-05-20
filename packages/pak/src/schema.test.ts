import { describe, it, expect } from 'vitest'
import { ELEMENT_SIZE, PakError, PAK_JSON_SCHEMA } from './schema'

describe('schema', () => {
  it('element sizes match the spec', () => {
    expect(ELEMENT_SIZE).toEqual({
      Float32: 4, Int32: 4, Uint32: 4, Uint16: 2, Int16: 2, Uint8: 1, Int8: 1,
    })
  })
  it('PakError carries a code', () => {
    const e = new PakError('BAD_MAGIC', 'nope')
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('BAD_MAGIC')
    expect(e.name).toBe('PakError')
  })
  it('PAK_JSON_SCHEMA requires kind/version/buffers', () => {
    expect(PAK_JSON_SCHEMA.required).toEqual(['kind', 'version', 'buffers'])
    expect(PAK_JSON_SCHEMA.$defs.dataType.enum).toContain('Float32')
  })
})
