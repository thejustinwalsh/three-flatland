import { describe, it, expect } from 'vitest'
import { pack } from './pack'
import { unpack } from './unpack'
import { PakError } from './schema'

describe('unpack', () => {
  it('round-trips flat buffers zero-copy', () => {
    const a = new Float32Array([1.5, 2.5, 3.5])
    const b = new Uint16Array([10, 20])
    const u = unpack(pack({ kind: 't', version: 2, name: 'x' }, { a, b }))
    expect(u.metadata.kind).toBe('t')
    expect(u.metadata.version).toBe(2)
    expect(Array.from(u.view('a') as Float32Array)).toEqual([1.5, 2.5, 3.5])
    expect(Array.from(u.view('b') as Uint16Array)).toEqual([10, 20])
    expect(u.has('a')).toBe(true)
    expect(u.has('nope')).toBe(false)
  })

  it('returns raw bytes and constructs aligned Float32 views', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { a: new Float32Array([7]) }))
    expect(u.bytes('a').byteLength).toBe(4)
    expect(() => u.view('a')).not.toThrow() // absolute offset is 4-aligned
  })

  it('empty buffer (len 0) is valid', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { e: new Uint16Array([]) }))
    expect(u.view('e').byteLength).toBe(0)
  })

  it.each([
    ['bad magic', (b: Uint8Array) => (b[0] = 0)],
    ['bad totalLength', (b: Uint8Array) => (b[8] = (b[8]! + 1) & 0xff)],
  ])('throws PakError on %s', (_label, corrupt) => {
    const buf = pack({ kind: 't', version: 1 }, { a: new Float32Array([1]) })
    const bytes = new Uint8Array(buf)
    corrupt(bytes)
    expect(() => unpack(bytes.buffer)).toThrow(PakError)
  })

  it('throws on unknown buffer name', () => {
    const u = unpack(pack({ kind: 't', version: 1 }, { a: new Float32Array([1]) }))
    expect(() => u.view('ghost')).toThrow(PakError)
  })
})
