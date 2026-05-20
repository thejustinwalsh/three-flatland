import { describe, it, expect } from 'vitest'
import { __writeRaw } from './pack'
import { unpack } from './unpack'
import { PakError, type PakMetadata } from './schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid metadata + a 4-byte BIN payload. Used as the base for mutations. */
function baseMetadata(overrides: Partial<PakMetadata> = {}): PakMetadata {
  return {
    kind: 'test.validation',
    version: 1,
    buffers: {
      data: { off: 0, len: 4, type: 'Uint8' },
    },
    ...overrides,
  }
}

const BASE_BIN = new Uint8Array(4) // 4 zero bytes — matches the one descriptor above

/** Assert that calling unpack on the given ArrayBuffer throws PakError with the expected code. */
function assertThrowsCode(buf: ArrayBuffer, expectedCode: string): void {
  try {
    unpack(buf)
    throw new Error(`Expected PakError('${expectedCode}') but unpack() did not throw`)
  } catch (e) {
    expect(e).toBeInstanceOf(PakError)
    expect((e as PakError).code).toBe(expectedCode)
  }
}

// ---------------------------------------------------------------------------
// §5 Validation matrix
// ---------------------------------------------------------------------------

describe('§5 validation matrix', () => {
  // ------------------------------------------------------------------
  // BAD_RECORD cases
  // ------------------------------------------------------------------

  it('BAD_RECORD — count*stride != len', () => {
    const bin = new Uint8Array(12)
    const meta = baseMetadata({
      buffers: {
        // stride=4, count=2 → expected len=8, actual len=12 → mismatch
        data: {
          off: 0,
          len: 12,
          type: 'Float32',
          record: { stride: 4, count: 3, fields: [{ name: 'x', type: 'Float32', offset: 0, count: 1 }] },
        },
      },
    })
    // corrupt: make count*stride != len by lying about count
    ;(meta.buffers['data'].record as any).count = 2 // 2*4=8 != 12
    assertThrowsCode(__writeRaw(meta, bin), 'BAD_RECORD')
  })

  it('BAD_RECORD — field offset + count*elemSize > stride (escapes stride)', () => {
    const bin = new Uint8Array(4)
    const meta = baseMetadata({
      buffers: {
        // Isolate the stride-escape check: a Uint8 field (elemSize 1) so every
        // offset is naturally aligned (offset % 1 === 0 always passes), and
        // count*stride (1*4) === len (4) passes — only offset + count*elemSize
        // (1 + 4 = 5 > stride 4) trips the escapes-stride check.
        data: {
          off: 0,
          len: 4,
          type: 'Uint8',
          record: {
            stride: 4,
            count: 1,
            fields: [{ name: 'x', type: 'Uint8', offset: 1, count: 4 }],
          },
        },
      },
    })
    assertThrowsCode(__writeRaw(meta, bin), 'BAD_RECORD')
  })

  it('BAD_RECORD — field offset not a multiple of element size', () => {
    const bin = new Uint8Array(8)
    const meta = baseMetadata({
      buffers: {
        // Uint16 has elemSize=2; offset=1 is not divisible by 2
        data: {
          off: 0,
          len: 8,
          type: 'Uint16',
          record: {
            stride: 8,
            count: 1,
            fields: [{ name: 'x', type: 'Uint16', offset: 1, count: 1 }],
          },
        },
      },
    })
    assertThrowsCode(__writeRaw(meta, bin), 'BAD_RECORD')
  })

  // ------------------------------------------------------------------
  // BAD_BUFFER cases
  // ------------------------------------------------------------------

  it('BAD_BUFFER — buffer off not a multiple of 4', () => {
    const bin = new Uint8Array(8)
    const meta = baseMetadata({
      buffers: {
        data: { off: 1, len: 4, type: 'Uint8' }, // off=1 not /4
      },
    })
    assertThrowsCode(__writeRaw(meta, bin), 'BAD_BUFFER')
  })

  it('BAD_BUFFER — off + len out of BIN range', () => {
    // BIN payload is only 4 bytes, but descriptor claims off=0, len=8
    const bin = new Uint8Array(4)
    const meta = baseMetadata({
      buffers: {
        data: { off: 0, len: 8, type: 'Uint8' }, // len=8 > binLen=4
      },
    })
    assertThrowsCode(__writeRaw(meta, bin), 'BAD_BUFFER')
  })

  it('BAD_BUFFER — len not a multiple of element size', () => {
    const bin = new Uint8Array(4)
    const meta = baseMetadata({
      buffers: {
        // Float32 has elemSize=4; len=3 is not divisible by 4
        data: { off: 0, len: 3, type: 'Float32' },
      },
    })
    // BIN still needs to be big enough so only the len-not-multiple check fires
    const bigBin = new Uint8Array(4)
    assertThrowsCode(__writeRaw(meta, bigBin), 'BAD_BUFFER')
  })

  it('BAD_BUFFER — both record and mime set', () => {
    const bin = new Uint8Array(4)
    const meta = baseMetadata({
      buffers: {
        data: {
          off: 0,
          len: 4,
          type: 'Uint8',
          mime: 'image/png',
          record: { stride: 4, count: 1, fields: [{ name: 'x', type: 'Uint8', offset: 0, count: 4 }] },
        },
      },
    })
    assertThrowsCode(__writeRaw(meta, bin), 'BAD_BUFFER')
  })

  // ------------------------------------------------------------------
  // BAD_METADATA cases
  // ------------------------------------------------------------------

  it('BAD_METADATA — version < 1', () => {
    const meta = baseMetadata({ version: 0 })
    assertThrowsCode(__writeRaw(meta, BASE_BIN), 'BAD_METADATA')
  })

  it('BAD_METADATA — version non-integer (float)', () => {
    const meta = baseMetadata({ version: 1.5 })
    assertThrowsCode(__writeRaw(meta, BASE_BIN), 'BAD_METADATA')
  })

  it('BAD_METADATA — missing kind', () => {
    const meta = baseMetadata()
    delete (meta as any).kind
    assertThrowsCode(__writeRaw(meta, BASE_BIN), 'BAD_METADATA')
  })

  // ------------------------------------------------------------------
  // BAD_JSON case
  // ------------------------------------------------------------------

  it('BAD_JSON — JSON chunk bytes are not valid JSON', () => {
    // Inject raw invalid JSON bytes via __writeRaw's rawJsonBytes param.
    const invalidJson = new TextEncoder().encode('{not valid json!!!')
    // metadata and binBytes don't matter — JSON parse will fail before buffer validation
    const meta = baseMetadata()
    assertThrowsCode(__writeRaw(meta, BASE_BIN, invalidJson), 'BAD_JSON')
  })
})
