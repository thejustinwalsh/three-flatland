import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  CanvasStage,
  CompareSliderOverlay,
  CompareLoadingOverlay,
  type ImageSource,
} from '@three-flatland/preview/canvas'
import { decodeImage } from '@three-flatland/image'
import type { Ktx2Loader as Ktx2LoaderType, Ktx2Capabilities } from '@three-flatland/image/loaders/ktx2'
import { useEncodeStore } from './encodeStore'

// ─── Ktx2Loader singleton ─────────────────────────────────────────────────────
//
// Lazy-imports `@three-flatland/image/loaders/ktx2` on first KTX2 file. The
// chunk + the basis_transcoder.wasm only ship if the user actually previews
// a KTX2-encoded artifact.
//
// Caps are probed via a throwaway WebGL2 context — same format-extension
// queries three's KTX2Loader.detectSupport() runs against a renderer, but
// without needing the R3F renderer instance (which is inside the Canvas's
// React tree, inaccessible from this outer hook). The probed extensions
// (BPTC / ASTC / ETC / S3TC) map 1:1 to the WebGPU device features the
// canvas's WebGPURenderer requests at init, so a format we report as
// supported here uploads cleanly downstream. Without real caps the
// transcoder falls through to RGBA32 — which is wrong:
//   1. Uncompressed RGBA in a CompressedTexture wrapper STALLS three's
//      WebGPU upload path (the renderer's tick stops firing useFrame).
//   2. The whole point of Basis/KTX2 is GPU-native compression; falling
//      to RGBA32 defeats the format choice.

function probeKtx2Caps(): Ktx2Capabilities {
  const FALLBACK: Ktx2Capabilities = {
    astcSupported: false,
    astcHDRSupported: false,
    etc1Supported: false,
    etc2Supported: false,
    dxtSupported: false,
    bptcSupported: false,
    pvrtcSupported: false,
  }
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
  // Linux/Mesa workaround mirrored from three's KTX2Loader: ETC2 + ASTC are
  // exposed by Mesa drivers but software-decompressed at upload, causing
  // main-thread stalls. Disable them so the transcoder picks BC instead.
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

let loaderPromise: Promise<Ktx2LoaderType> | null = null
let cachedLoader: Ktx2LoaderType | null = null

async function getKtx2Loader(): Promise<Ktx2LoaderType> {
  if (cachedLoader) return cachedLoader
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const { Ktx2Loader } = await import('@three-flatland/image/loaders/ktx2')
      const caps = probeKtx2Caps()
      console.log('[encode] Ktx2 GPU caps:', caps)
      const loader = new Ktx2Loader().setSupportedFormats(caps)
      cachedLoader = loader
      return loader
    })()
  }
  return loaderPromise
}

// ─── Texture helpers ──────────────────────────────────────────────────────────

