import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'

export function DeckCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      className="deck-bg"
      frameloop="always"
      camera={{ position: [0, 0, 10], fov: 50 }}
      renderer={{ antialias: false }}
    >
      {children}
    </Canvas>
  )
}
