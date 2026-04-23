import { useCallback, useState, type ReactNode } from 'react'
import { ThreeLayer } from './ThreeLayer'
import { ViewportContext, type Viewport } from './Viewport'

export type CanvasStageProps = {
  imageUri: string | null
  background?: string
  fitMargin?: number
  /** Overlay layers rendered absolutely over the three.js canvas. */
  children?: ReactNode
  onImageReady?: (size: { w: number; h: number }) => void
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
 */
export function CanvasStage({
  imageUri,
  background,
  fitMargin = 1.15,
  children,
  onImageReady,
}: CanvasStageProps) {
  const [viewport, setViewport] = useState<Viewport | null>(null)

  const handleReady = useCallback(
    (size: { w: number; h: number }) => {
      setViewport({ imageW: size.w, imageH: size.h })
      onImageReady?.(size)
    },
    [onImageReady]
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <ThreeLayer
        imageUri={imageUri}
        background={background}
        fitMargin={fitMargin}
        onImageReady={handleReady}
      />
      <ViewportContext.Provider value={viewport}>
        {viewport ? children : null}
      </ViewportContext.Provider>
    </div>
  )
}
