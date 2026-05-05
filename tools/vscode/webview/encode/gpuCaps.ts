// tools/vscode/webview/encode/gpuCaps.ts
//
// Probes the host's WebGL2 compressed-texture extensions exactly once
// per session and exposes the result. Both ComparePreview's KTX2 loader
// and the InfoPanel's host-GPU section consume this — sharing the cache
// avoids re-creating the probe canvas on every InfoPanel mount.
//
// The probe mirrors three's KTX2Loader.detectSupport() but runs against
// a throwaway WebGL2 context so we don't need a renderer instance.

import type { Ktx2Capabilities } from '@three-flatland/image/loaders/ktx2'

const FALLBACK: Ktx2Capabilities = {
  astcSupported: false,
  astcHDRSupported: false,
  etc1Supported: false,
  etc2Supported: false,
  dxtSupported: false,
  bptcSupported: false,
  pvrtcSupported: false,
}

let cached: Ktx2Capabilities | null = null

function probe(): Ktx2Capabilities {
  if (typeof document === 'undefined') return FALLBACK
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null
  if (!gl) return FALLBACK
  const has = (n: string) => !!gl.getExtension(n)
  const astcExt = gl.getExtension('WEBGL_compressed_texture_astc') as
    | { getSupportedProfiles?: () => string[] }
    | null
  const caps: Ktx2Capabilities = {
    astcSupported: !!astcExt,
    astcHDRSupported: astcExt?.getSupportedProfiles?.().includes('hdr') === true,
    etc1Supported: has('WEBGL_compressed_texture_etc1'),
    etc2Supported: has('WEBGL_compressed_texture_etc'),
    dxtSupported: has('WEBGL_compressed_texture_s3tc'),
    bptcSupported: has('EXT_texture_compression_bptc'),
    pvrtcSupported:
      has('WEBGL_compressed_texture_pvrtc') ||
      has('WEBKIT_WEBGL_compressed_texture_pvrtc'),
  }
  // Linux/Mesa workaround mirrored from three's KTX2Loader: ETC2 + ASTC
  // are exposed by Mesa drivers but software-decompressed at upload,
  // causing main-thread stalls. Disable so the transcoder picks BC.
  if (
    typeof navigator !== 'undefined' &&
    navigator.platform?.includes('Linux') &&
    navigator.userAgent?.includes('Firefox') &&
    caps.astcSupported &&
    caps.etc2Supported &&
    caps.bptcSupported &&
    caps.dxtSupported
  ) {
    caps.astcSupported = false
    caps.etc2Supported = false
  }
  return caps
}

/**
 * Return the cached probe result. Probes on first call, returns the
 * memoized result on subsequent calls. Pure / idempotent.
 */
export function getKtx2Caps(): Ktx2Capabilities {
  if (cached) return cached
  cached = probe()
  return cached
}
