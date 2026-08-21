import { useLayoutEffect, useRef, useState } from 'react'
import { RENDERER_FAILURE_COLOR, RENDERER_FAILURE_MESSAGE } from './rendererFallback'

export function WebGPUFallback() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useLayoutEffect(() => {
    setIsVisible(ref.current?.parentElement?.tagName !== 'CANVAS')
  }, [])

  return (
    <div
      ref={ref}
      role={isVisible ? 'status' : undefined}
      aria-hidden={isVisible ? undefined : true}
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        textAlign: 'center',
        color: RENDERER_FAILURE_COLOR,
      }}
    >
      {RENDERER_FAILURE_MESSAGE}
    </div>
  )
}
