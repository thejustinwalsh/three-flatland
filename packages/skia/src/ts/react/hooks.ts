import { useState, useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { SkiaContext } from '../context'
import { Skia } from '../init'
import type { SkiaDrawingContext } from '../drawing-context'

/**
 * Initialize Skia from the current R3F renderer.
 * Returns the SkiaContext once WASM is loaded, or null while loading.
 *
 * Call this once in your app — or let `<skiaCanvas>` handle it automatically.
 * Loaders (`useLoader(SkiaFontLoader, ...)`) work as soon as context is ready.
 *
 * ```tsx
 * const skia = useSkiaContext()
 * ```
 */
export function useSkiaContext(): SkiaContext | null {
  const gl = useThree((s) => s.gl)
  const [ctx, setCtx] = useState<SkiaContext | null>(() => SkiaContext.instance)

  useEffect(() => {
    if (SkiaContext.instance && !SkiaContext.instance.isDestroyed) {
      setCtx(SkiaContext.instance)
      return
    }

    let disposed = false
    Skia.init(gl).then((c) => {
      if (!disposed) setCtx(c)
    })
    return () => { disposed = true }
  }, [gl])

  return ctx
}

/**
 * Register an imperative draw callback on the nearest parent SkiaCanvas.
 */
export function useSkiaDraw(
  callback: (ctx: SkiaDrawingContext) => void,
  _deps: unknown[],
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  // TODO: Hook into parent SkiaCanvas's draw pass via context or custom event.
}
