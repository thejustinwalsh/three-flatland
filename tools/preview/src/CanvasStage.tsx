/// <reference path="./vite-env.d.ts" />
import {
  Suspense,
  use,
  useCallback,
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
import { createCursorStore } from './cursorStore'
import { canvasBackgroundStyle } from './canvasBackground'
// `?worker&inline` embeds the worker source in the bundle and instantiates
// it via a runtime Blob URL. Required for VSCode webviews: a normal worker
// chunk loads from the asset cdn (`https://file+.vscode-resource…`) which
// is cross-origin to the panel's `vscode-webview://` document, so a
// regular `new Worker(url)` is blocked with a SecurityError. Blob URLs are
// same-origin to the host page, so the Worker constructor accepts them.
import ImageDecoderWorker from './imageDecoderWorker?worker&inline'
import {
  CursorStoreContext,
  ImageDataContext,
  ViewportControllerContext,
  type ViewportController,
} from './CanvasContext'

// Re-export so existing root-package consumers (`@three-flatland/preview`)
// that imported these from `CanvasStage` keep working. The shell entry
// (`./index.ts`) now sources them from `./CanvasContext` directly.
export {
  useCursorStore,
  useImageData,
  useViewportController,
  type ViewportController,
} from './CanvasContext'

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
  /**
   * Background style behind the image:
   *   - 'solid': uses `background` (or transparent) — current behavior.
   *   - 'checker': theme-aware transparency-grid pattern. Useful for
   *     spotting transparent pixels in the image. Three.js layer
   *     renders transparent so the pattern shows through.
   *   - 'gradient': subtle diagonal wash between editor + widget theme
   *     colors. Quieter than checker for non-pixel atlases.
   * Defaults to 'solid'.
   */
  backgroundStyle?: 'solid' | 'checker' | 'gradient'
  /**
   * When true, paints a semi-transparent dark overlay everywhere outside
   * the image's pixel rect — making the image's edges obvious without
   * adding visible chrome to the image itself. Defaults to false.
   */
  dimOutOfBounds?: boolean
  /**
   * Fires on a left pointerdown anywhere in the canvas margin (outside
   * the image bounds and not on any overlay). Editors wire this to
   * "deselect" so clicking the surround clears selection without
   * needing a giant SVG catcher in the rect overlay. Suppressed in
   * pan mode (the pan capture absorbs everything).
   */
  onBackgroundPointerDown?: () => void
  /**
   * When true, every zoom application snaps to the nearest pixel-
   * perfect ratio (image-px : screen-px integer / unit-fraction). The
   * snap is computed against the live canvas dimensions, so it adapts
   * automatically when the panel is resized.
   */
  pixelSnapZoom?: boolean
  /**
   * Pixel-art texture filtering. Forwarded to the three.js sprite so
   * the atlas renders with nearest-neighbour scaling. Shared with the
   * PIP preview through the cached texture instance.
   */
  pixelArt?: boolean
}

// ---------------------------------------------------------------------------
// Image caches — keyed by URI, all module-scope so StrictMode re-invocations
// and remounts share the same in-flight promises rather than racing. Three
// separate caches because the consumers want different resolution
// granularity:
//
//   1. `imageCache` holds the raw `HTMLImageElement` promise. Both the size
//      and decode caches chain off this so a single network fetch + img
//      decode services everyone.
//   2. `sizeCache` resolves as soon as `<img>.onload` fires — fast path
//      for setting the canvas viewport BEFORE the GPU texture upload
//      finishes. Gating overlay rendering on this signal (instead of the
//      slower TextureLoader callback) keeps rects from popping in after
//      the sprite renders.
//   3. `decodeCache` runs the full pixel decode entirely off the main
//      thread: `createImageBitmap` (browser worker pool) → transfer the
//      bitmap into our worker → drawImage + getImageData inside the
//      worker → transfer the ImageData buffer back. Used for cursor
//      RGBA sampling + CCL auto-detect. Eager start at mount is fine
//      because the only main-thread work is the worker postMessage
//      itself (microsecond-scale).
// ---------------------------------------------------------------------------

const imageCache = new Map<string, Promise<HTMLImageElement>>()
function getImage(uri: string): Promise<HTMLImageElement> {
  let p = imageCache.get(uri)
  if (!p) {
    p = loadImage(uri)
    imageCache.set(uri, p)
  }
  return p
}

