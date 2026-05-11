import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { computePlayCanvas, type PlayCanvasMetrics } from '../lib/scale'

interface Props {
  /** Ref to the host element whose size determines the integer-pixel scale step. */
  hostRef: RefObject<HTMLElement | null>
  children: ReactNode
  /** Called when scale or row count changes. Used by the Scene to size the Flatland viewport. */
  onMetrics?: (m: PlayCanvasMetrics) => void
}

/**
 * Sized R3F Canvas with integer-pixel scale-to-fit.
 *
 * Picks the largest scale step from SCALE_STEPS that fits the host viewport
 * while keeping at least MIN_PLAY_ROWS visible. Sprites are pixel-perfect at
 * every step thanks to `imageRendering: pixelated`.
 *
 * Centered horizontally; pinned vertically to the host's top edge.
 */
export function PlayCanvas({ hostRef, children, onMetrics }: Props) {
  const [metrics, setMetrics] = useState<PlayCanvasMetrics | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const update = () => {
      const r = host.getBoundingClientRect()
      const m = computePlayCanvas(r.width, r.height)
      setMetrics(m)
      onMetrics?.(m)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(host)
    return () => ro.disconnect()
  }, [hostRef, onMetrics])

  if (!metrics) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated',
        zIndex: 1,
      }}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1, near: 0, far: 10 }}
        renderer={{ antialias: false, alpha: true }}
        style={{ touchAction: 'none', imageRendering: 'pixelated' }}
        onCreated={({ gl }) => {
          gl.domElement.style.imageRendering = 'pixelated'
        }}
      >
        {children}
      </Canvas>
    </div>
  )
}
