import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'

function RendererFallback() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  useLayoutEffect(() => setIsVisible(ref.current?.parentElement?.tagName !== 'CANVAS'), [])
  return (
    <div ref={ref} role={isVisible ? 'status' : undefined} aria-hidden={isVisible ? undefined : true}>
      This preview could not initialize WebGPU or WebGL 2 rendering.
    </div>
  )
}

export function DeckCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      className="deck-bg"
      frameloop="always"
      camera={{ position: [0, 0, 10], fov: 50 }}
      renderer={{ antialias: false }}
      fallback={<RendererFallback />}
    >
      {children}
    </Canvas>
  )
}
