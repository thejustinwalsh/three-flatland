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
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { loadImage } from '@three-flatland/io'
import { ThreeLayer } from './ThreeLayer'
import { ViewportContext, viewBoxFor, type Viewport } from './Viewport'
import { createCursorStore, type CursorStore } from './cursorStore'

export type CanvasStageProps = {
  imageUri: string | null
  background?: string
  fitMargin?: number
  /** Overlay layers rendered absolutely over the three.js canvas. */
  children?: ReactNode
  onImageReady?: (size: { w: number; h: number }) => void
  /**
   * When true, mounts a transparent capture layer above all overlay
   * children that shows a grab cursor and routes left-mouse-drag to the
   * pan handler. Disables interaction with the underlying overlays —
   * effectively a "lock to zoom + pan" mode, matching the behaviour of
   * the Move toolbar button (and Space-hold) in the Atlas tool. The
   * cursor change is immediate (no need to click first).
   */
  panMode?: boolean
  /**
   * Fires when Space is pressed/released. App uses this to swap the
   * active tool to 'move' for the duration of the hold so the toolbar
   * reflects the temporary mode change.
   */
  onSpaceHold?: (down: boolean) => void
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
 * Decoded image pixels for the loaded sprite, exposed for overlays that
 * need the full pixel buffer (auto-detect / connected-component labeling,
 * future histogram tooling). Null until the image finishes decoding or
 * when no image is loaded.
 */
const ImageDataContext = createContext<ImageData | null>(null)
export function useImageData(): ImageData | null {
  return useContext(ImageDataContext)
}

// ---------------------------------------------------------------------------
// Viewport controller
// ---------------------------------------------------------------------------

const ZOOM_MIN = 0.05
const ZOOM_MAX = 50

function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

/**
 * Clamp pan so at least 50% of the image remains visible on each axis.
 * The visible region in image-pixel units is `imageW * fitMargin / zoom`.
 * The pan range is ±half that, so the image edge can slide to the center
 * of the view but no further.
 */
function clampPan(panX: number, panY: number, vp: Viewport): [number, number] {
  const halfVisibleW = (vp.imageW * vp.fitMargin) / vp.zoom / 2
  const halfVisibleH = (vp.imageH * vp.fitMargin) / vp.zoom / 2
  const maxPanX = (vp.imageW / 2) + halfVisibleW
  const maxPanY = (vp.imageH / 2) + halfVisibleH
  return [
    Math.max(-maxPanX, Math.min(maxPanX, panX)),
    Math.max(-maxPanY, Math.min(maxPanY, panY)),
  ]
}

export type ViewportController = {
  zoom: number
  panX: number
  panY: number
  /** Zoom in by 1.25× toward the current center. */
  zoomIn(): void
  /** Zoom out by 1.25× toward the current center. */
  zoomOut(): void
  /** Reset to zoom=1, pan=(0,0) — fit-to-canvas. */
  fitToView(): void
  /** Set zoom directly (clamped to [0.05, 50]). */
  setZoom(z: number): void
  /** Set pan directly (in image-pixel units). */
  setPan(x: number, y: number): void
}

const ViewportControllerContext = createContext<ViewportController | null>(null)

/**
 * Access the viewport controller from any descendant of `<CanvasStage>`.
 * Returns null when no stage is mounted. Use this in toolbar buttons to
 * wire zoomIn / zoomOut / fitToView.
 */
export function useViewportController(): ViewportController | null {
  return useContext(ViewportControllerContext)
}

// ---------------------------------------------------------------------------
// CanvasStage
// ---------------------------------------------------------------------------

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
 *
 * Zoom + pan state is managed here and exposed via `useViewportController()`.
 * Wheel → zoom-toward-cursor; middle-mouse or space+drag → pan.
 */
export function CanvasStage({
  imageUri,
  background,
  fitMargin = 1.15,
  children,
  onImageReady,
  panMode = false,
  onSpaceHold,
}: CanvasStageProps) {
  const [baseViewport, setBaseViewport] = useState<Omit<Viewport, 'zoom' | 'panX' | 'panY'> | null>(null)
  const [imageData, setImageData] = useState<ImageData | null>(null)
  const [zoom, setZoomState] = useState(1)
  const [panX, setPanXState] = useState(0)
  const [panY, setPanYState] = useState(0)

  // Keep zoom/pan in a ref so wheel/drag handlers always see fresh values
  // without re-creating callbacks on every zoom/pan update.
  const zoomRef = useRef(zoom)
  const panXRef = useRef(panX)
  const panYRef = useRef(panY)
  zoomRef.current = zoom
  panXRef.current = panX
  panYRef.current = panY

  const anchorRef = useRef<SVGSVGElement>(null)
  const cursorStore = useMemo(() => createCursorStore(), [])
  const imageDataRef = useRef<ImageData | null>(null)
  imageDataRef.current = imageData

  // Space-key pan tracking
  const spaceDownRef = useRef(false)
  const [isSpaceDown, setIsSpaceDown] = useState(false)
  // Pan drag tracking
  const panDragRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  // Build the full Viewport from base + zoom/pan
  const viewport = useMemo<Viewport | null>(() => {
    if (!baseViewport) return null
    return { ...baseViewport, zoom, panX, panY }
  }, [baseViewport, zoom, panX, panY])

  // Helper: apply new zoom/pan from ref-based current values (for handlers)
  const applyZoom = useCallback((newZoom: number, newPanX: number, newPanY: number) => {
    const clamped = clampZoom(newZoom)
    setZoomState(clamped)
    // We need the base viewport dimensions to clamp pan — use ref-cloned inline
    // since we only pan-clamp after baseViewport is set.
    setPanXState(newPanX)
    setPanYState(newPanY)
  }, [])

  // Clamp pan against current viewport when both are available. This runs
  // after every render but is cheap (just two Math.max/min calls).
  const viewportRef = useRef<Viewport | null>(null)
  viewportRef.current = viewport

  // Apply pan clamp whenever viewport (including zoom) changes.
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const [cx, cy] = clampPan(panX, panY, vp)
    if (cx !== panX) setPanXState(cx)
    if (cy !== panY) setPanYState(cy)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]) // only re-clamp when zoom changes (pan changes trigger their own clamp below)

  const handleReady = useCallback(
    (size: { w: number; h: number }) => {
      setBaseViewport({ imageW: size.w, imageH: size.h, fitMargin })
      onImageReady?.(size)
    },
    [onImageReady, fitMargin],
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

  // -------------------------------------------------------------------------
  // Cursor sampling
  // -------------------------------------------------------------------------

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Don't update cursor reading while panning (image is moving under cursor)
      if (panDragRef.current) return

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

  // -------------------------------------------------------------------------
  // Zoom — wheel handler
  // -------------------------------------------------------------------------

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      const svg = anchorRef.current
      const vp = viewportRef.current
      if (!svg || !vp) return

      // Smooth continuous zoom: exp(-deltaY * k) gives ~1.1 per notch at 100px/notch
      const factor = Math.exp(-e.deltaY * 0.001)
      const oldZoom = zoomRef.current
      const newZoom = clampZoom(oldZoom * factor)

      // Find the image-pixel coord under the cursor
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const m = svg.getScreenCTM()
      if (!m) {
        applyZoom(newZoom, panXRef.current, panYRef.current)
        return
      }
      const local = pt.matrixTransform(m.inverse())
      const cursorImgX = local.x
      const cursorImgY = local.y

      // Zoom toward cursor: adjust pan so cursorImgX/Y stays fixed.
      // After zoom, the new visible region width = imageW * fitMargin / newZoom.
      // The cursor was at (cursorImgX, cursorImgY) in image-pixel space.
      // Before: center = imageW/2 + panX  →  cursor was at center + (cursor - center)
      // We need: new_center + (cursor - new_center) = cursor  (no change in image-pixel)
      // Which means: new_center = cursor - (cursor - old_center) * (oldZoom / newZoom)
      const oldCenterX = vp.imageW / 2 + panXRef.current
      const oldCenterY = vp.imageH / 2 + panYRef.current
      const newCenterX = cursorImgX - (cursorImgX - oldCenterX) * (oldZoom / newZoom)
      const newCenterY = cursorImgY - (cursorImgY - oldCenterY) * (oldZoom / newZoom)
      const newPanX = newCenterX - vp.imageW / 2
      const newPanY = newCenterY - vp.imageH / 2

      const vpForClamp: Viewport = { ...vp, zoom: newZoom }
      const [cx, cy] = clampPan(newPanX, newPanY, vpForClamp)
      applyZoom(newZoom, cx, cy)
    },
    [applyZoom],
  )

  // -------------------------------------------------------------------------
  // Pan — space key tracking
  // -------------------------------------------------------------------------

  useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isEditable(e.target)) {
        spaceDownRef.current = true
        setIsSpaceDown(true)
        onSpaceHold?.(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Always release on key-up, even if down was suppressed (input was
        // focused at down-time but blurred since). Idempotent.
        const wasDown = spaceDownRef.current
        spaceDownRef.current = false
        setIsSpaceDown(false)
        if (wasDown) onSpaceHold?.(false)
        // If a pan drag was active via space, end it
        if (panDragRef.current) {
          panDragRef.current = null
          setIsPanning(false)
          cursorStore.unfreeze()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [cursorStore, onSpaceHold])

  // -------------------------------------------------------------------------
  // Pan — pointer drag handlers
  // -------------------------------------------------------------------------

  /**
   * Converts a client-space delta to an image-pixel delta by dividing by the
   * current screen-to-SVG scale. The anchor SVG CTM gives us the scale
   * (a and d entries), which reflects the current zoom + viewport size.
   */
  const clientDeltaToImageDelta = useCallback((dx: number, dy: number): [number, number] => {
    const svg = anchorRef.current
    if (!svg) return [0, 0]
    const m = svg.getScreenCTM()
    if (!m) return [0, 0]
    // CTM maps SVG-local units to screen pixels. Its inverse maps screen pixels
    // to SVG-local (= image-pixel) coords. We only want the scale, not the
    // translation, so we apply the inverse to a delta vector (translate (0,0)→(dx,dy)).
    const inv = m.inverse()
    const origin = svg.createSVGPoint()
    origin.x = 0
    origin.y = 0
    const delta = svg.createSVGPoint()
    delta.x = dx
    delta.y = dy
    const o2 = origin.matrixTransform(inv)
    const d2 = delta.matrixTransform(inv)
    return [d2.x - o2.x, d2.y - o2.y]
  }, [])

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const isMiddle = e.button === 1
      const isSpaceDrag = spaceDownRef.current && e.button === 0
      const isPanModeDrag = panMode && e.button === 0
      if (!isMiddle && !isSpaceDrag && !isPanModeDrag) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      panDragRef.current = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: panXRef.current,
        startPanY: panYRef.current,
      }
      setIsPanning(true)
      cursorStore.freeze()
    },
    [cursorStore, panMode],
  )

  const handlePointerMoveForPan = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panDragRef.current) return
      const { startClientX, startClientY, startPanX, startPanY } = panDragRef.current
      const dx = e.clientX - startClientX
      const dy = e.clientY - startClientY
      const [imgDx, imgDy] = clientDeltaToImageDelta(dx, dy)
      // Dragging right moves the viewport right = pan decreases (image goes left)
      const newPanX = startPanX - imgDx
      const newPanY = startPanY - imgDy
      const vp = viewportRef.current
      if (!vp) return
      const [cx, cy] = clampPan(newPanX, newPanY, vp)
      setPanXState(cx)
      setPanYState(cy)
    },
    [clientDeltaToImageDelta],
  )

  const endPanDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!panDragRef.current) return
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
      panDragRef.current = null
      setIsPanning(false)
      cursorStore.unfreeze()
    },
    [cursorStore],
  )

  // -------------------------------------------------------------------------
  // ViewportController (public API)
  // -------------------------------------------------------------------------

  const controller = useMemo<ViewportController>(() => {
    const doZoomAroundCenter = (factor: number) => {
      setZoomState((prev) => {
        const next = clampZoom(prev * factor)
        // Re-clamp pan with new zoom
        const vp = viewportRef.current
        if (vp) {
          const vpNext: Viewport = { ...vp, zoom: next }
          const [cx, cy] = clampPan(panXRef.current, panYRef.current, vpNext)
          setPanXState(cx)
          setPanYState(cy)
        }
        return next
      })
    }
    return {
      get zoom() { return zoomRef.current },
      get panX() { return panXRef.current },
      get panY() { return panYRef.current },
      zoomIn() { doZoomAroundCenter(1.25) },
      zoomOut() { doZoomAroundCenter(1 / 1.25) },
      fitToView() {
        setZoomState(1)
        setPanXState(0)
        setPanYState(0)
      },
      setZoom(z: number) {
        const next = clampZoom(z)
        setZoomState(next)
        const vp = viewportRef.current
        if (vp) {
          const vpNext: Viewport = { ...vp, zoom: next }
          const [cx, cy] = clampPan(panXRef.current, panYRef.current, vpNext)
          setPanXState(cx)
          setPanYState(cy)
        }
      },
      setPan(x: number, y: number) {
        const vp = viewportRef.current
        if (vp) {
          const [cx, cy] = clampPan(x, y, vp)
          setPanXState(cx)
          setPanYState(cy)
        } else {
          setPanXState(x)
          setPanYState(y)
        }
      },
    }
  }, []) // stable — reads from refs, so deps are empty

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Wrap both pointer-move intents (cursor sampling + pan drag) in one handler
  const combinedPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      handlePointerMoveForPan(e)
      handlePointerMove(e)
    },
    [handlePointerMoveForPan, handlePointerMove],
  )

  const inPanMode = panMode || isSpaceDown
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        cursor: isPanning ? 'grabbing' : inPanMode ? 'grab' : undefined,
      }}
      onPointerMove={combinedPointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={endPanDrag}
      onPointerCancel={endPanDrag}
      onWheel={handleWheel}
    >
      <ThreeLayer
        imageUri={imageUri}
        background={background}
        fitMargin={fitMargin}
        zoom={zoom}
        panX={panX}
        panY={panY}
        onImageReady={handleReady}
      />
      {viewport ? (
        <svg
          ref={anchorRef}
          viewBox={viewBoxFor(viewport)}
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
          <ImageDataContext.Provider value={imageData}>
            <ViewportControllerContext.Provider value={controller}>
              {viewport ? children : null}
            </ViewportControllerContext.Provider>
          </ImageDataContext.Provider>
        </CursorStoreContext.Provider>
      </ViewportContext.Provider>
      {inPanMode && viewport ? (
        // Transparent capture layer above all overlays. Forces the grab/
        // grabbing cursor regardless of what's underneath, and absorbs
        // pointer events so child overlays (rect select/move, grid
        // pick, autodetect pick) can't fire while pan-mode is active.
        // Pointer events still bubble up to the wrapper div, which
        // routes left-mouse-drag through to the pan handler.
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            cursor: isPanning ? 'grabbing' : 'grab',
          }}
        />
      ) : null}
    </div>
  )
}
