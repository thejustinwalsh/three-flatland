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
 * SVG `viewBox` attribute that matches `ThreeLayer`'s fit, including pan
 * and zoom. The image still occupies (0, 0) → (imageW, imageH) in
 * SVG-local coords (so all existing pointer math is unchanged); the
 * viewBox shifts and scales to reflect the current pan and zoom level.
 */
export function viewBoxFor(vp: Viewport): string {
  const visibleW = (vp.imageW * vp.fitMargin) / vp.zoom
  const visibleH = (vp.imageH * vp.fitMargin) / vp.zoom
  const centerX = vp.imageW / 2 + vp.panX
  const centerY = vp.imageH / 2 + vp.panY
  const x = centerX - visibleW / 2
  const y = centerY - visibleH / 2
  return `${x} ${y} ${visibleW} ${visibleH}`
}

export const ViewportContext = createContext<Viewport | null>(null)

export function useViewport(): Viewport | null {
  return useContext(ViewportContext)
}
