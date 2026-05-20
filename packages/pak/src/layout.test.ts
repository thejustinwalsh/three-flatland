import { describe, it, expect } from 'vitest'
import { defineRecord, recordFor, f32, u32, u8, vec } from './layout'
import type { LayoutType } from './layout'
import { pack } from './pack'
import { unpack } from './unpack'
import { PakError } from './schema'

describe('defineRecord', () => {
  it('computes stride + offsets with natural alignment', () => {
    const R = defineRecord({ id: u32, flags: u8, color: vec(u8, 4) })
    expect(R.schema.stride).toBe(12) // id@0(4), flags@4(1), color@5(4); pad to max elem size 4
    const byName = Object.fromEntries(R.schema.fields.map((f) => [f.name, f]))
    expect(byName.id).toMatchObject({ offset: 0, type: 'Uint32', count: 1 })
    expect(byName.flags).toMatchObject({ offset: 4, type: 'Uint8', count: 1 })
    expect(byName.color).toMatchObject({ offset: 5, type: 'Uint8', count: 4 })
  })

  it('all-f32 record needs no padding', () => {
    const R = defineRecord({ a: f32, b: vec(f32, 4) })
    expect(R.schema.stride).toBe(20)
  })

  it('reads back through a typed cursor (offsets from file)', () => {
    const Glyph = defineRecord({ id: u32, uv: vec(f32, 2) }) // stride 12
    const buf = new ArrayBuffer(12)
    const dv = new DataView(buf)
    dv.setUint32(0, 42, true)
    dv.setFloat32(4, 1, true)
    dv.setFloat32(8, 2, true)
    const u = unpack(pack({ kind: 't', version: 1 }, { g: { data: buf, record: recordFor(Glyph, 1) } }))
    const c = u.records('g', Glyph)
    expect(c.get(0, 'id')).toBe(42)
    expect(Array.from(c.getArray(0, 'uv'))).toEqual([1, 2])
  })

  it('typed cursor reads offsets from file, not from layout', () => {
    // Build file with stride=16 on-disk (extra padding bytes), using a hand-crafted schema
    // The layout we pass has the same field names but no knowledge of the extra padding
    const Glyph = defineRecord({ id: u32, uv: vec(f32, 2) }) // stride=12 layout

    // Create on-disk data with stride=16 (4 extra padding bytes per record)
    const onDiskSchema = { stride: 16, count: 2, fields: Glyph.schema.fields }
    const buf = new ArrayBuffer(32) // 2 * 16
    const dv = new DataView(buf)
    // record 0
    dv.setUint32(0, 10, true)
    dv.setFloat32(4, 1.5, true)
    dv.setFloat32(8, 2.5, true)
    // 4 bytes padding at offset 12
    // record 1
    dv.setUint32(16, 20, true)
    dv.setFloat32(20, 3.5, true)
    dv.setFloat32(24, 4.5, true)
    // 4 bytes padding at offset 28

    const u = unpack(pack({ kind: 't', version: 1 }, { g: { data: buf, record: onDiskSchema } }))
    // Pass Glyph layout (stride=12) but file has stride=16 — cursor must use file's stride
    const c = u.records('g', Glyph)
    expect(c.count).toBe(2)
    expect(c.get(0, 'id')).toBe(10)
    expect(c.get(1, 'id')).toBe(20) // would be wrong if layout stride (12) were used
    expect(Array.from(c.getArray(1, 'uv'))).toEqual([3.5, 4.5])
  })

  it('typed cursor throws on field type mismatch', () => {
    // File has 'id' as Uint16, but layout expects Uint32
    const fileSchema = {
      stride: 4, count: 1,
      fields: [{ name: 'id', type: 'Uint16' as const, offset: 0, count: 1 }],
    }
    const buf = new ArrayBuffer(4)
    const u = unpack(pack({ kind: 't', version: 1 }, { g: { data: buf, record: fileSchema } }))
    const Glyph = defineRecord({ id: u32 })
    expect(() => u.records('g', Glyph)).toThrow(PakError)
  })

  it('typed cursor throws on missing field', () => {
    // File has no 'uv' field but layout expects it
    const fileSchema = {
      stride: 4, count: 1,
      fields: [{ name: 'id', type: 'Uint32' as const, offset: 0, count: 1 }],
    }
    const buf = new ArrayBuffer(4)
    const u = unpack(pack({ kind: 't', version: 1 }, { g: { data: buf, record: fileSchema } }))
    const Glyph = defineRecord({ id: u32, uv: vec(f32, 2) })
    expect(() => u.records('g', Glyph)).toThrow(PakError)
  })

  it('LayoutType infers scalar as number and vector as number[]', () => {
    const Glyph = defineRecord({ id: u32, uv: vec(f32, 2) })
    // This is a compile-time type check; if it fails, TypeScript will error
    type GT = LayoutType<typeof Glyph>
    const _check: GT = { id: 0, uv: [0, 0] }
    expect(_check.id).toBe(0)
    // id should be number (scalar), uv should be number[] (vector)
    const _scalar: number = _check.id
    const _vec: number[] = _check.uv
    expect(_scalar).toBe(0)
    expect(_vec).toEqual([0, 0])
  })

  it('decode returns a plain object with scalar and vector fields', () => {
    const Glyph = defineRecord({ id: u32, uv: vec(f32, 2) })
    const buf = new ArrayBuffer(12)
    const dv = new DataView(buf)
    dv.setUint32(0, 99, true)
    dv.setFloat32(4, 0.5, true)
    dv.setFloat32(8, 0.75, true)
    const u = unpack(pack({ kind: 't', version: 1 }, { g: { data: buf, record: recordFor(Glyph, 1) } }))
    const c = u.records('g', Glyph)
    const decoded = c.decode(0)
    expect(decoded.id).toBe(99)
    expect(decoded.uv).toEqual([0.5, 0.75])
  })
})
