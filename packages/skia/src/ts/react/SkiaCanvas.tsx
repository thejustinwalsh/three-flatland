import { useState, useCallback, useEffect, useRef, type ReactNode, type Ref } from 'react'
import { extend, type ThreeElement } from '@react-three/fiber'
import type { SkiaContext } from '../context'
import type { SkiaContextReady } from '../three/SkiaCanvas'
import { SkiaReactContext } from './context'
import { SkiaCanvas as SkiaCanvasClass } from '../three/SkiaCanvas'

export type SkiaCanvasRef = ThreeElement<typeof SkiaCanvasClass>

type SkiaCanvasProps = SkiaCanvasRef & {
  ref?: Ref<SkiaCanvasRef>
  children?: ReactNode
  onContextCreate?: (ctx: SkiaContextReady) => void
}

extend({ SkiaCanvas: SkiaCanvasClass })

/** @internal Keeps eager Three.js callbacks from updating React before commit. */
export function useSkiaCanvasContext(onContextCreate?: (ctx: SkiaContextReady) => void) {
  const [ctx, setCtx] = useState<SkiaContext | null>(null)
  const mountedRef = useRef(false)
  const pendingRef = useRef<SkiaContextReady | null>(null)
  const deliveredRef = useRef<SkiaContextReady | null>(null)
  const onContextCreateRef = useRef(onContextCreate)
  onContextCreateRef.current = onContextCreate

  const deliver = useCallback((next: SkiaContextReady) => {
    setCtx(next)
    if (deliveredRef.current !== next) {
      deliveredRef.current = next
      onContextCreateRef.current?.(next)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (pendingRef.current) deliver(pendingRef.current)
    return () => {
      mountedRef.current = false
    }
  }, [deliver])

  const handleContextCreate = useCallback(
    (next: SkiaContextReady) => {
      pendingRef.current = next
      if (mountedRef.current) deliver(next)
    },
    [deliver]
  )

  return [ctx, handleContextCreate] as const
}

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
  const [ctx, handleContextCreate] = useSkiaCanvasContext(onContextCreate)

  return (
    <SkiaReactContext.Provider value={ctx}>
      <skiaCanvas ref={ref} onContextCreate={handleContextCreate} {...props}>
        {children}
      </skiaCanvas>
    </SkiaReactContext.Provider>
  )
}
