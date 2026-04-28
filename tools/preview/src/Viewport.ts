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
 * Extended later with { panX, panY, zoom } for interactive navigation.
 */
export type Viewport = {
  imageW: number
  imageH: number
  fitMargin: number
}

/**
 * SVG `viewBox` attribute that matches `ThreeLayer`'s fit. The image
 * still occupies (0, 0) → (imageW, imageH) in SVG-local coords (so all
 * existing pointer math is unchanged); the viewBox just expands to
 * include the same margin Three.js leaves around the image.
 */
export function viewBoxFor(vp: Viewport): string {
  const padX = (vp.imageW * (vp.fitMargin - 1)) / 2
  const padY = (vp.imageH * (vp.fitMargin - 1)) / 2
  return `${-padX} ${-padY} ${vp.imageW * vp.fitMargin} ${vp.imageH * vp.fitMargin}`
}

export const ViewportContext = createContext<Viewport | null>(null)

export function useViewport(): Viewport | null {
  return useContext(ViewportContext)
}
