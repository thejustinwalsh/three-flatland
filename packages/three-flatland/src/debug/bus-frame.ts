/**
 * Binary framing for the buffer-pool bus transport.
 *
 * Every message transferred over the worker port is an `ArrayBuffer`
 * laid out as:
 *
 *   offset  size  field
 *   ------  ----  -----
 *     0      4    uint32  usedBytes (length of valid payload, ≤ buf.byteLength)
 *     4      4    uint32  type  (see `BUS_TYPE` below)
 *     8      4    uint32  tsLow   ┐ `Date.now()` split into two uint32s
 *    12      4    uint32  tsHigh  ┘ so we don't have to carry BigInts
 *    16      …    payload (type-specific TLV, see `writeDataPayload`)
 *
 * Small / large tiers share this header. Header is fixed-size so the
 * writer can go straight to offset 16 for the payload.
 *
 * Section TLVs inside a `data` payload:
 *
 *   section:
 *     4   uint32  featureId  (see `FEATURE_ID`)
 *     4   uint32  sectionBytes (length of payload that follows)
 *     …   raw payload — typed-array bytes, preceded by a per-feature
 *         header (frame number for stats, etc.). Each feature's
 *         encoder knows its own sub-format.
 *
 * Keep this file dependency-free — it's imported by both the worker
 * bundle and the main thread, and should hold no DOM / three.js refs.
 */

/** Four-byte header tag for every message type. Stable on the wire. */
export const BUS_TYPE = {
  DATA: 1,
  SUBSCRIBE: 2,
  SUBSCRIBE_ACK: 3,
  ACK: 4,
  UNSUBSCRIBE: 5,
  PING: 6,
  PROVIDER_ANNOUNCE: 7,
  PROVIDER_QUERY: 8,
  PROVIDER_GONE: 9,
  POOL_INIT: 10,
  POOL_RELEASE: 11,
} as const
export type BusType = (typeof BUS_TYPE)[keyof typeof BUS_TYPE]

/** Feature-section ids inside a `data` payload. */
export const FEATURE_ID = {
  STATS: 1,
  ENV: 2,
  REGISTRY: 3,
  BUFFERS: 4,
} as const
export type FeatureId = (typeof FEATURE_ID)[keyof typeof FEATURE_ID]

export const HEADER_BYTES = 16

/**
 * Writer wrapping a single acquired buffer. Tracks the cursor, writes
 * header + TLV sections, and finalises by patching `usedBytes` into
 * the header. Keeps zero per-write allocations — all numeric writes
 * go via a `DataView`.
 */
export class FrameWriter {
  private _view: DataView
  private _u8: Uint8Array
  private _cursor: number

  constructor(public readonly buffer: ArrayBuffer) {
    this._view = new DataView(buffer)
    this._u8 = new Uint8Array(buffer)
    this._cursor = HEADER_BYTES // reserve space for header
  }

  /** Reset for reuse (after the buffer is bounced back from the worker). */
  reset(): void {
    this._cursor = HEADER_BYTES
  }

  /** Finalise: stamp header (type, ts, usedBytes). Call after all sections are written. */
  finalise(type: BusType, ts: number): void {
    // Split `Date.now()` (up to 2^53) into two uint32s.
    const tsLow = (ts >>> 0)
    const tsHigh = Math.floor(ts / 0x100000000) >>> 0
    this._view.setUint32(0, this._cursor, true)
    this._view.setUint32(4, type, true)
    this._view.setUint32(8, tsLow, true)
    this._view.setUint32(12, tsHigh, true)
  }

  /** Bytes written so far (including header). */
  get bytesUsed(): number {
    return this._cursor
  }

  /** Bytes remaining in this buffer. */
  get bytesRemaining(): number {
    return this.buffer.byteLength - this._cursor
  }

  writeUint32(v: number): void {
    if (this._cursor + 4 > this.buffer.byteLength) throw new RangeError('FrameWriter: buffer overflow (uint32)')
    this._view.setUint32(this._cursor, v >>> 0, true)
    this._cursor += 4
  }

