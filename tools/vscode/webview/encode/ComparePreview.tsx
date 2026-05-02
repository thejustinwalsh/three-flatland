import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { CanvasStage, CompareSliderOverlay, type ImageSource } from '@three-flatland/preview/canvas'
import { decodeImage } from '@three-flatland/image'
import basisTranscoderJsUrl from 'three/examples/jsm/libs/basis/basis_transcoder.js?url'
import basisTranscoderWasmUrl from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url'
import { useEncodeStore } from './encodeStore'

// Reference to ensure Vite emits the wasm asset.
void basisTranscoderWasmUrl

// ─── KTX2Loader singleton ─────────────────────────────────────────────────────
//
// Known limitation: KTX2Loader.detectSupport() requires a WebGLRenderer.
// CanvasStage's internal renderer isn't accessible outside the R3F context,
// so we spin up a throwaway renderer purely for format detection, then dispose
// it. Phase 2.1.2's own KTX2Loader fork makes the renderer dependency optional.

let loaderPromise: Promise<unknown> | null = null
let cachedLoader: unknown = null

async function getKtx2Loader(renderer: THREE.WebGLRenderer | null): Promise<unknown | null> {
  if (cachedLoader) return cachedLoader
  if (!renderer) return null
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
      const loader = new KTX2Loader()
      const transcoderDir = basisTranscoderJsUrl.replace(/\/[^/]+$/, '/')
      loader.setTranscoderPath(transcoderDir)
      loader.detectSupport(renderer)
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
  const format = useEncodeStore((s) => s.format)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (!encodedBytes || !format) {
      setTex((prev) => { prev?.dispose(); return null })
      return
    }
    const reqId = ++reqIdRef.current
    let cancelled = false

    void (async () => {
      try {
        let next: THREE.Texture
        if (format === 'ktx2') {
          // Throwaway renderer — only needed for detectSupport(); the
          // CompressedTexture produced by parse() is renderer-independent.
          const probeRenderer = new THREE.WebGLRenderer()
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const loader = await getKtx2Loader(probeRenderer) as any
            if (!loader) throw new Error('KTX2Loader unavailable')
            const buf = encodedBytes.buffer.slice(
              encodedBytes.byteOffset,
              encodedBytes.byteOffset + encodedBytes.byteLength,
            ) as ArrayBuffer
            next = await new Promise<THREE.CompressedTexture>((resolve, reject) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              loader.parse(buf, resolve, reject)
            })
            const compressed = next as THREE.CompressedTexture
            setEncodedMipCount(compressed.mipmaps?.length ?? 1)
          } finally {
            probeRenderer.dispose()
          }
        } else {
          const image = await decodeImage(encodedBytes, format)
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
  }, [encodedBytes, format, setEncodedMipCount])

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
  const original = useOriginalTexture(sourceImage)
  const encoded = useEncodedTexture(setEncodedMipCount)

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
    >
      <CompareSliderOverlay />
    </CanvasStage>
  )
}
