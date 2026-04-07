import { useState, useEffect, useContext } from 'react'
import { useThree } from '@react-three/fiber'
import { SkiaContext } from '../context'
import { SkiaReactContext } from './context'
import { Skia } from '../init'

/**
 * Get the nearest SkiaContext — from a parent `<skiaCanvas>` via React context,
 * or from the global singleton (initialized from the R3F renderer).
 *
 * Returns the SkiaContext once WASM is loaded, or null while loading.
 *
 * ```tsx
 * const skia = useSkiaContext()
 * ```
 */
export function useSkiaContext(): SkiaContext | null {
  const nearest = useContext(SkiaReactContext)
  const gl = useThree((s) => s.gl)
  const [ctx, setCtx] = useState<SkiaContext | null>(() => nearest ?? SkiaContext.instance)

  useEffect(() => {
    // Prefer the nearest context from a parent SkiaCanvas
    if (nearest) {
      setCtx(nearest)
      return
    }

    if (SkiaContext.instance && !SkiaContext.instance.isDestroyed) {
      setCtx(SkiaContext.instance)
      return
    }

    let disposed = false
    Skia.init(gl).then((c) => {
      if (!disposed) setCtx(c)
    })
    return () => { disposed = true }
  }, [gl, nearest])

  return nearest ?? ctx
}
