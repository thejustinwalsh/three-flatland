import { use, useContext } from 'react'
import { useThree } from '@react-three/fiber'
import { SkiaContext } from '../context'
import { SkiaReactContext } from './context'
import { Skia } from '../init'

/**
 * Get the nearest SkiaContext — from a parent `<SkiaCanvas>` via React context,
 * from the global singleton, or by suspending until `Skia.init()` completes.
 *
 * Resolution order:
 * 1. Nearest `SkiaReactContext` (from parent `<SkiaCanvas>`)
 * 2. `SkiaContext.instance` (global singleton, already initialized)
 * 3. `Skia.pending` — suspends via `use()` until init completes
 * 4. Kicks off `Skia.init(renderer)` from the R3F renderer, then suspends
 *
 * Always returns a `SkiaContext` — never null. Wrap the consuming component
 * in `<Suspense>` to handle the loading state.
 *
 * ```tsx
 * function MySkiaComponent() {
 *   const skia = useSkiaContext()
 *   // skia is always ready here
 * }
 * ```
 */
export function useSkiaContext(): SkiaContext {
  // 1. Nearest React context (from parent <SkiaCanvas>)
  const nearest = useContext(SkiaReactContext)
  if (nearest) return nearest

  // 2. Global singleton already initialized
  if (SkiaContext.instance && !SkiaContext.instance.isDestroyed) {
    return SkiaContext.instance
  }

  // 3. Init is in-flight — suspend until it resolves
  if (Skia.pending) {
    return use(Skia.pending)
  }

  // 4. No init started — kick one off from the R3F renderer and suspend
  const gl = useThree((s) => s.gl)
  return use(Skia.init(gl))
}