const sizeCache = new Map<string, Promise<{ w: number; h: number }>>()
function imageSize(uri: string): Promise<{ w: number; h: number }> {
  let p = sizeCache.get(uri)
  if (!p) {
    p = getImage(uri).then((img) => ({ w: img.naturalWidth, h: img.naturalHeight }))
    sizeCache.set(uri, p)
  }
  return p
}

// Decoder worker — single instance, spawned eagerly when this module is
// evaluated. The module only loads when the (lazy) canvas chunk does,
// which only happens when CanvasStage actually mounts — so spawning the
// worker at parse time has no cost outside the panel-is-open case but
// means the first decode hits a warm worker (no `new Worker` cold start
// in the critical path). Subsequent decodes multiplex over the same
// instance via the request-id + pending-promise table.
type DecodeResponse =
  | { id: number; data: ImageData }
  | { id: number; error: string }

let nextDecodeId = 1
const pendingDecodes = new Map<
  number,
  { resolve: (d: ImageData) => void; reject: (e: Error) => void }
>()

const decoderWorker = new ImageDecoderWorker()
decoderWorker.onmessage = (e: MessageEvent<DecodeResponse>) => {
  const cb = pendingDecodes.get(e.data.id)
  if (!cb) return
  pendingDecodes.delete(e.data.id)
  if ('error' in e.data) cb.reject(new Error(e.data.error))
  else cb.resolve(e.data.data)
}
decoderWorker.onerror = (e) => {
  // Worker-level error — reject all pending so we don't leak promises.
  const err = new Error(`Image decoder worker error: ${e.message}`)
  for (const cb of pendingDecodes.values()) cb.reject(err)
  pendingDecodes.clear()
}

const decodeCache = new Map<string, Promise<ImageData>>()
function decodeImage(uri: string): Promise<ImageData> {
  let p = decodeCache.get(uri)
  if (!p) {
    p = getImage(uri)
      // `createImageBitmap` decodes on the browser's internal worker
      // pool — main thread never spends time on pixel decoding here.
      .then((img) => createImageBitmap(img))
      .then(
        (bitmap) =>
          new Promise<ImageData>((resolve, reject) => {
            const id = nextDecodeId++
            pendingDecodes.set(id, { resolve, reject })
            // Transfer the bitmap into the worker (it leaves main
            // thread). The worker does drawImage + getImageData on an
            // OffscreenCanvas there and transfers the ImageData buffer
            // back, so neither side spends main-thread time on pixels.
            decoderWorker.postMessage({ id, bitmap }, [bitmap])
          }),
      )
    decodeCache.set(uri, p)
  }
  return p
}

/**
 * Suspends on the cached size probe and surfaces `{w, h}` via `onChange`
 * before the three.js TextureLoader has finished its GPU upload. This
 * lets `<CanvasStage>` set its base viewport early — overlays mount on
 * the same frame the sprite first renders rather than one frame after,
 * killing the "sprite appears, then rects pop in" sequence.
 */
function ImageSizeSink({
  uri,
  onChange,
}: {
  uri: string
  onChange: (size: { w: number; h: number }) => void
}) {
  const size = use(imageSize(uri))
  useEffect(() => {
    onChange(size)
  }, [size, onChange])
  return null
}

/**
 * Suspends on the cached decode promise for `uri` and surfaces the result
 * to the parent via `onChange`. Sits behind a `<Suspense fallback={null}>`
 * so the rest of the canvas (overlays, cursor handlers) renders immediately
 * — the decoded `ImageData` is enrichment data used for cursor RGBA
 * sampling and CCL auto-detect, not a render gate.
 */
