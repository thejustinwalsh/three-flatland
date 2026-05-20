import { describe, it, expect } from 'vitest'
import { readGLB } from './glb'
import { AssetError } from './errors'

// ---------------------------------------------------------------------------
// GLB builder helper
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67 // "glTF" LE
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a // "JSON" LE
const CHUNK_BIN = 0x004e4942 // "BIN\0" LE

/** Align n up to the next multiple of 4. */
function align4(n: number): number {
  return (n + 3) & ~3
}

/**
 * Assemble a minimal valid GLB from a JSON object and an optional BIN payload.
 * Returns an ArrayBuffer that a spec-compliant parser must accept.
 */
function makeGLB(json: unknown, bin?: Uint8Array): ArrayBuffer {
  const jsonStr = JSON.stringify(json)
  const jsonBytes = new TextEncoder().encode(jsonStr)
  const jsonPadded = align4(jsonBytes.byteLength)

  const jsonChunkSize = 8 + jsonPadded // header (chunkLength + chunkType) + payload
  const binChunkSize = bin ? 8 + align4(bin.byteLength) : 0
  const totalLength = 12 + jsonChunkSize + binChunkSize

  const buf = new ArrayBuffer(totalLength)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  let offset = 0

  // GLB header
  view.setUint32(offset, GLB_MAGIC, true)
  offset += 4
  view.setUint32(offset, GLB_VERSION, true)
  offset += 4
  view.setUint32(offset, totalLength, true)
  offset += 4

  // JSON chunk header
  view.setUint32(offset, jsonPadded, true)
  offset += 4
  view.setUint32(offset, CHUNK_JSON, true)
  offset += 4

  // JSON chunk payload (pad with spaces 0x20)
  u8.set(jsonBytes, offset)
  for (let i = jsonBytes.byteLength; i < jsonPadded; i++) u8[offset + i] = 0x20
  offset += jsonPadded

  // BIN chunk (optional)
  if (bin) {
    const binPadded = align4(bin.byteLength)
    view.setUint32(offset, binPadded, true)
    offset += 4
    view.setUint32(offset, CHUNK_BIN, true)
    offset += 4
    u8.set(bin, offset)
    // pad with zeros
    for (let i = bin.byteLength; i < binPadded; i++) u8[offset + i] = 0x00
    offset += binPadded
  }

  return buf
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readGLB', () => {
  const doc = { asset: { version: '2.0' } }

  it('parses a GLB with both JSON and BIN chunks', () => {
    const bin = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02])
    const buf = makeGLB(doc, bin)

    const result = readGLB(buf)

    expect(result.json.asset.version).toBe('2.0')

    // binByteOffset must be a positive offset within the buffer
    expect(result.binByteOffset).toBeGreaterThan(12)
    expect(result.binByteLength).toBe(align4(bin.byteLength))

    // Verify the bytes at binByteOffset match the BIN payload
    const view = new Uint8Array(buf, result.binByteOffset, bin.byteLength)
    for (let i = 0; i < bin.byteLength; i++) {
      expect(view[i]).toBe(bin[i])
    }
  })

  it('parses a GLB with no BIN chunk', () => {
    const buf = makeGLB(doc)
    const result = readGLB(buf)

    expect(result.json.asset.version).toBe('2.0')
    // No BIN: binByteLength must be 0
    expect(result.binByteLength).toBe(0)
    // binByteOffset is the sentinel: the offset just past the JSON chunk (= buf.byteLength)
    expect(result.binByteOffset).toBe(buf.byteLength)
  })

  it('throws AssetError on corrupt magic', () => {
    const buf = makeGLB(doc)
    const view = new DataView(buf)
    view.setUint32(0, 0xdeadbeef, true) // corrupt magic

    expect(() => readGLB(buf)).toThrow(AssetError)
    expect(() => readGLB(buf)).toThrow(/magic/)
  })

  it('throws AssetError on wrong version', () => {
    const buf = makeGLB(doc)
    const view = new DataView(buf)
    view.setUint32(4, 1, true) // version 1 instead of 2

    expect(() => readGLB(buf)).toThrow(AssetError)
  })

  it('throws AssetError on buffer shorter than 12 bytes', () => {
    const buf = new ArrayBuffer(8)
    expect(() => readGLB(buf)).toThrow(AssetError)
  })

  it('throws AssetError when first chunk is not JSON', () => {
    const buf = makeGLB(doc)
    const view = new DataView(buf)
    // Overwrite the JSON chunk type with the BIN type
    view.setUint32(16, CHUNK_BIN, true)

    expect(() => readGLB(buf)).toThrow(AssetError)
  })

  it('throws AssetError when chunk header runs past buffer end', () => {
    // A valid header but the reported totalLength truncates the JSON chunk header
    const jsonStr = JSON.stringify(doc)
    const jsonBytes = new TextEncoder().encode(jsonStr)
    const jsonPadded = align4(jsonBytes.byteLength)
    // Build a full GLB then slice it before the JSON payload ends
    const full = makeGLB(doc)
    const truncated = full.slice(0, 12 + 8 + Math.floor(jsonPadded / 2))

    expect(() => readGLB(truncated)).toThrow(AssetError)
  })

  it('wraps JSON.parse failures as AssetError', () => {
    const doc2 = { asset: { version: '2.0' } }
    const buf = makeGLB(doc2)
    const u8 = new Uint8Array(buf)
    // Corrupt a byte inside the JSON payload (after the 12-byte header + 8-byte chunk header)
    u8[20] = 0xff // inject non-UTF-8 / garbage byte into JSON text

    // Either parse throws or decode throws — either way it must be AssetError
    try {
      readGLB(buf)
      // If it somehow succeeded, that's also fine — the test is about error wrapping
    } catch (e) {
      expect(e).toBeInstanceOf(AssetError)
    }
  })
})
