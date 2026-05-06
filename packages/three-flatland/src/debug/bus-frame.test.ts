import { describe, it, expect } from 'vitest'
import { BUS_TYPE, FrameReader, FrameWriter, HEADER_BYTES } from './bus-frame'

describe('bus-frame', () => {
  describe('header', () => {
    it('reserves header bytes and stamps type/ts on finalise', () => {
      const buf = new ArrayBuffer(64)
      const w = new FrameWriter(buf)
      expect(w.bytesUsed).toBe(HEADER_BYTES)
      w.finalise(BUS_TYPE.PING, 1234567890)

      const r = new FrameReader(buf)
      expect(r.type).toBe(BUS_TYPE.PING)
      expect(r.ts).toBe(1234567890)
      expect(r.usedBytes).toBe(HEADER_BYTES)
    })

    it('round-trips ts values larger than 2^32 (real Date.now() range)', () => {
      const buf = new ArrayBuffer(64)
      const w = new FrameWriter(buf)
      const ts = 1_700_000_000_000 // ~Nov 2023
      w.finalise(BUS_TYPE.DATA, ts)
      const r = new FrameReader(buf)
      expect(r.ts).toBe(ts)
    })

    it('reset puts the cursor back to HEADER_BYTES', () => {
      const w = new FrameWriter(new ArrayBuffer(64))
      w.writeUint32(42)
      expect(w.bytesUsed).toBe(HEADER_BYTES + 4)
      w.reset()
      expect(w.bytesUsed).toBe(HEADER_BYTES)
    })
  })

  describe('scalar round-trip', () => {
    it('uint32 / int32 / float64 / string / bytes', () => {
      const buf = new ArrayBuffer(256)
      const w = new FrameWriter(buf)
      w.writeUint32(0xFEEDF00D)
      w.writeInt32(-12345)
      w.writeFloat64(Math.PI)
      w.writeString('hello, ✨ world')
      const sample = new Uint16Array([1, 2, 3, 4, 5])
      w.writeBytes(sample)
      w.finalise(BUS_TYPE.DATA, 42)

      const r = new FrameReader(buf)
      expect(r.readUint32()).toBe(0xFEEDF00D)
      expect(r.readInt32()).toBe(-12345)
      expect(r.readFloat64()).toBeCloseTo(Math.PI, 12)
      expect(r.readString()).toBe('hello, ✨ world')
      const view = r.readBytesView(sample.byteLength)
      // View into the same buffer; copy to compare against original.
      const u16 = new Uint16Array(view.buffer, view.byteOffset, view.byteLength / 2)
      expect(Array.from(u16)).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe('overflow', () => {
    it('throws when uint32 write would exceed buffer', () => {
      const w = new FrameWriter(new ArrayBuffer(HEADER_BYTES + 2)) // only 2 bytes after header
      expect(() => w.writeUint32(0)).toThrow(RangeError)
    })

    it('throws when bytes write would exceed buffer', () => {
      const w = new FrameWriter(new ArrayBuffer(HEADER_BYTES + 4))
      expect(() => w.writeBytes(new Uint8Array(8))).toThrow(RangeError)
    })

    it('rejects strings over 65535 bytes', () => {
      const w = new FrameWriter(new ArrayBuffer(0x20000))
      const tooLong = 'a'.repeat(0x10001)
      expect(() => w.writeString(tooLong)).toThrow(RangeError)
    })
  })

  describe('reader bounds', () => {
    it('bytesRemaining counts from cursor to usedBytes', () => {
      const buf = new ArrayBuffer(64)
      const w = new FrameWriter(buf)
      w.writeUint32(1)
      w.writeUint32(2)
      w.finalise(BUS_TYPE.DATA, 0)

      const r = new FrameReader(buf)
      expect(r.bytesRemaining).toBe(8)
      r.readUint32()
      expect(r.bytesRemaining).toBe(4)
      r.readUint32()
      expect(r.bytesRemaining).toBe(0)
    })

    it('seek lets a section reader skip ahead', () => {
      const buf = new ArrayBuffer(64)
      const w = new FrameWriter(buf)
      w.writeUint32(0xAAAA) // [16..20]
      w.writeUint32(0xBBBB) // [20..24]
      w.finalise(BUS_TYPE.DATA, 0)

      const r = new FrameReader(buf)
      r.seek(20) // skip the first uint32
      expect(r.readUint32()).toBe(0xBBBB)
    })
  })
})