  writeInt32(v: number): void {
    if (this._cursor + 4 > this.buffer.byteLength) throw new RangeError('FrameWriter: buffer overflow (int32)')
    this._view.setInt32(this._cursor, v | 0, true)
    this._cursor += 4
  }

  writeFloat64(v: number): void {
    if (this._cursor + 8 > this.buffer.byteLength) throw new RangeError('FrameWriter: buffer overflow (float64)')
    this._view.setFloat64(this._cursor, v, true)
    this._cursor += 8
  }

  /** Write a short UTF-8 string preceded by a uint16 byte length. Max 65535 bytes. */
  writeString(s: string): void {
    const bytes = FRAME_TEXT_ENCODER.encode(s)
    if (bytes.byteLength > 0xFFFF) throw new RangeError('FrameWriter: string too long')
    if (this._cursor + 2 + bytes.byteLength > this.buffer.byteLength) {
      throw new RangeError('FrameWriter: buffer overflow (string)')
    }
    this._view.setUint16(this._cursor, bytes.byteLength, true)
    this._cursor += 2
    this._u8.set(bytes, this._cursor)
    this._cursor += bytes.byteLength
  }

  /** Memcpy a typed-array view's bytes into the frame. */
  writeBytes(src: ArrayBufferView): void {
    const srcU8 = new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
    if (this._cursor + srcU8.byteLength > this.buffer.byteLength) {
      throw new RangeError('FrameWriter: buffer overflow (bytes)')
    }
    this._u8.set(srcU8, this._cursor)
    this._cursor += srcU8.byteLength
  }
}

/**
 * Reader for a frame received on the worker side (or any side that
 * wants to decode). Does NOT copy — exposes `Uint8Array` / `DataView`
 * views into the buffer. Consumers of those views should copy
 * anything they want to keep, because the buffer is about to be
 * bounced back to the producer's pool and overwritten.
 */
export class FrameReader {
  private _view: DataView
  private _u8: Uint8Array
  private _cursor: number

  constructor(public readonly buffer: ArrayBuffer) {
    this._view = new DataView(buffer)
    this._u8 = new Uint8Array(buffer)
    this._cursor = HEADER_BYTES
  }

  get type(): BusType { return this._view.getUint32(4, true) as BusType }
  get usedBytes(): number { return this._view.getUint32(0, true) }
  get ts(): number {
    const lo = this._view.getUint32(8, true)
    const hi = this._view.getUint32(12, true)
    return hi * 0x100000000 + lo
  }

  readUint32(): number {
    const v = this._view.getUint32(this._cursor, true)
    this._cursor += 4
    return v
  }
  readInt32(): number {
    const v = this._view.getInt32(this._cursor, true)
    this._cursor += 4
    return v
  }
  readFloat64(): number {
    const v = this._view.getFloat64(this._cursor, true)
    this._cursor += 8
    return v
  }
  readString(): string {
    const len = this._view.getUint16(this._cursor, true)
    this._cursor += 2
    const bytes = this._u8.subarray(this._cursor, this._cursor + len)
    this._cursor += len
    return FRAME_TEXT_DECODER.decode(bytes)
  }
  /** Returns a view into the buffer — caller copies if retention needed. */
  readBytesView(length: number): Uint8Array {
    const view = this._u8.subarray(this._cursor, this._cursor + length)
    this._cursor += length
    return view
  }

  /** Bytes still available to read within `usedBytes`. */
  get bytesRemaining(): number {
    return this.usedBytes - this._cursor
  }

  /** Seek absolute position (for section-skip). */
  seek(offset: number): void {
    this._cursor = offset
  }

  get cursor(): number { return this._cursor }
}

const FRAME_TEXT_ENCODER = new TextEncoder()
const FRAME_TEXT_DECODER = new TextDecoder()
