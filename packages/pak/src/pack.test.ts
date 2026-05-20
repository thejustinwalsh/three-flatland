import { describe, it, expect } from 'vitest'
import { pack } from './pack'

const MAGIC_LE = 0x4b504c46
const TYPE_JSON_LE = 0x4e4f534a
const TYPE_BIN_LE = 0x004e4942

describe('pack', () => {
  it('writes a valid header + JSON + BIN with little-endian magic', () => {
    const data = new Float32Array([1, 2, 3, 4])
    const buf = pack({ kind: 'test', version: 1 }, { a: data })
    const dv = new DataView(buf)
    expect(dv.getUint32(0, true)).toBe(MAGIC_LE)
    expect(dv.getUint32(4, true)).toBe(1)              // formatVersion
    expect(dv.getUint32(8, true)).toBe(buf.byteLength) // totalLength
    const jsonLen = dv.getUint32(12, true)
    expect(dv.getUint32(16, true)).toBe(TYPE_JSON_LE)
    expect(jsonLen % 4).toBe(0)
    const binHeaderOff = 20 + jsonLen
    expect(dv.getUint32(binHeaderOff + 4, true)).toBe(TYPE_BIN_LE)
  })

  it('infers type, computes off/len, lays buffers in insertion order, 4-byte aligns', () => {
    const a = new Uint16Array([1, 2, 3])           // 6 bytes -> padded to 8
    const b = new Float32Array([9])                 // 4 bytes
    const buf = pack({ kind: 't', version: 1 }, { a, b })
    const json = readJson(buf)
    expect(json.buffers.a).toMatchObject({ off: 0, len: 6, type: 'Uint16' })
    expect(json.buffers.b).toMatchObject({ off: 8, len: 4, type: 'Float32' }) // a padded 6->8
  })

  it('bare ArrayBuffer / DataView default to Uint8', () => {
    const ab = new ArrayBuffer(4)
    const dv = new DataView(new ArrayBuffer(4))
    const buf = pack({ kind: 't', version: 1 }, { raw: ab, view: dv })
    const json = readJson(buf)
    expect(json.buffers.raw.type).toBe('Uint8')
    expect(json.buffers.view.type).toBe('Uint8')
  })

  it('byte-identical across runs for the same input', () => {
    const input = { a: new Float32Array([1, 2]), b: new Uint8Array([7, 8, 9]) }
    const x = pack({ kind: 't', version: 1 }, { ...input })
    const y = pack({ kind: 't', version: 1 }, { ...input })
    expect(new Uint8Array(x)).toEqual(new Uint8Array(y))
  })

  it('throws when a buffer sets both record and mime', () => {
    expect(() =>
      pack({ kind: 't', version: 1 }, {
        bad: { data: new Uint8Array(4), mime: 'image/png',
          record: { stride: 4, count: 1, fields: [{ name: 'x', type: 'Uint8', offset: 0, count: 4 }] } },
      }),
    ).toThrow(/record.*mime|mime.*record/i)
  })

  it('throws when required metadata is missing', () => {
    // @ts-expect-error missing version
    expect(() => pack({ kind: 't' }, { a: new Uint8Array(4) })).toThrow()
  })

  it('throws for invalid metadata.kind and metadata.version', () => {
    // @ts-expect-error missing kind
    expect(() => pack({ version: 1 }, { a: new Uint8Array(4) })).toThrow()
    expect(() => pack({ kind: '', version: 1 }, { a: new Uint8Array(4) })).toThrow()
    expect(() => pack({ kind: 't', version: 0 }, { a: new Uint8Array(4) })).toThrow()
    expect(() => pack({ kind: 't', version: 1.5 }, { a: new Uint8Array(4) })).toThrow()
  })

  it('handles zero-length buffers: 0 len, next buffer shares the same off', () => {
    const buf = pack({ kind: 't', version: 1 }, { e: new Uint16Array([]), b: new Uint8Array([1]) })
    const json = readJson(buf)
    expect(json.buffers.e).toMatchObject({ off: 0, len: 0 })
    expect(json.buffers.b.off).toBe(0)
  })

  it('non-ASCII metadata name round-trips and BIN header stays 4-aligned', () => {
    const buf = pack({ kind: 't', version: 1, name: 'café' }, { a: new Uint8Array(4) })
    const dv = new DataView(buf)
    const jsonLen = dv.getUint32(12, true)
    expect(jsonLen % 4).toBe(0)
    expect(dv.getUint32(20 + jsonLen + 4, true)).toBe(TYPE_BIN_LE)
    const json = readJson(buf)
    expect(json.name).toBe('café')
  })
})

function readJson(buf: ArrayBuffer): any {
  const dv = new DataView(buf)
  const jsonLen = dv.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)))
}
