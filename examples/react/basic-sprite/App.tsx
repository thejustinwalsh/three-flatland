import { Canvas, extend, useFrame } from '@react-three/fiber/webgpu'
import { useRef, useMemo } from 'react'
import { CanvasTexture } from 'three'
import { Sprite2D } from '@three-flatland/core'
// Import for ThreeElements type augmentation
import type {} from '@three-flatland/react'

// Register Sprite2D with R3F (tree-shakeable)
extend({ Sprite2D })

function RotatingSprite() {
  const spriteRef = useRef<Sprite2D>(null)

  // Create a simple texture from canvas
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#4a9eff'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#ff4a9e'
    ctx.fillRect(16, 16, 32, 32)
    return new CanvasTexture(canvas)
  }, [])

  useFrame((_, delta) => {
    if (spriteRef.current) {
      spriteRef.current.rotation.z += delta
    }
  })

  return <sprite2D ref={spriteRef} texture={texture} anchor={[0.5, 0.5]} />
}

export default function App() {
  return (
    <Canvas
      orthographic
      camera={{ zoom: 5, position: [0, 0, 100] }}
      renderer={{ antialias: true }}
    >
      <color attach="background" args={['#1a1a2e']} />
      <RotatingSprite />
    </Canvas>
  )
}
