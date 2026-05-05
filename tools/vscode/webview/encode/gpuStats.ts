// tools/vscode/webview/encode/gpuStats.ts
//
// Build a GpuStats struct from a resolved THREE.Texture. Compressed
// textures (KTX2) carry per-mip Uint8Array payloads we can read
// directly; non-compressed textures (CanvasTexture for WebP/AVIF) have
// no mip data on the JS side — the renderer auto-generates mips on
// upload — so we report a single Mip 0 row at w*h*4 bytes (the RGBA8
// upload size, which IS the GPU truth before mipmap generation).

import * as THREE from 'three'
import type { GpuStats } from './encodeStore'

const FORMAT_LABELS: Record<number, string> = {
  [THREE.RGBA_BPTC_Format]: 'BC7',
  [THREE.RGB_BPTC_UNSIGNED_Format]: 'BC6H',
  [THREE.RGBA_ASTC_4x4_Format]: 'ASTC 4×4',
  [THREE.RGB_ETC1_Format]: 'ETC1',
  [THREE.RGB_ETC2_Format]: 'ETC2 RGB',
  [THREE.RGBA_ETC2_EAC_Format]: 'ETC2 RGBA',
  [THREE.RGB_S3TC_DXT1_Format]: 'BC1 (DXT1)',
  [THREE.RGBA_S3TC_DXT5_Format]: 'BC3 (DXT5)',
  [THREE.RGBA_PVRTC_4BPPV1_Format]: 'PVRTC 4bpp',
  [THREE.RGBAFormat]: 'RGBA8',
  [THREE.RGBFormat]: 'RGB8',
}

export function formatLabel(format: number | null): string {
  if (format === null) return 'RGBA8'
  return FORMAT_LABELS[format] ?? `format(${format})`
}

/**
 * Build a GpuStats from the texture three.js resolved for the encoded
 * artifact. `w` / `h` are the source dimensions — used as the fallback
 * for non-compressed textures whose mip array is empty.
 */
export function extractGpuStats(
  texture: THREE.Texture,
  w: number,
  h: number,
): GpuStats {
  const compressed = texture as THREE.CompressedTexture
  const mips = compressed.mipmaps
  if (mips && mips.length > 0) {
    const format = (compressed as unknown as { format?: number }).format ?? null
    return {
      format,
      formatLabel: formatLabel(format),
      mips: mips.map((m) => ({
        width: m.width,
        height: m.height,
        bytes: m.data?.byteLength ?? 0,
      })),
    }
  }
  // CanvasTexture path (WebP / AVIF). No CPU-side mip data; report the
  // RGBA8 upload size as a single mip row.
  return {
    format: null,
    formatLabel: 'RGBA8',
    mips: [{ width: w, height: h, bytes: w * h * 4 }],
  }
}
