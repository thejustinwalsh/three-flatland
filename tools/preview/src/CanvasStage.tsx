import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { loadImage } from '@three-flatland/io'
import { ThreeLayer } from './ThreeLayer'
import { ViewportContext, type Viewport } from './Viewport'
import { createCursorStore, type CursorStore } from './cursorStore'

export type CanvasStageProps = {
  imageUri: string | null
  background?: string
  fitMargin?: number
  /** Overlay layers rendered absolutely over the three.js canvas. */
  children?: ReactNode
  onImageReady?: (size: { w: number; h: number }) => void
}

/**
 * Cursor store for the active stage. Provided by `<CanvasStage>`, consumed
 * by `<InfoPanel>` (and any other component that wants the live cursor
 * reading). Null when no stage is mounted.
 */
const CursorStoreContext = createContext<CursorStore | null>(null)
export function useCursorStore(): CursorStore | null {
  return useContext(CursorStoreContext)
}

/**
 * Two-layer preview surface:
 *   - Bottom: three.js canvas (image + lighting + animation playback).
 *   - Top: children — typically SVG overlays for editor UI (rect draw,
 *          selection handles, labels, grid lines). Children receive the
 *          image dimensions via `useViewport()` once the texture resolves.
 *
 * Both layers occupy the same box and preserve the image aspect, so DOM
 * overlay coords map to image-pixel coords through the SVG viewBox with
 * no manual projection math.
 *
 * Also owns the cursor store: an invisible "anchor" SVG provides the CTM
 * that converts pointer-move events into image-pixel coords. Decoded
 * `ImageData` is held locally so cursor sampling can read RGBA at (x, y).
 */
export function CanvasStage({
  imageUri,
  background,
  fitMargin = 1.15,
  children,
  onImageReady,
}: CanvasStageProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const anchorRef = useRef<SVGSVGElement>(null)
  const cursorStore = useMemo(() => createCursorStore(), [])
  const imageDataRef = useRef<ImageData | null>(null)

  imageDataRef.current = imageData

  const handleReady = useCallback(
    (size: { w: number; h: number }) => {
      setViewport({ imageW: size.w, imageH: size.h })
      onImageReady?.(size)
    },
    [onImageReady],
  )

  // Decode the image once for cursor color sampling. Uses the same
  // `<Image>`-based load path as Three.js's TextureLoader (vscode-webview
  // URIs play nicely with `<img>` but `fetch()` can fail for them with
  // opaque CORS / CSP errors). Runs in parallel with the three.js
  // texture load — the canvas can render before sampling is available.
  useEffect(() => {
    if (!imageUri) {
      setImageData(null)
      return
    }
    let cancelled = false
    loadImage(imageUri)
      .then((img) => {
        if (cancelled) return
        const w = img.naturalWidth
        const h = img.naturalHeight
        const canvas = new OffscreenCanvas(w, h)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('2D context unavailable for image decode')
        ctx.drawImage(img, 0, 0)
        setImageData(ctx.getImageData(0, 0, w, h))
      })
      .catch((err) => {
        console.error('[CanvasStage] image decode failed for cursor sampling', err)
        if (!cancelled) setImageData(null)
      })
    return () => {
      cancelled = true
    }
  }, [imageUri])

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const svg = anchorRef.current
      if (!svg || !viewport) {
        cursorStore.set(null)
        return
      }
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const m = svg.getScreenCTM()
      if (!m) {
        cursorStore.set(null)
        return
      }
      const local = pt.matrixTransform(m.inverse())
      const x = Math.floor(local.x)
      const y = Math.floor(local.y)
      if (x < 0 || y < 0 || x >= viewport.imageW || y >= viewport.imageH) {
        cursorStore.set(null)
        return
      }
      const data = imageDataRef.current
      let rgba: [number, number, number, number] | null = null
      if (data) {
        const i = (y * data.width + x) * 4
        rgba = [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!, data.data[i + 3]!]
      }
      cursorStore.set({ x, y, rgba })
    },
    [cursorStore, viewport],
  )

  const handlePointerLeave = useCallback(() => {
    cursorStore.set(null)
  }, [cursorStore])

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <ThreeLayer
        imageUri={imageUri}
        background={background}
        fitMargin={fitMargin}
        onImageReady={handleReady}
      />
      {viewport ? (
        <svg
          ref={anchorRef}
          viewBox={`0 0 ${viewport.imageW} ${viewport.imageH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      ) : null}
      <ViewportContext.Provider value={viewport}>
        <CursorStoreContext.Provider value={cursorStore}>
          {viewport ? children : null}
        </CursorStoreContext.Provider>
      </ViewportContext.Provider>
    </div>
  )
}
