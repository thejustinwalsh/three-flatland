import { createContext, useContext } from 'react'

/**
 * Shared viewport state between the three.js layer (image render) and the
 * SVG overlay (editor UI). Both layers use this to stay pixel-aligned.
 *
 * `fitMargin` matches `ThreeLayer`'s ortho-camera fit (image occupies
 * `1 / fitMargin` of the visible viewport, with letterbox padding on the
 * tighter axis). SVG overlays MUST use `viewBoxFor(vp)` rather than a
 * raw `0 0 imageW imageH` so SVG-local coords stay aligned with the
 * rendered image — without the matching margin, cursor coords are off
 * by `(fitMargin - 1)` of the visible area.
 *
 * `zoom` and `panX/panY` extend the base fit: zoom=1 means fit-to-canvas
 * (the default), panX/panY are offsets in image-pixel units from center.
 */
export type Viewport = {
  imageW: number
  imageH: number
  fitMargin: number
  /**
   * 1 = fit-to-canvas (default). 2 = 2× zoom in. 0.5 = zoom out.
   * Clamped to [0.05, 50] by the viewport controller.
   */
  zoom: number
  /**
   * Pan offsets in image-pixel units. (0, 0) = centered on image.
   * Positive X pans right (image moves left in view); positive Y pans down.
   */
  panX: number
  panY: number
}

/**
 * The image-pixel dimensions of the viewBox at the current zoom —
 * shared by `viewBoxFor` and `screenScaleFor` so they can't drift.
 */
export function visibleSizeFor(vp: Viewport): { w: number; h: number } {
  return {
    w: (vp.imageW * vp.fitMargin) / vp.zoom,
    h: (vp.imageH * vp.fitMargin) / vp.zoom,
  }
}

/**
 * SVG `viewBox` attribute that matches `ThreeLayer`'s fit, including pan
 * and zoom. The image still occupies (0, 0) → (imageW, imageH) in
 * SVG-local coords (so all existing pointer math is unchanged); the
 * viewBox shifts and scales to reflect the current pan and zoom level.
 */
export function viewBoxFor(vp: Viewport): string {
  const { w: visibleW, h: visibleH } = visibleSizeFor(vp)
  const centerX = vp.imageW / 2 + vp.panX
  const centerY = vp.imageH / 2 + vp.panY
  const x = centerX - visibleW / 2
  const y = centerY - visibleH / 2
  return `${x} ${y} ${visibleW} ${visibleH}`
}

/**
 * Screen-pixels-per-image-pixel at the current zoom, given the actual
 * on-screen size (CSS px) of the element rendering this viewport's
 * `viewBoxFor` output. Mirrors `preserveAspectRatio="xMidYMid meet"`:
 * whichever axis fits less tightly determines the on-screen scale (same
 * math as `CanvasStage.tsx`'s private `scaleAtZoom`, factored out here
 * so any SVG overlay — not just CanvasStage's own zoom badge/pixel-snap
 * logic — can size screen-space-constant chrome, e.g. `RectOverlay`'s
 * resize handles). Returns 0 if either screen dimension is non-positive
 * (element not yet laid out) — callers should fall back to a sane
 * default handle size in that case, not divide by it.
 */
export function screenScaleFor(vp: Viewport, screenW: number, screenH: number): number {
  if (screenW <= 0 || screenH <= 0) return 0
  const { w: visibleW, h: visibleH } = visibleSizeFor(vp)
  if (visibleW <= 0 || visibleH <= 0) return 0
  return Math.min(screenW / visibleW, screenH / visibleH)
}

export const ViewportContext = createContext<Viewport | null>(null)

export function useViewport(): Viewport | null {
  return useContext(ViewportContext)
}