function ImageDecodeSink({
  uri,
  onChange,
}: {
  uri: string
  onChange: (data: ImageData) => void
}) {
  const data = use(decodeImage(uri))
  useEffect(() => {
    onChange(data)
  }, [data, onChange])
  return null
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
 * Image-px : screen-px ratios that count as "pixel-perfect" — each
 * image pixel maps to an integer (or unit-fraction) screen pixel. Used
 * for the optional snap-to-perfect-zoom behaviour.
 */
const PIXEL_PERFECT_SCALES = [
  1 / 16, 1 / 12, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 2 / 3,
  1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32,
] as const

/**
 * Compute the limiting-axis screen-px:image-px ratio at a given zoom.
 * Mirrors the SVG `preserveAspectRatio="xMidYMid meet"` math: whichever
 * axis fits less tightly determines the on-screen pixel size.
 */
function scaleAtZoom(
  zoom: number,
  imageW: number,
  imageH: number,
  fitMargin: number,
  canvasW: number,
  canvasH: number,
): { scale: number; limitingByW: boolean } {
  const scaleW = (canvasW * zoom) / (imageW * fitMargin)
  const scaleH = (canvasH * zoom) / (imageH * fitMargin)
  const limitingByW = scaleW <= scaleH
  return { scale: limitingByW ? scaleW : scaleH, limitingByW }
}

/** Inverse of scaleAtZoom — given a target scale, what zoom produces it? */
function zoomForScale(
  scale: number,
  limitingByW: boolean,
  imageW: number,
  imageH: number,
  fitMargin: number,
  canvasW: number,
  canvasH: number,
): number {
  return limitingByW
    ? (scale * imageW * fitMargin) / canvasW
    : (scale * imageH * fitMargin) / canvasH
}

/**
 * Step the zoom to the NEXT pixel-perfect ratio in the given direction
 * (+1 zooms in, -1 zooms out). Used by the wheel + zoomIn/Out paths so
 * each input event reliably advances one pixel-perfect step instead of
 * snapping back to the same level.
 */
function snapZoomStep(
  currentZoom: number,
  direction: 1 | -1,
  imageW: number,
  imageH: number,
  fitMargin: number,
  canvasW: number,
  canvasH: number,
): number {
  if (canvasW <= 0 || canvasH <= 0) return currentZoom
  const { scale, limitingByW } = scaleAtZoom(currentZoom, imageW, imageH, fitMargin, canvasW, canvasH)
  if (scale <= 0) return currentZoom
  // Use a small tolerance against the current scale so a tiny float drift
  // doesn't trap us on the same step (e.g. scale = 1 + 1e-9 wouldn't
  // qualify as ">1" and we'd never advance).
  let target: number | null = null
  if (direction === 1) {
    for (const lv of PIXEL_PERFECT_SCALES) {
      if (lv > scale * 1.001) { target = lv; break }
    }
  } else {
    for (let i = PIXEL_PERFECT_SCALES.length - 1; i >= 0; i--) {
      const lv = PIXEL_PERFECT_SCALES[i]!
      if (lv < scale / 1.001) { target = lv; break }
    }
  }
  if (target == null) return currentZoom // already at limit
  return zoomForScale(target, limitingByW, imageW, imageH, fitMargin, canvasW, canvasH)
}

/**
 * Format a pixel-perfect scale as a compact ratio suffix:
 *   2 → "2×",  4 → "4×",  0.5 → "1/2×",  1/3 → "1/3×".
 * Returns null when the scale isn't close to any known level.
 */
function formatPixelRatio(scale: number): string | null {
  for (const lv of PIXEL_PERFECT_SCALES) {
    if (Math.abs(scale - lv) / lv < 0.01) {
      if (lv >= 1) return `${Math.round(lv)}×`
      const inv = 1 / lv
      return `1/${Math.round(inv)}×`
    }
  }
  return null
}

/**
 * Snap to the NEAREST pixel-perfect ratio. Used when the controller's
 * setZoom() lands on an arbitrary value — we still want it to settle
 * on a pixel-perfect step when the pref is on. Compares in log-space
 * so the choice is perceptually even.
 */
function snapZoomNearest(
  rawZoom: number,
  imageW: number,
  imageH: number,
  fitMargin: number,
  canvasW: number,
  canvasH: number,
): number {
  if (canvasW <= 0 || canvasH <= 0) return rawZoom
  const { scale, limitingByW } = scaleAtZoom(rawZoom, imageW, imageH, fitMargin, canvasW, canvasH)
  if (scale <= 0) return rawZoom
  let bestScale = scale
  let bestDist = Infinity
  for (const lv of PIXEL_PERFECT_SCALES) {
    const d = Math.abs(Math.log(lv / scale))
    if (d < bestDist) { bestDist = d; bestScale = lv }
  }
  return zoomForScale(bestScale, limitingByW, imageW, imageH, fitMargin, canvasW, canvasH)
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
  backgroundStyle = 'solid',
  dimOutOfBounds = false,
  onBackgroundPointerDown,
  pixelSnapZoom = false,
  pixelArt = false,
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

  const wrapperRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<SVGSVGElement>(null)
  // Mirrored prop so callbacks built with empty deps see fresh values.
  const pixelSnapZoomRef = useRef(pixelSnapZoom)
  pixelSnapZoomRef.current = pixelSnapZoom
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

  // Resolve a step-snap (wheel/zoomIn/Out) when pixel-snap is on,
  // otherwise return the raw target. Direction: +1 zoom in, -1 zoom out.
  const stepSnap = useCallback((current: number, direction: 1 | -1, raw: number): number => {
    if (!pixelSnapZoomRef.current) return raw
    const el = wrapperRef.current
    const vp = viewportRef.current
    if (!el || !vp) return raw
    return snapZoomStep(current, direction, vp.imageW, vp.imageH, vp.fitMargin, el.clientWidth, el.clientHeight)
  }, [])

  // Resolve a nearest-snap (direct setZoom) when pixel-snap is on.
  const nearestSnap = useCallback((raw: number): number => {
    if (!pixelSnapZoomRef.current) return raw
    const el = wrapperRef.current
    const vp = viewportRef.current
    if (!el || !vp) return raw
    return snapZoomNearest(raw, vp.imageW, vp.imageH, vp.fitMargin, el.clientWidth, el.clientHeight)
  }, [])

  // Helper: apply new zoom/pan from ref-based current values (for handlers).
  // No snap here — callers decide which snap variant (step vs nearest) is
  // appropriate before passing the target zoom in.
  const applyZoom = useCallback((newZoom: number, newPanX: number, newPanY: number) => {
    const clamped = clampZoom(newZoom)
    setZoomState(clamped)
    // We need the base viewport dimensions to clamp pan — use ref-cloned inline
    // since we only pan-clamp after baseViewport is set.
    setPanXState(newPanX)
    setPanYState(newPanY)
  }, [])

  // -------------------------------------------------------------------------
  // Pixel-snap zoom tween: scroll sets a *target* zoom (next snap step)
  // and a per-frame lerp eases toward it. Without this, fast scrolls
  // teleport the view because each notch fires its own snap and applies
  // it instantly — uncontrollable on a high-DPI trackpad. Now multiple
  // wheel events advance the target multiple steps; the tween catches
  // up so the user can stop scrolling once their visual target is set.
  // -------------------------------------------------------------------------
  const zoomTargetRef = useRef<number>(1)
  const tweenAnchorRef = useRef<
    | {
        imgX: number
        imgY: number
        baseZoom: number
        basePanX: number
        basePanY: number
      }
    | null
  >(null)
  const tweenRafRef = useRef<number | null>(null)

  const computeZoomAtAnchor = useCallback(
    (
      zoom: number,
      anchor: NonNullable<typeof tweenAnchorRef.current>,
      vp: Viewport,
    ): { panX: number; panY: number } => {
      const oldCenterX = vp.imageW / 2 + anchor.basePanX
      const oldCenterY = vp.imageH / 2 + anchor.basePanY
      const newCenterX = anchor.imgX - (anchor.imgX - oldCenterX) * (anchor.baseZoom / zoom)
      const newCenterY = anchor.imgY - (anchor.imgY - oldCenterY) * (anchor.baseZoom / zoom)
      return {
        panX: newCenterX - vp.imageW / 2,
        panY: newCenterY - vp.imageH / 2,
      }
    },
    [],
  )

  // Frame-by-frame zoom tween. Lerps current → target by 25% per frame
  // (≈4-frame settle) and re-anchors pan so the cursor coord captured at
  // wheel time stays fixed in screen space throughout the ease.
  const tickZoomTween = useCallback(() => {
    tweenRafRef.current = null
    const vp = viewportRef.current
    const anchor = tweenAnchorRef.current
    if (!vp || !anchor) return
    const target = zoomTargetRef.current
    const current = zoomRef.current
    const diff = target - current
    if (Math.abs(diff) < target * 0.005) {
      // Within 0.5% — snap and stop.
      const { panX: pX, panY: pY } = computeZoomAtAnchor(target, anchor, vp)
      const [cx, cy] = clampPan(pX, pY, { ...vp, zoom: target })
      applyZoom(target, cx, cy)
      tweenAnchorRef.current = null
      return
    }
    const next = current + diff * 0.25
    const { panX: pX, panY: pY } = computeZoomAtAnchor(next, anchor, vp)
    const [cx, cy] = clampPan(pX, pY, { ...vp, zoom: next })
    applyZoom(next, cx, cy)
    tweenRafRef.current = requestAnimationFrame(tickZoomTween)
  }, [applyZoom, computeZoomAtAnchor])

  useEffect(() => {
    return () => {
      if (tweenRafRef.current !== null) {
        cancelAnimationFrame(tweenRafRef.current)
        tweenRafRef.current = null
      }
    }
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

  // Reset stale decode result when the URI clears (file closed). Calling
  // setState during render is allowed when guarded — React bailouts the
  // re-render if the value is already null. Avoids an effect that would
  // otherwise just sync derived state on a prop change.
  if (!imageUri && imageData !== null) {
    setImageData(null)
  }

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
      const inBounds = x >= 0 && y >= 0 && x < viewport.imageW && y < viewport.imageH
      let rgba: [number, number, number, number] | null = null
      if (inBounds) {
        const data = imageDataRef.current
        if (data) {
          const i = (y * data.width + x) * 4
          rgba = [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!, data.data[i + 3]!]
        }
      }
      cursorStore.set({ x, y, inBounds, rgba })
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

      // Find the image-pixel coord under the cursor — used for both
      // the smooth and pixel-snap paths to anchor the zoom.
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const m = svg.getScreenCTM()

      const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1

      if (pixelSnapZoomRef.current) {
        // Target-and-tween model. Each wheel notch advances the
        // *target* zoom by one snap step from where it currently is
        // (which may be mid-tween). The rAF tween handles the animation
        // and pan re-anchoring. Multiple fast scrolls accumulate steps;
        // letting go of the wheel lets the tween catch up.
        const baseTarget = tweenAnchorRef.current
          ? zoomTargetRef.current
          : zoomRef.current
        const newTarget = clampZoom(
          stepSnap(baseTarget, direction, baseTarget * Math.exp(-e.deltaY * 0.001)),
        )
        zoomTargetRef.current = newTarget
        if (m) {
          const local = pt.matrixTransform(m.inverse())
          tweenAnchorRef.current = {
            imgX: local.x,
            imgY: local.y,
            baseZoom: zoomRef.current,
            basePanX: panXRef.current,
            basePanY: panYRef.current,
          }
        } else if (!tweenAnchorRef.current) {
          tweenAnchorRef.current = {
            imgX: vp.imageW / 2,
            imgY: vp.imageH / 2,
            baseZoom: zoomRef.current,
            basePanX: panXRef.current,
            basePanY: panYRef.current,
          }
        }
        if (tweenRafRef.current === null) {
          tweenRafRef.current = requestAnimationFrame(tickZoomTween)
        }
        return
      }

      // Smooth continuous zoom: exp(-deltaY * k) gives ~1.1 per notch
      // at 100px/notch. Apply instantly — no tween, the per-event
      // delta is small enough.
      const factor = Math.exp(-e.deltaY * 0.001)
      const oldZoom = zoomRef.current
      const rawNext = oldZoom * factor
      const newZoom = clampZoom(stepSnap(oldZoom, direction, rawNext))

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
    [applyZoom, stepSnap, tickZoomTween],
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
    const doStep = (direction: 1 | -1, fallbackFactor: number) => {
      setZoomState((prev) => {
        // Step-snap when pixel-perfect zoom is on; otherwise multiplicative.
        const raw = prev * fallbackFactor
        const next = clampZoom(stepSnap(prev, direction, raw))
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
      zoomIn() { doStep(1, 1.25) },
      zoomOut() { doStep(-1, 1 / 1.25) },
      fitToView() {
        setZoomState(1)
        setPanXState(0)
        setPanYState(0)
      },
      setZoom(z: number) {
        const next = clampZoom(nearestSnap(z))
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

  // 'checker' / 'gradient': wrapper paints the visible bg; let the
  // three.js layer clear with alpha so the pattern shows through.
  // 'solid': three.js owns the bg via `<color attach="background">` so
  // the canvas paints opaque. The wrapper stays transparent.
  const wrapperPaintsBg = backgroundStyle === 'checker' || backgroundStyle === 'gradient'
  const threeLayerBackground = wrapperPaintsBg ? undefined : background

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        cursor: isPanning ? 'grabbing' : inPanMode ? 'grab' : undefined,
        // Establishes a containment context so floating overlays (InfoPanel,
        // HoverFrameChip) can use `@container (max-width: …)` queries to
        // restack themselves when the canvas is narrow.
        containerType: 'inline-size',
        ...(wrapperPaintsBg
          ? canvasBackgroundStyle(backgroundStyle, 'var(--vscode-editor-background)')
          : {}),
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
        background={threeLayerBackground}
        fitMargin={fitMargin}
        zoom={zoom}
        panX={panX}
        panY={panY}
        onImageReady={handleReady}
        pixelArt={pixelArt}
      />
      {imageUri ? (
        // Size probe sets the viewport early (img.onload only) so
        // overlays mount on the same frame the sprite first renders.
        // Decode probe runs eagerly because the actual pixel work
        // happens off the main thread (createImageBitmap + worker
        // postMessage) — there's no main-thread cost to starting it
        // at mount. Both fallbacks are null so neither gates anything.
        <>
          <Suspense fallback={null}>
            <ImageSizeSink uri={imageUri} onChange={handleReady} />
          </Suspense>
          <Suspense fallback={null}>
            <ImageDecodeSink uri={imageUri} onChange={setImageData} />
          </Suspense>
        </>
      ) : null}
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
        >
          {dimOutOfBounds ? (
            // Even-odd fill: outer huge rect minus the image rect, leaving
            // a darkened ring around the image. Drawn under the children
            // overlays so rect chrome / labels stay fully opaque.
            <path
              d={`M -1e6,-1e6 H 1e6 V 1e6 H -1e6 Z M 0,0 H ${viewport.imageW} V ${viewport.imageH} H 0 Z`}
              fillRule="evenodd"
              fill="rgba(0, 0, 0, 0.25)"
              pointerEvents="none"
            />
          ) : null}
        </svg>
      ) : null}
      {onBackgroundPointerDown && !inPanMode && viewport ? (
        // Stage-level click catcher beneath the editing overlays. Sits
        // above the three.js canvas (whose internal canvas element would
        // otherwise become e.target) so a left-click in the canvas
        // margin reliably becomes a "deselect" signal. Children paint
        // on top via DOM order, so their own catchers (e.g.
        // RectOverlay's image-bounds catcher) take priority where they
        // exist — this only fires on truly empty stage area.
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0 }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            if (e.metaKey || e.ctrlKey || e.altKey) return
            onBackgroundPointerDown()
          }}
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
      {viewport ? (
        // Zoom badge — small monospace readout in the top-left so the
        // user can always see the current zoom level. Appends the
        // image-px:screen-px ratio (e.g. "2×", "1/2×") whenever the
        // current scale lands on a pixel-perfect step, regardless of
        // whether snap is on.
        <ZoomBadge zoom={zoom} viewport={viewport} wrapperRef={wrapperRef} />
      ) : null}
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

/**
 * Zoom indicator pinned to the top-left of the canvas. Shows zoom %
 * always; when the current scale matches a pixel-perfect step, also
 * shows the ratio (2×, 1/2×, …). Reads canvas dimensions from the
 * wrapper ref at render time — close enough for this readout.
 */
function ZoomBadge({
  zoom,
  viewport,
  wrapperRef,
}: {
  zoom: number
  viewport: Viewport
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const el = wrapperRef.current
  let ratio: string | null = null
  if (el && el.clientWidth > 0 && el.clientHeight > 0) {
    const { scale } = scaleAtZoom(zoom, viewport.imageW, viewport.imageH, viewport.fitMargin, el.clientWidth, el.clientHeight)
    ratio = formatPixelRatio(scale)
  }
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        paddingInline: 6,
        paddingBlock: 2,
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 10,
        color: 'var(--vscode-foreground)',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 4,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {Math.round(zoom * 100)}%{ratio != null ? ` (${ratio})` : ''}
    </div>
  )
}
