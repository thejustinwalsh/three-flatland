import { describe, it, expect } from 'vitest'
import { pack } from './pack'
import { unpack } from './unpack'
import { PakError } from './schema'

const glyphRecord = {
  stride: 12, count: 2,
  fields: [
    { name: 'id', type: 'Uint32' as const, offset: 0, count: 1 },
    { name: 'uv', type: 'Float32' as const, offset: 4, count: 2 },
  ],
}

function build() {
  const buf = new ArrayBuffer(24)
  const dv = new DataView(buf)
  dv.setUint32(0, 100, true); dv.setFloat32(4, 0.5, true); dv.setFloat32(8, 0.25, true)
  dv.setUint32(12, 200, true); dv.setFloat32(16, 0.1, true); dv.setFloat32(20, 0.2, true)
  return unpack(pack({ kind: 't', version: 1 }, { glyphs: { data: buf, record: glyphRecord } }))
}

describe('RecordCursor', () => {
  it('reads scalar and vector fields by name', () => {
    const c = build().records('glyphs')
    expect(c.count).toBe(2)
    expect(c.get(0, 'id')).toBe(100)
    expect(c.get(1, 'id')).toBe(200)
    const uv0 = Array.from(c.getArray(0, 'uv')) as number[]
    const uv1 = Array.from(c.getArray(1, 'uv')) as number[]
    expect(uv0).toHaveLength(2)
    expect(uv0[0]).toBeCloseTo(0.5, 5)
    expect(uv0[1]).toBeCloseTo(0.25, 5)
    expect(uv1[0]).toBeCloseTo(0.1, 5)
    expect(uv1[1]).toBeCloseTo(0.2, 5)
  })
  it('throws on arity / unknown field / out of range', () => {
    const c = build().records('glyphs')
    expect(() => c.get(0, 'uv')).toThrow(PakError)       // vector via scalar getter
    expect(() => c.getArray(0, 'id')).toThrow(PakError)  // scalar via vector getter
    expect(() => c.get(0, 'nope')).toThrow(PakError)
    expect(() => c.get(99, 'id')).toThrow(PakError)
  })
  it('records() on a buffer without a record throws', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { flat: new Uint8Array([1, 2, 3, 4]) }))
    expect(() => u.records('flat')).toThrow(PakError)
  })
})
