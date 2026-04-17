/**
 * Convert raw pixel data from any supported format + display mode to
 * RGBA8 for VP9 encoding or direct display. Runs on the bus worker
 * thread so the main thread pays zero conversion cost.
 *
 * Handles GPU row padding: WebGPU aligns `bytesPerRow` to 256 bytes,
 * so readback buffers are often larger than `width × height × bpp`.
 * The converter detects padding from the buffer size and reads with
 * the correct row stride.
 */

function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15
  const e = (h & 0x7C00) >> 10
  const f = h & 0x03FF
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024)
  if (e === 31) return f ? NaN : (s ? -Infinity : Infinity)
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024)
}

function bytesPerPixel(pixelType: string): number {
  switch (pixelType) {
    case 'r8': return 1
    case 'rgba8': return 4
    case 'rgba16f': return 8
    case 'rgba32f': return 16
    default: return 4
  }
}

function channels(pixelType: string): number {
  return pixelType === 'r8' ? 1 : 4
}

/**
 * Convert raw pixels to RGBA8. Handles all pixelType + display
 * combinations and GPU row padding. The output is always
 * `width × height × 4` bytes, suitable for `new VideoFrame(out,
 * { format: 'RGBA', ... })` or direct `putImageData`.
 */
export function convertToRGBA8(
  src: ArrayBuffer,
  pixelType: string,
  display: string,
  width: number,
  height: number,
  dataByteLength?: number,
): Uint8Array {
  const count = width * height
  const out = new Uint8Array(count * 4)
  const bpp = bytesPerPixel(pixelType)
  const ch = channels(pixelType)
  const tightRowBytes = width * bpp

  // Detect GPU row padding: WebGPU aligns bytesPerRow to 256 bytes,
  // so readback buffers may be larger than width × height × bpp.
  // Use the actual pixel data byte length (not the pool buffer size)
  // to detect and compute the padded row stride.
  const actualBytes = dataByteLength ?? src.byteLength
  const tightTotal = tightRowBytes * height
  let rowBytes = tightRowBytes
  if (actualBytes > tightTotal && height > 1) {
    rowBytes = (actualBytes - tightRowBytes) / (height - 1)
  }

  const hasPadding = rowBytes !== tightRowBytes

  if (pixelType === 'rgba8') {
    const u8 = new Uint8Array(src)
    if (hasPadding) {
      const tight = stripPadding(u8, width, height, rowBytes, bpp)
      applyDisplayU8(tight, out, count, ch, display)
    } else {
      applyDisplayU8(u8, out, count, ch, display)
    }
    return out
  }

  if (pixelType === 'r8') {
    const u8 = new Uint8Array(src)
    if (hasPadding) {
      const tight = stripPadding(u8, width, height, rowBytes, bpp)
      applyDisplayU8(tight, out, count, ch, display)
    } else {
      applyDisplayU8(u8, out, count, ch, display)
    }
    return out
  }

  if (pixelType === 'rgba16f') {
    const u16 = new Uint16Array(src)
    const f32 = new Float32Array(count * ch)
    const srcElemsPerRow = rowBytes / 2 // Uint16 = 2 bytes
    const tightElemsPerRow = width * ch
    for (let y = 0; y < height; y++) {
      const srcOff = y * srcElemsPerRow
      const dstOff = y * tightElemsPerRow
      for (let i = 0; i < tightElemsPerRow; i++) {
        f32[dstOff + i] = halfToFloat(u16[srcOff + i]!)
      }
    }
    applyDisplayF32(f32, out, count, ch, display)
    return out
  }

  if (pixelType === 'rgba32f') {
    const f32src = new Float32Array(src)
    if (hasPadding) {
      const srcElemsPerRow = rowBytes / 4
      const tightElemsPerRow = width * ch
      const f32 = new Float32Array(count * ch)
      for (let y = 0; y < height; y++) {
        const srcOff = y * srcElemsPerRow
        const dstOff = y * tightElemsPerRow
        for (let i = 0; i < tightElemsPerRow; i++) {
          f32[dstOff + i] = f32src[srcOff + i]!
        }
      }
      applyDisplayF32(f32, out, count, ch, display)
    } else {
      applyDisplayF32(f32src, out, count, ch, display)
    }
    return out
  }

  out.fill(128)
  return out
}

function stripPadding(
  src: Uint8Array, width: number, height: number,
  paddedRowBytes: number, bpp: number,
): Uint8Array {
  const tightRow = width * bpp
  const tight = new Uint8Array(width * height * bpp)
  for (let y = 0; y < height; y++) {
    tight.set(
      src.subarray(y * paddedRowBytes, y * paddedRowBytes + tightRow),
      y * tightRow,
    )
  }
  return tight
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
  } else if (display === 'alpha' && stride >= 4) {
    for (let i = 0; i < count; i++) {
      const v = src[i * stride + 3]!
      const o = i * 4
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
    }
  } else {
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
  if (display === 'alpha' && stride >= 4) {
    for (let i = 0; i < count; i++) {
      const v = Math.round(Math.max(0, Math.min(1, src[i * stride + 3]!)) * 255)
      const o = i * 4
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255
    }
    return
  }
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
