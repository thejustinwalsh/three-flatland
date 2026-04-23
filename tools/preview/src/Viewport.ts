import { createContext, useContext } from 'react'

/**
 * Shared viewport state between the three.js layer (image render) and the
 * SVG overlay (editor UI). Both layers use this to stay pixel-aligned.
 *
 * v0 is fit-to-container — pan and zoom stay at defaults; SVG's
 * `preserveAspectRatio="xMidYMid meet"` and three.js's ortho-camera-fit
 * math produce the same image bounds inside the container.
 *
 * Extended later with { panX, panY, zoom } for interactive navigation.
 */
export type Viewport = {
  imageW: number
  imageH: number
}

export const ViewportContext = createContext<Viewport | null>(null)

export function useViewport(): Viewport | null {
  return useContext(ViewportContext)
}