function imageDataToTexture(image: ImageData): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = image.width
  c.height = image.height
  c.getContext('2d')!.putImageData(image, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

// ─── Original texture hook ────────────────────────────────────────────────────

function useOriginalTexture(image: ImageData | null): THREE.Texture | null {
  const tex = useMemo(() => (image ? imageDataToTexture(image) : null), [image])
  useEffect(() => () => { tex?.dispose() }, [tex])
  return tex
}

// ─── Encoded texture hook ─────────────────────────────────────────────────────

function useEncodedTexture(setEncodedMipCount: (count: number) => void): THREE.Texture | null {
  const encodedBytes = useEncodeStore((s) => s.encodedBytes)
  // Use encodedFormat (the format the bytes were ACTUALLY produced with),
  // NOT the doc-slice format. They diverge during in-flight re-encodes:
  // the user can flip format mid-encode, and we'd otherwise feed stale
  // bytes to the wrong decoder. See encodeStore.ts on `encodedFormat`.
  const encodedFormat = useEncodeStore((s) => s.encodedFormat)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (!encodedBytes || !encodedFormat) {
      setTex((prev) => { prev?.dispose(); return null })
      return
    }
    const reqId = ++reqIdRef.current
    let cancelled = false

    void (async () => {
      try {
        let next: THREE.Texture
        if (encodedFormat === 'ktx2') {
          const loader = await getKtx2Loader()
          const buf = encodedBytes.buffer.slice(
            encodedBytes.byteOffset,
            encodedBytes.byteOffset + encodedBytes.byteLength,
          ) as ArrayBuffer
          next = (await loader.parse(buf)) as THREE.CompressedTexture
          const compressed = next as THREE.CompressedTexture
          const mipCount = compressed.mipmaps?.length ?? 1
          const dims = compressed.mipmaps?.map((m) => `${m.width}×${m.height}`).join(', ') ?? '?'
          console.log(`[encode] KTX2 decoded: ${mipCount} mip level(s), format=${(compressed as unknown as { format?: number }).format}, dims=[${dims}]`)
          setEncodedMipCount(mipCount)
        } else {
          const image = await decodeImage(encodedBytes, encodedFormat)
          next = imageDataToTexture(image)
          setEncodedMipCount(1)
        }
        if (cancelled || reqId !== reqIdRef.current) {
          next.dispose()
          return
        }
        setTex((prev) => { prev?.dispose(); return next })
      } catch (err) {
        console.error('encoded texture decode failed', err)
      }
    })()

    return () => { cancelled = true }
  }, [encodedBytes, encodedFormat, setEncodedMipCount])

  // Dispose on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { tex?.dispose() }, [])

  return tex
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ComparePreview() {
  const sourceImage = useEncodeStore((s) => s.sourceImage)
  const splitU = useEncodeStore((s) => s.compareSplitU)
  const setCompareSplitU = useEncodeStore((s) => s.setCompareSplitU)
  const setEncodedMipCount = useEncodeStore((s) => s.setEncodedMipCount)
  const mipLevel = useEncodeStore((s) => s.mipLevel)
  const mode = useEncodeStore((s) => s.mode)
  const isEncoding = useEncodeStore((s) => s.isEncoding)
  const pixelArt = useEncodeStore((s) => s.pixelArt)
  const original = useOriginalTexture(sourceImage)
  const encoded = useEncodedTexture(setEncodedMipCount)

  // ── Inspect mode ──────────────────────────────────────────────────────────
  // The source file IS the encoded artifact — there's nothing to compare.
  // Use the encoded texture on both sides (same texture) with splitU pinned
  // to 1 so the shader always samples the compare side. This makes mipLevelB
  // control the LOD, so the mip stepper in the toolbar works for KTX2 files.
  // No <CompareSliderOverlay> is mounted — the split is invisible.
  if (mode === 'inspect') {
    if (!encoded) return <div style={{ padding: 24, opacity: 0.6 }}>loading…</div>
    const sameTexture: ImageSource = { kind: 'texture', texture: encoded }
    return (
      <CanvasStage
        imageUri={null}
        imageSource={sameTexture}
        compareImageSource={sameTexture}
        initialSplitU={1}
        mipLevelB={mipLevel}
        backgroundStyle="checker"
        pixelArt={pixelArt}
      />
    )
  }

  // ── Encode mode (existing logic) ──────────────────────────────────────────
  if (!sourceImage || !original) {
    return <div style={{ padding: 24, opacity: 0.6 }}>loading…</div>
  }

  const w = sourceImage.width
  const h = sourceImage.height

  const imageSource: ImageSource = { kind: 'texture', texture: original, width: w, height: h }
  const compareImageSource: ImageSource | null = encoded
    ? { kind: 'texture', texture: encoded, width: w, height: h }
    : null

  return (
    <CanvasStage
      imageUri={null}
      imageSource={imageSource}
      compareImageSource={compareImageSource}
      initialSplitU={splitU}
      onSplitChange={setCompareSplitU}
      mipLevelB={mipLevel}
      backgroundStyle="checker"
      compareLoading={isEncoding}
      pixelArt={pixelArt}
    >
      <CompareSliderOverlay />
      <CompareLoadingOverlay />
    </CanvasStage>
  )
}
