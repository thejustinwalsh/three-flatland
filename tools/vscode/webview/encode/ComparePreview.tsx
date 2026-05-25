import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  CanvasStage,
  CompareSliderOverlay,
  CompareLoadingOverlay,
  type ImageSource,
} from '@three-flatland/preview/canvas'
import { decodeImage } from '@three-flatland/image'
import type { Ktx2Loader as Ktx2LoaderType } from '@three-flatland/image/loaders/ktx2'
import { useEncodeStore } from './encodeStore'
import { getKtx2Caps } from './gpuCaps'
import { extractGpuStats } from './gpuStats'

// ─── Ktx2Loader singleton ─────────────────────────────────────────────────────
//
// Lazy-imports `@three-flatland/image/loaders/ktx2` on first KTX2 file. The
// chunk + the basis_transcoder.wasm only ship if the user actually previews
// a KTX2-encoded artifact.

let loaderPromise: Promise<Ktx2LoaderType> | null = null
let cachedLoader: Ktx2LoaderType | null = null

async function getKtx2Loader(): Promise<Ktx2LoaderType> {
  if (cachedLoader) return cachedLoader
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const { Ktx2Loader } = await import('@three-flatland/image/loaders/ktx2')
      const caps = getKtx2Caps()
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

function useEncodedTexture(
  setGpuStats: (stats: import('./encodeStore').GpuStats) => void,
  sourceWidth: number,
  sourceHeight: number,
): THREE.Texture | null {
  const encodedBytes = useEncodeStore((s) => s.encodedBytes)
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
        } else {
          const image = await decodeImage(encodedBytes, encodedFormat)
          next = imageDataToTexture(image)
        }
        if (cancelled || reqId !== reqIdRef.current) {
          next.dispose()
          return
        }
        setGpuStats(extractGpuStats(next, sourceWidth, sourceHeight))
        setTex((prev) => { prev?.dispose(); return next })
      } catch (err) {
        console.error('encoded texture decode failed', err)
      }
    })()

    return () => { cancelled = true }
  }, [encodedBytes, encodedFormat, setGpuStats, sourceWidth, sourceHeight])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { tex?.dispose() }, [])

  return tex
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ComparePreview() {
  const sourceImage = useEncodeStore((s) => s.sourceImage)
  const splitU = useEncodeStore((s) => s.compareSplitU)
  const setCompareSplitU = useEncodeStore((s) => s.setCompareSplitU)
  const setGpuStats = useEncodeStore((s) => s.setGpuStats)
  const mipLevel = useEncodeStore((s) => s.mipLevel)
  const mode = useEncodeStore((s) => s.mode)
  const isEncoding = useEncodeStore((s) => s.isEncoding)
  const pixelArt = useEncodeStore((s) => s.pixelArt)
  const original = useOriginalTexture(sourceImage)
  const sw = sourceImage?.width ?? 0
  const sh = sourceImage?.height ?? 0
  const encoded = useEncodedTexture(setGpuStats, sw, sh)

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
