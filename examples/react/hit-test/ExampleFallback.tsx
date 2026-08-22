import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { RENDERER_FAILURE_COLOR, RENDERER_FAILURE_MESSAGE } from './rendererFailure'

/** Native R3F Canvas fallback after every renderer backend fails. */
export function ExampleFallback(): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [isTerminal, setIsTerminal] = useState(false)

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    setIsTerminal(parent !== null && parent !== undefined && parent.tagName !== 'CANVAS')
  }, [])

  return (
    <div
      ref={ref}
      role={isTerminal ? 'status' : undefined}
      aria-hidden={isTerminal ? undefined : true}
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        boxSizing: 'border-box',
        textAlign: 'center',
        color: RENDERER_FAILURE_COLOR,
      }}
    >
      {RENDERER_FAILURE_MESSAGE}
    </div>
  )
}
