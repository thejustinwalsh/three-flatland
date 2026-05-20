import { describe, it, expect } from 'vitest'
import { readAsset } from './readAsset'
import { AssetError } from './errors'

// ---------------------------------------------------------------------------
// GLB builder helper (copy from glb.test.ts)
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

function align4(n: number): number {
  return (n + 3) & ~3
}

function makeGLB(json: unknown, bin?: Uint8Array): ArrayBuffer {
  const jsonStr = JSON.stringify(json)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const jsonPadded = align4(jsonBytes.byteLength)

  const jsonChunkSize = 8 + jsonPadded
  const binChunkSize = bin ? 8 + align4(bin.byteLength) : 0
  const totalLength = 12 + jsonChunkSize + binChunkSize

  const buf = new ArrayBuffer(totalLength)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  let offset = 0

  view.setUint32(offset, GLB_MAGIC, true)
  offset += 4
  view.setUint32(offset, GLB_VERSION, true)
  offset += 4
  view.setUint32(offset, totalLength, true)
  offset += 4

  view.setUint32(offset, jsonPadded, true)
  offset += 4
  view.setUint32(offset, CHUNK_JSON, true)
  offset += 4

  u8.set(jsonBytes, offset)
  for (let i = jsonBytes.byteLength; i < jsonPadded; i++) u8[offset + i] = 0x20
  offset += jsonPadded

  if (bin) {
    const binPadded = align4(bin.byteLength)
    view.setUint32(offset, binPadded, true)
    offset += 4
    view.setUint32(offset, CHUNK_BIN, true)
    offset += 4
    u8.set(bin, offset)
    for (let i = bin.byteLength; i < binPadded; i++) u8[offset + i] = 0x00
    offset += binPadded
  }

  return buf
}

// ---------------------------------------------------------------------------
// Build test fixture:
//   BIN layout (byte offsets within BIN payload):
//     [0..11]  = 3 × Float32 : [1.5, 2.5, 3.5]
//     [12..19] = 4 × Uint16  : [10, 20, 30, 40]
//
//   bufferViews:
//     0: { buffer:0, byteOffset:0,  byteLength:12 }  → Float32 data
//     1: { buffer:0, byteOffset:12, byteLength:8  }  → Uint16 data
//
//   accessors:
//     0: { bufferView:0, componentType:5126, type:'SCALAR', count:3 } → Float32Array(3)
//     1: { bufferView:1, componentType:5123, type:'VEC2',   count:2 } → Uint16Array(4)
//
//   extensions:
//     FL_demo: { hello: 'world', n: 42 }
// ---------------------------------------------------------------------------

function makeFixture(): ArrayBuffer {
  // Build BIN: 12 bytes floats + 8 bytes uint16s = 20 bytes
  const bin = new ArrayBuffer(20)
  const f32 = new Float32Array(bin, 0, 3)
  f32[0] = 1.5
  f32[1] = 2.5
  f32[2] = 3.5
  const u16 = new Uint16Array(bin, 12, 4)
  u16[0] = 10
  u16[1] = 20
  u16[2] = 30
  u16[3] = 40

  const json = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 20 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12 },
      { buffer: 0, byteOffset: 12, byteLength: 8 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, type: 'SCALAR', count: 3 },
      { bufferView: 1, componentType: 5123, type: 'VEC2', count: 2 },
    ],
    extensions: {
      FL_demo: { hello: 'world', n: 42 },
    },
  }

  return makeGLB(json, new Uint8Array(bin))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readAsset', () => {
  it('accessor(0) returns a zero-copy Float32Array with correct values', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)
    const view = asset.accessor(0)

    expect(view).toBeInstanceOf(Float32Array)
    const f32 = view as Float32Array
    expect(f32.length).toBe(3)
    expect(f32[0]).toBe(1.5)
    expect(f32[1]).toBe(2.5)
    expect(f32[2]).toBe(3.5)

    // zero-copy: same underlying ArrayBuffer
    expect(f32.buffer).toBe(buf)
  })

  it('accessor(1) returns a zero-copy Uint16Array for USHORT VEC2 with correct values', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)
    const view = asset.accessor(1)

    expect(view).toBeInstanceOf(Uint16Array)
    const u16 = view as Uint16Array
    // count=2, VEC2 → 2×2 = 4 elements
    expect(u16.length).toBe(4)
    expect(u16[0]).toBe(10)
    expect(u16[1]).toBe(20)
    expect(u16[2]).toBe(30)
    expect(u16[3]).toBe(40)

    // zero-copy
    expect(u16.buffer).toBe(buf)
  })

  it('bufferView(0) returns a zero-copy Uint8Array of the right byte length', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)
    const bv = asset.bufferView(0)

    expect(bv).toBeInstanceOf(Uint8Array)
    expect(bv.byteLength).toBe(12)
    expect(bv.buffer).toBe(buf)
  })

  it('bufferView(1) returns a zero-copy Uint8Array of the right byte length', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)
    const bv = asset.bufferView(1)

    expect(bv).toBeInstanceOf(Uint8Array)
    expect(bv.byteLength).toBe(8)
    expect(bv.buffer).toBe(buf)
  })

  it('ext() returns the extension object by name', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)

    expect(asset.ext('FL_demo')).toEqual({ hello: 'world', n: 42 })
  })

  it('ext() returns undefined for unknown extension names', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)

    expect(asset.ext('nope')).toBeUndefined()
  })

  it('accessor() throws BAD_ACCESS for out-of-range index', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)

    expect(() => asset.accessor(99)).toThrow(AssetError)
    expect(() => asset.accessor(99)).toThrow(/BAD_ACCESS|out of range/i)
  })

  it('bufferView() throws BAD_ACCESS for out-of-range index', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)

    expect(() => asset.bufferView(99)).toThrow(AssetError)
    expect(() => asset.bufferView(99)).toThrow(/BAD_ACCESS|out of range/i)
  })

  it('accessor() throws BAD_ACCESS for unknown componentType', () => {
    const bin = new Uint8Array(4)
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      accessors: [{ bufferView: 0, componentType: 9999, type: 'SCALAR', count: 1 }],
    }
    const buf = makeGLB(json, bin)
    const asset = readAsset(buf)

    expect(() => asset.accessor(0)).toThrow(AssetError)
  })

  it('accessor() throws BAD_ACCESS for unknown type string', () => {
    const bin = new Uint8Array(4)
    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      accessors: [{ bufferView: 0, componentType: 5126, type: 'INVALID', count: 1 }],
    }
    const buf = makeGLB(json, bin)
    const asset = readAsset(buf)

    expect(() => asset.accessor(0)).toThrow(AssetError)
  })

  it('accessor() handles optional byteOffset fields being absent (defaults to 0)', () => {
    // accessor and bufferView with no byteOffset fields — should still work
    const bin = new ArrayBuffer(12)
    const f32 = new Float32Array(bin)
    f32[0] = 7
    f32[1] = 8
    f32[2] = 9

    const json = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: 12 }],
      bufferViews: [{ buffer: 0, byteLength: 12 }], // no byteOffset
      accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 3 }], // no byteOffset
    }
    const buf = makeGLB(json, new Uint8Array(bin))
    const asset = readAsset(buf)
    const view = asset.accessor(0) as Float32Array

    expect(view[0]).toBe(7)
    expect(view[1]).toBe(8)
    expect(view[2]).toBe(9)
  })

  it('json is exposed on the returned asset', () => {
    const buf = makeFixture()
    const asset = readAsset(buf)

    expect(asset.json).toBeDefined()
    expect(asset.json.asset.version).toBe('2.0')
  })
})
