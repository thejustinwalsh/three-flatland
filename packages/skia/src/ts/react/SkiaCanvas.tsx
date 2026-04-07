import { useState, useCallback, type ReactNode, type Ref } from 'react'
import { extend, type ThreeElement } from '@react-three/fiber'
import type { SkiaContext } from '../context'
import type { SkiaContextReady } from '../three/SkiaCanvas'
import { SkiaReactContext } from './context'
import { SkiaCanvas as SkiaCanvasClass } from '../three/SkiaCanvas'

export type SkiaCanvasRef = ThreeElement<typeof SkiaCanvasClass>;

type SkiaCanvasProps = SkiaCanvasRef & {
  ref?: Ref<SkiaCanvasRef>
  children?: ReactNode
  onContextCreate?: (ctx: SkiaContextReady) => void
}

extend({ SkiaCanvas: SkiaCanvasClass });

/**
 * R3F wrapper for `<skiaCanvas>` that provides the SkiaContext to children
 * via React context. Children can access it with `useSkiaContext()`.
 *
 * Drop-in replacement for `<skiaCanvas>` — accepts the same props.
 *
 * ```tsx
 * <SkiaCanvas renderer={gl} width={1024} height={880}
 *   onContextCreate={(ctx) => console.log(ctx.backend)}>
 *   <MySkiaComponent />
 * </SkiaCanvas>
 * ```
 */
export function SkiaCanvas({ ref, children, onContextCreate, ...props }: SkiaCanvasProps) {
  const [ctx, setCtx] = useState<SkiaContext | null>(null)

  const handleContextCreate = useCallback((c: SkiaContextReady) => {
    setCtx(c)
    onContextCreate?.(c)
  }, [onContextCreate])

  return (
    <SkiaReactContext.Provider value={ctx}>
      <skiaCanvas ref={ref} onContextCreate={handleContextCreate} {...props}>
        {children}
      </skiaCanvas>
    </SkiaReactContext.Provider>
  )
}
