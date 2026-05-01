import { describe, it, expect } from 'vitest'
import {
  bakedSiblingURL,
  hashDescriptor,
  readPngTextChunk,
} from './sidecar.js'

describe('bakedSiblingURL', () => {
  it('replaces the extension with the given suffix', () => {
    expect(bakedSiblingURL('/sprites/knight.png', '.normal.png')).toBe(
      '/sprites/knight.normal.png'
    )
  })

  it('preserves query strings', () => {
    expect(bakedSiblingURL('/a.png?v=2', '.normal.png')).toBe('/a.normal.png?v=2')
  })

  it('preserves fragments', () => {
    expect(bakedSiblingURL('/a.png#hash', '.normal.png')).toBe('/a.normal.png#hash')
  })

  it('handles absolute URLs', () => {
    expect(
      bakedSiblingURL('https://cdn.example.com/path/foo.png', '.normal.png')
    ).toBe('https://cdn.example.com/path/foo.normal.png')
  })
})

describe('hashDescriptor', () => {
  it('produces the same hash for equal descriptors', () => {
    const a = { regions: [{ x: 0, y: 0, w: 16, h: 16 }], strength: 1 }
    const b = { regions: [{ x: 0, y: 0, w: 16, h: 16 }], strength: 1 }
    expect(hashDescriptor(a)).toBe(hashDescriptor(b))
  })

  it('is insensitive to key order', () => {
    const a = { direction: 'south', pitch: 0.785, strength: 1 }
    const b = { strength: 1, pitch: 0.785, direction: 'south' }
    expect(hashDescriptor(a)).toBe(hashDescriptor(b))
  })

  it('differs when any value changes', () => {
    const a = { pitch: 0.785 }
    const b = { pitch: 0.786 }
    expect(hashDescriptor(a)).not.toBe(hashDescriptor(b))
  })

  it('handles nested regions deterministically', () => {
    const d1 = {
      regions: [
        { x: 0, y: 0, w: 16, h: 4, direction: 'flat' },
        { x: 0, y: 4, w: 16, h: 12, direction: 'south' },
      ],
    }
    const d2 = JSON.parse(JSON.stringify(d1))
    expect(hashDescriptor(d1)).toBe(hashDescriptor(d2))
  })

  it('returns a hex string of stable length', () => {
    const h = hashDescriptor({ anything: 1 })
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('readPngTextChunk', () => {
  it('returns null for non-PNG buffers', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer
    expect(readPngTextChunk(buf, 'flatland')).toBeNull()
  })

  it('reads a tEXt chunk by keyword', () => {
    const png = buildTinyPngWithTextChunk('flatland', '{"hash":"abc","v":1}')
    const value = readPngTextChunk(png, 'flatland')
    expect(value).toBe('{"hash":"abc","v":1}')
  })

  it('returns null for a missing keyword', () => {
    const png = buildTinyPngWithTextChunk('flatland', '{"hash":"abc","v":1}')
    expect(readPngTextChunk(png, 'someOtherKey')).toBeNull()
  })

  it('stops at IEND without crashing', () => {
    const png = buildTinyPngWithTextChunk('flatland', 'x')
    // Double-read should work since IEND terminates cleanly.
    expect(readPngTextChunk(png, 'absent')).toBeNull()
    expect(readPngTextChunk(png, 'flatland')).toBe('x')
  })
})

// ─── helpers ──────────────────────────────────────────────────────────────

function buildTinyPngWithTextChunk(keyword: string, value: string): ArrayBuffer {
  // Minimal but valid PNG: signature + IHDR + tEXt + IEND. IDAT omitted —
  // readPngTextChunk only walks chunk headers, it doesn't parse image data.
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = makeChunk(
    'IHDR',
    new Uint8Array([
      0, 0, 0, 1, // width 1
      0, 0, 0, 1, // height 1
      8, // bit depth
      6, // color type (RGBA)
      0, 0, 0, // compression, filter, interlace
    ])
  )

  const textPayload = new Uint8Array(keyword.length + 1 + value.length)
  for (let i = 0; i < keyword.length; i++) textPayload[i] = keyword.charCodeAt(i)
  textPayload[keyword.length] = 0
  for (let i = 0; i < value.length; i++) {
    textPayload[keyword.length + 1 + i] = value.charCodeAt(i)
  }
  const text = makeChunk('tEXt', textPayload)

  const iend = makeChunk('IEND', new Uint8Array(0))

  const total = sig.length + ihdr.length + text.length + iend.length
  const out = new Uint8Array(total)
  let offset = 0
  out.set(sig, offset); offset += sig.length
  out.set(ihdr, offset); offset += ihdr.length
  out.set(text, offset); offset += text.length
  out.set(iend, offset)
  return out.buffer
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i)
  chunk.set(data, 8)
  // CRC over type + data. readPngTextChunk doesn't validate CRC so we
  // can leave it zero for these tests.
  dv.setUint32(8 + data.length, 0)
  return chunk
}
