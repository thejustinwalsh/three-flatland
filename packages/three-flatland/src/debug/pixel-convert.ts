/**
 * Convert raw pixel data from any supported format + display mode to
 * RGBA8 for VP9 encoding. Runs on the bus worker thread so the main
 * thread pays zero conversion cost.
 */

function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15
  const e = (h & 0x7C00) >> 10
  const f = h & 0x03FF
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024)
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity)
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024)
}

/**
 * Convert raw pixels to RGBA8. Handles all pixelType + display
 * combinations. The output is always `width × height × 4` bytes,
 * suitable for `new VideoFrame(out, { format: 'RGBA', ... })`.
 */
export function convertToRGBA8(
  src: ArrayBuffer,
  pixelType: string,
  display: string,
  width: number,
  height: number,
): Uint8Array {
  const count = width * height
  const out = new Uint8Array(count * 4)

  if (pixelType === 'rgba8') {
    const u8 = new Uint8Array(src, 0, count * 4)
    applyDisplayU8(u8, out, count, 4, display)
    return out
  }

  if (pixelType === 'r8') {
    const u8 = new Uint8Array(src, 0, count)
    applyDisplayU8(u8, out, count, 1, display)
    return out
  }

  if (pixelType === 'rgba16f') {
    const u16 = new Uint16Array(src, 0, count * 4)
    const f32 = new Float32Array(count * 4)
    for (let i = 0; i < f32.length; i++) f32[i] = halfToFloat(u16[i]!)
    applyDisplayF32(f32, out, count, 4, display)
    return out
  }

  if (pixelType === 'rgba32f') {
    const f32 = new Float32Array(src, 0, count * 4)
    applyDisplayF32(f32, out, count, 4, display)
    return out
  }

  // Unknown format — fill grey
  out.fill(128)
  return out
}

function applyDisplayU8(
  src: Uint8Array, out: Uint8Array, count: number, stride: number, display: string,
): void {
  if (display === 'mono') {
    for (let i = 0; i < count; i++) {
      const v = src[i * stride]!
      const o = i * 4
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
    }
  } else {
    // colors / normalize — direct copy for byte data
    for (let i = 0; i < count; i++) {
      const s = i * stride
      const o = i * 4
      out[o] = src[s]!
      out[o + 1] = stride >= 2 ? src[s + 1]! : 0
      out[o + 2] = stride >= 3 ? src[s + 2]! : 0
      out[o + 3] = stride >= 4 ? src[s + 3]! : 255
    }
  }
}

function applyDisplayF32(
  src: Float32Array, out: Uint8Array, count: number, stride: number, display: string,
): void {
  if (display === 'signed') {
    for (let i = 0; i < count; i++) {
      const v = src[i * stride]!
      const o = i * 4
      if (v >= 0) {
        const c = Math.min(255, v * 255)
        out[o] = 0; out[o + 1] = c; out[o + 2] = 0; out[o + 3] = 255
      } else {
        const c = Math.min(255, -v * 255)
        out[o] = c; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 255
      }
    }
  } else if (display === 'mono') {
    let mn = Infinity, mx = -Infinity
    for (let i = 0; i < count; i++) {
      const v = src[i * stride]!
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    const range = mx - mn || 1
    for (let i = 0; i < count; i++) {
      const v = Math.round(((src[i * stride]! - mn) / range) * 255)
      const o = i * 4
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
    }
  } else {
    // normalize — auto min/max per channel
    const mins = new Float32Array(stride).fill(Infinity)
    const maxs = new Float32Array(stride).fill(-Infinity)
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < stride; c++) {
        const v = src[i * stride + c]!
        if (v < mins[c]!) mins[c] = v
        if (v > maxs[c]!) maxs[c] = v
      }
    }
    for (let i = 0; i < count; i++) {
      const s = i * stride
      const o = i * 4
      for (let c = 0; c < Math.min(stride, 3); c++) {
        const range = maxs[c]! - mins[c]! || 1
        out[o + c] = Math.round(((src[s + c]! - mins[c]!) / range) * 255)
      }
      out[o + 3] = stride >= 4 ? Math.round(Math.max(0, Math.min(1, src[s + 3]!)) * 255) : 255
    }
  }
}
