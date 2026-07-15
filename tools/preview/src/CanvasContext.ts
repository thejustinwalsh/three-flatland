import { createContext, useContext } from 'react'
import type { CursorStore } from './cursorStore'

// Contexts + hooks consumed by overlays that live OUTSIDE the lazy
// <CanvasStage> bundle (toolbar, sidebar, info panels). Splitting these
// out of CanvasStage.tsx is what lets the shell import them without
// transitively pulling in @react-three/fiber + three.

export const CursorStoreContext = createContext<CursorStore | null>(null)
export function useCursorStore(): CursorStore | null {
  return useContext(CursorStoreContext)
}

export const ImageDataContext = createContext<ImageData | null>(null)
export function useImageData(): ImageData | null {
  return useContext(ImageDataContext)
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

export const ViewportControllerContext = createContext<ViewportController | null>(null)

/**
 * Access the viewport controller from any descendant of `<CanvasStage>`.
 * Returns null when no stage is mounted. Use this in toolbar buttons to
 * wire zoomIn / zoomOut / fitToView.
 */
export function useViewportController(): ViewportController | null {
  return useContext(ViewportControllerContext)
}
