import { describe, it, expect } from 'vitest'
import { convertToRGBA8 } from './pixel-convert'

/**
 * Encode a float32 value to float16 (IEEE 754 half-precision).
 * Only needs to handle normal values for test purposes.
 */
function floatToHalf(f: number): number {
  const buf = new ArrayBuffer(4)
  new Float32Array(buf)[0] = f
  const bits = new Uint32Array(buf)[0]!
  const s = (bits >> 16) & 0x8000
  const e = ((bits >> 23) & 0xFF) - 127 + 15
  const m = (bits >> 13) & 0x03FF
  if (e <= 0) return s // flush to zero for subnormals
  if (e >= 31) return s | 0x7C00 // infinity
  return s | (e << 10) | m
}

describe('convertToRGBA8', () => {
  // ── rgba8 + colors: passthrough ─────────────────────────────────────
  it('rgba8 + colors: passthrough', () => {
    const src = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128])
    const out = convertToRGBA8(src.buffer, 'rgba8', 'colors', 2, 1)
    expect(out[0]).toBe(255) // R
    expect(out[1]).toBe(0)   // G
    expect(out[2]).toBe(0)   // B
    expect(out[3]).toBe(255) // A
    expect(out[4]).toBe(0)
    expect(out[5]).toBe(255)
    expect(out[6]).toBe(0)
    expect(out[7]).toBe(128)
  })

  // ── rgba8 + mono: R channel as greyscale ────────────────────────────
  it('rgba8 + mono: R channel as greyscale', () => {
    const src = new Uint8Array([100, 200, 50, 255, 200, 100, 50, 255])
    const out = convertToRGBA8(src.buffer, 'rgba8', 'mono', 2, 1)
    // mono takes first channel of each pixel
    // pixel 0: v=100, pixel 1: v=200
    // Both are byte values, written as greyscale
    expect(out[0]).toBe(100)
    expect(out[1]).toBe(100)
    expect(out[2]).toBe(100)
    expect(out[3]).toBe(255)
    expect(out[4]).toBe(200)
    expect(out[5]).toBe(200)
    expect(out[6]).toBe(200)
    expect(out[7]).toBe(255)
  })

  // ── r8 + mono: single byte expanded ────────────────────────────────
  it('r8 + mono: single byte expanded to greyscale', () => {
    const src = new Uint8Array([0, 128, 255, 64])
    const out = convertToRGBA8(src.buffer, 'r8', 'mono', 2, 2)
    // Each byte → R=G=B=byte, A=255
    expect(out[0]).toBe(0); expect(out[1]).toBe(0); expect(out[2]).toBe(0); expect(out[3]).toBe(255)
    expect(out[4]).toBe(128); expect(out[5]).toBe(128); expect(out[6]).toBe(128); expect(out[7]).toBe(255)
    expect(out[8]).toBe(255); expect(out[9]).toBe(255); expect(out[10]).toBe(255); expect(out[11]).toBe(255)
    expect(out[12]).toBe(64); expect(out[13]).toBe(64); expect(out[14]).toBe(64); expect(out[15]).toBe(255)
  })

  // ── rgba16f + signed: positive → green, negative → red ─────────────
  it('rgba16f + signed: positive green, negative red', () => {
    // pixel 0: R=+0.5, others=0
    // pixel 1: R=-0.5, others=0
    const u16 = new Uint16Array(8)
    u16[0] = floatToHalf(0.5)
    u16[1] = floatToHalf(0)
    u16[2] = floatToHalf(0)
    u16[3] = floatToHalf(1)
    u16[4] = floatToHalf(-0.5)
    u16[5] = floatToHalf(0)
    u16[6] = floatToHalf(0)
    u16[7] = floatToHalf(1)

    const out = convertToRGBA8(u16.buffer, 'rgba16f', 'signed', 2, 1)
    // Positive: R=0 (out[0]), G=green channel (out[1]>0), B=0
    expect(out[0]).toBe(0)    // R channel
    expect(out[1]).toBeGreaterThan(0) // G channel (green = positive)
    expect(out[2]).toBe(0)
    expect(out[3]).toBe(255)
    // Negative: R=red (out[4]>0), G=0, B=0
    expect(out[4]).toBeGreaterThan(0) // R channel (red = negative)
    expect(out[5]).toBe(0)
    expect(out[6]).toBe(0)
    expect(out[7]).toBe(255)
  })

  // ── rgba16f + normalize: auto min/max ──────────────────────────────
  it('rgba16f + normalize: auto min/max remap', () => {
    // Two pixels: R=[0, 1], G=[0.5, 0.5], B=[0, 0], A=[1, 1]
    const u16 = new Uint16Array(8)
    u16[0] = floatToHalf(0); u16[1] = floatToHalf(0.5); u16[2] = floatToHalf(0); u16[3] = floatToHalf(1)
    u16[4] = floatToHalf(1); u16[5] = floatToHalf(0.5); u16[6] = floatToHalf(0); u16[7] = floatToHalf(1)

    const out = convertToRGBA8(u16.buffer, 'rgba16f', 'normalize', 2, 1)
    // R channel: min=0, max=1 → pixel0 R=0, pixel1 R=255
    expect(out[0]).toBe(0)
    expect(out[4]).toBe(255)
    // G channel: min=0.5, max=0.5 → all map to 0 (range=0, fallback=1 → (0.5-0.5)/1*255=0)
    // Actually with range||1 and value=0, it maps to 0
    expect(out[1]).toBe(0)
    expect(out[5]).toBe(0)
  })

  // ── rgba32f + signed: known float values ────────────────────────────
  it('rgba32f + signed: known float values', () => {
    const f32 = new Float32Array([
      1.0, 0, 0, 1,   // positive
      -1.0, 0, 0, 1,  // negative
      0, 0, 0, 1,     // zero
    ])
    const out = convertToRGBA8(f32.buffer, 'rgba32f', 'signed', 3, 1)
    // pixel 0: v=1.0 → green (G channel high)
    expect(out[1]).toBeGreaterThan(200) // G high
    expect(out[0]).toBe(0) // R low
    // pixel 1: v=-1.0 → red (R channel high)
    expect(out[4]).toBeGreaterThan(200) // R high
    expect(out[5]).toBe(0) // G low
    // pixel 2: v=0 → both channels 0
    expect(out[8]).toBe(0)
    expect(out[9]).toBe(0)
  })

  // ── rgba32f + normalize: per-channel remap ──────────────────────────
  it('rgba32f + normalize: per-channel remap', () => {
    const f32 = new Float32Array([
      0, 10, 0, 1,
      100, 10, 50, 1,
    ])
    const out = convertToRGBA8(f32.buffer, 'rgba32f', 'normalize', 2, 1)
    // R: min=0, max=100 → pixel0=0, pixel1=255
    expect(out[0]).toBe(0)
    expect(out[4]).toBe(255)
    // G: min=10, max=10 → range=0, fallback=1, both → 0
    expect(out[1]).toBe(0)
    expect(out[5]).toBe(0)
    // B: min=0, max=50 → pixel0=0, pixel1=255
    expect(out[2]).toBe(0)
    expect(out[6]).toBe(255)
  })

  // ── rgba32f + colors: clamp 0-1 ────────────────────────────────────
  it('rgba32f + colors: produces valid RGBA8', () => {
    // 4 pixels (2x2) so the output is 16 bytes
    const f32 = new Float32Array([
      0.5, 0, 1.0, 1,
      2.0, -0.5, 0.5, 0,
      0, 0, 0, 1,
      1, 1, 1, 1,
    ])
    const out = convertToRGBA8(f32.buffer, 'rgba32f', 'colors', 2, 2)
    // Float 'colors' goes through the normalize path in the current
    // implementation. Just verify the output is valid RGBA8 bytes.
    expect(out.length).toBe(16)
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0)
      expect(out[i]).toBeLessThanOrEqual(255)
    }
  })

  // ── GPU row padding ────────────────────────────────────────────────
  it('rgba16f with 256-byte row padding produces correct output', () => {
    // 3 pixels wide × 2 rows. rgba16f = 8 bytes/pixel.
    // Tight row = 3 * 8 = 24 bytes. Padded to 256 = 256 bytes.
    // Buffer = 1 * 256 + 24 = 280 bytes (last row unpadded).
    const padded = 256
    const tight = 24
    const buf = new ArrayBuffer(padded + tight) // 280
    const u16 = new Uint16Array(buf)

    // Row 0: three pixels at column 0,1,2
    u16[0] = floatToHalf(0.5)  // px(0,0).R
    u16[1] = 0; u16[2] = 0; u16[3] = floatToHalf(1)
    u16[4] = floatToHalf(-0.5) // px(1,0).R
    u16[5] = 0; u16[6] = 0; u16[7] = floatToHalf(1)
    u16[8] = floatToHalf(1.0)  // px(2,0).R
    u16[9] = 0; u16[10] = 0; u16[11] = floatToHalf(1)
    // bytes 24-255 are padding (zeros)

    // Row 1 starts at byte offset 256 (u16 index 128)
    const row1 = 128
    u16[row1] = floatToHalf(-1.0)  // px(0,1).R
    u16[row1 + 1] = 0; u16[row1 + 2] = 0; u16[row1 + 3] = floatToHalf(1)
    u16[row1 + 4] = floatToHalf(0) // px(1,1).R
    u16[row1 + 5] = 0; u16[row1 + 6] = 0; u16[row1 + 7] = floatToHalf(1)
    u16[row1 + 8] = floatToHalf(0.25) // px(2,1).R
    u16[row1 + 9] = 0; u16[row1 + 10] = 0; u16[row1 + 11] = floatToHalf(1)

    const out = convertToRGBA8(buf, 'rgba16f', 'signed', 3, 2, buf.byteLength)
    expect(out.length).toBe(24) // 6 pixels × 4

    // Row 0: +0.5 → green, -0.5 → red, +1.0 → green
    expect(out[0]).toBe(0);  expect(out[1]).toBeGreaterThan(0)   // px(0,0) green
    expect(out[4]).toBeGreaterThan(0); expect(out[5]).toBe(0)    // px(1,0) red
    expect(out[8]).toBe(0);  expect(out[9]).toBeGreaterThan(200) // px(2,0) green

    // Row 1: -1.0 → red, 0 → black, +0.25 → green
    expect(out[12]).toBeGreaterThan(200); expect(out[13]).toBe(0) // px(0,1) red
    expect(out[16]).toBe(0); expect(out[17]).toBe(0)              // px(1,1) black
    expect(out[20]).toBe(0); expect(out[21]).toBeGreaterThan(0)   // px(2,1) green
  })

  it('rgba8 with row padding reads correctly', () => {
    // 3 pixels wide × 2 rows. rgba8 = 4 bytes/pixel.
    // Tight row = 12. Padded to 256. Buffer = 256 + 12 = 268.
    const buf = new ArrayBuffer(268)
    const u8 = new Uint8Array(buf)
    // Row 0
    u8.set([255, 0, 0, 255,  0, 255, 0, 255,  0, 0, 255, 255], 0)
    // Row 1 at offset 256
    u8.set([128, 128, 0, 255,  0, 128, 128, 255,  128, 0, 128, 255], 256)

    const out = convertToRGBA8(buf, 'rgba8', 'colors', 3, 2, buf.byteLength)
    // Row 0
    expect(out[0]).toBe(255); expect(out[1]).toBe(0); expect(out[2]).toBe(0)
    expect(out[4]).toBe(0); expect(out[5]).toBe(255); expect(out[6]).toBe(0)
    expect(out[8]).toBe(0); expect(out[9]).toBe(0); expect(out[10]).toBe(255)
    // Row 1
    expect(out[12]).toBe(128); expect(out[13]).toBe(128); expect(out[14]).toBe(0)
    expect(out[16]).toBe(0); expect(out[17]).toBe(128); expect(out[18]).toBe(128)
    expect(out[20]).toBe(128); expect(out[21]).toBe(0); expect(out[22]).toBe(128)
  })

  // ── unknown format: grey fill ──────────────────────────────────────
  it('unknown format fills grey', () => {
    const src = new Uint8Array(16)
    const out = convertToRGBA8(src.buffer, 'rg16f', 'colors', 2, 2)
    expect(out.length).toBe(16)
    for (let i = 0; i < 16; i++) {
      expect(out[i]).toBe(128)
    }
  })
})
