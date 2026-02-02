import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useRef, useState, useCallback, useEffect } from 'react'
import { Color } from 'three'
import { Sprite2D, TextureLoader } from '@three-flatland/react'

// Register Sprite2D with R3F (tree-shakeable)
extend({ Sprite2D })

// Lerp helper
function lerp(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * Math.min(speed * delta, 1)
}

function InteractiveSprite() {
  const spriteRef = useRef<Sprite2D>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  // Load the flatland logo (presets are automatically applied)
  const texture = useLoader(TextureLoader, import.meta.env.BASE_URL + 'icon.svg')

  // Sprite size (SVGs may not have proper dimensions, so we set explicit size)
  const spriteSize = 30

  // Interaction constants (scale relative to spriteSize)
  const baseScale = spriteSize
  const hoverScale = spriteSize * 1.1
  const pressedScale = spriteSize * 0.9
  const lerpSpeed = 10

  // Tint colors (only hover effect)
  const normalTint = useRef(new Color(1, 1, 1))
  const hoverTint = useRef(new Color(0.6, 0.85, 1.0)) // Soft cyan highlight

  // Current animated values
  const currentScale = useRef(spriteSize)
  const currentTint = useRef(new Color(1, 1, 1))

  useFrame((_, delta) => {
    if (!spriteRef.current) return

    // Determine target scale and tint
    const targetScale = isPressed ? pressedScale : isHovered ? hoverScale : baseScale
    const targetTint = isHovered ? hoverTint.current : normalTint.current

    // Lerp scale
    currentScale.current = lerp(currentScale.current, targetScale, lerpSpeed, delta)
    spriteRef.current.scale.set(currentScale.current, currentScale.current, 1)

    // Lerp tint (update our tracked tint, then set it via the setter)
    const tint = currentTint.current
    tint.r = lerp(tint.r, targetTint.r, lerpSpeed, delta)
    tint.g = lerp(tint.g, targetTint.g, lerpSpeed, delta)
    tint.b = lerp(tint.b, targetTint.b, lerpSpeed, delta)
    spriteRef.current.tint = tint

    // Slow rotation
    spriteRef.current.rotation.z += 0.2 * delta
  })

  const handlePointerOver = useCallback(() => setIsHovered(true), [])
  const handlePointerOut = useCallback(() => {
    setIsHovered(false)
    setIsPressed(false)
  }, [])
  const handlePointerDown = useCallback(() => setIsPressed(true), [])
  const handlePointerUp = useCallback(() => setIsPressed(false), [])

  return (
    <sprite2D
      ref={spriteRef}
      texture={texture}
      anchor={[0.5, 0.5]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  )
}

function StatsTracker({ onStats }: { onStats: (fps: number, draws: number) => void }) {
  const gl = useThree((s) => s.gl)
  const frameCount = useRef(0)
  const elapsed = useRef(0)

  // Disable auto-reset so we can read draw calls from the previous frame
  // before manually resetting. The WebGPU Animation loop resets info at
  // the start of each frame — before useFrame runs — which would zero
  // out the counters before we can read them.
  useEffect(() => {
    gl.info.autoReset = false
    return () => { gl.info.autoReset = true }
  }, [gl])

  useFrame((_, delta) => {
    frameCount.current++
    elapsed.current += delta
    if (elapsed.current >= 1) {
      const draws = (gl.info.render as any).drawCalls as number
      onStats(Math.round(frameCount.current / elapsed.current), draws)
      frameCount.current = 0
      elapsed.current = 0
    }
    gl.info.reset()
  })
  return null
}

export default function App() {
  const [stats, setStats] = useState({ fps: '-' as string | number, draws: '-' as string | number })
  const handleStats = useCallback((fps: number, draws: number) => setStats({ fps, draws }), [])

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          padding: '5px 10px',
          background: 'rgba(0, 2, 28, 0.7)',
          borderRadius: 6,
          color: '#4a9eff',
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: 1.5,
          zIndex: 100,
          whiteSpace: 'pre',
        }}
      >
        {`FPS: ${stats.fps}\nDraws: ${stats.draws}`}
      </div>
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: true }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <StatsTracker onStats={handleStats} />
        <InteractiveSprite />
      </Canvas>
    </>
  )
}
