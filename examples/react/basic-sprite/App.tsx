import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useRef, useState, useCallback } from 'react'
import { Color, type OrthographicCamera as ThreeOrthographicCamera } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import { usePane, usePaneFolder, usePaneInput, useStatsMonitor } from '@three-flatland/devtools/react'

// Register Sprite2D with R3F (tree-shakeable)
extend({ Sprite2D })

/**
 * Declarative orthographic camera matching three.js frustumSize math.
 * Ref callback fires synchronously during reconciliation; re-fires on
 * resize because the parent re-renders with a new size.
 */
function OrthoCamera({ viewSize }: { viewSize: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const aspect = size.width / size.height
  return (
    <orthographicCamera
      ref={(cam: ThreeOrthographicCamera | null) => {
        if (!cam) return
        cam.left = (-viewSize * aspect) / 2
        cam.right = (viewSize * aspect) / 2
        cam.top = viewSize / 2
        cam.bottom = -viewSize / 2
        ;(cam as any).manual = true
        cam.updateProjectionMatrix()
        set({ camera: cam })
      }}
      position={[0, 0, 100]}
      near={0.1}
      far={1000}
    />
  )
}

// Lerp helper
function lerp(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * Math.min(speed * delta, 1)
}

function InteractiveSprite({
  baseScale,
  hoverScale,
  pressedScale,
  rotationSpeed,
  lerpSpeed,
  hoverTint,
}: {
  baseScale: number
  hoverScale: number
  pressedScale: number
  rotationSpeed: number
  lerpSpeed: number
  hoverTint: string
}) {
  const spriteRef = useRef<Sprite2D>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  // Load the flatland logo (presets are automatically applied)
  const texture = useLoader(TextureLoader, './icon.svg')

  // Tint colors (only hover effect)
  const normalTint = useRef(new Color(1, 1, 1))
  const hoverTintColor = useRef(new Color(hoverTint))

  // Update hoverTint color when prop changes
  hoverTintColor.current.set(hoverTint)

  // Current animated values
  const currentScale = useRef(baseScale)
  const currentTint = useRef(new Color(1, 1, 1))

  useFrame((_, delta) => {
    if (!spriteRef.current) return

    // Determine target scale and tint
    const targetScale = isPressed ? pressedScale : isHovered ? hoverScale : baseScale
    const targetTint = isHovered ? hoverTintColor.current : normalTint.current

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
    spriteRef.current.rotation.z += rotationSpeed * delta
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

function Scene() {
  const { pane, stats } = usePane()

  const spriteFolder = usePaneFolder(pane, 'Sprite')
  const [baseScale] = usePaneInput(spriteFolder, 'baseScale', 150, { min: 10, max: 300 })
  const [hoverScale] = usePaneInput(spriteFolder, 'hoverScale', 165, { min: 10, max: 300 })
  const [pressedScale] = usePaneInput(spriteFolder, 'pressedScale', 135, { min: 10, max: 300 })

  const animFolder = usePaneFolder(pane, 'Animation')
  const [rotationSpeed] = usePaneInput(animFolder, 'rotationSpeed', 0.2, { min: 0, max: 2, step: 0.1 })
  const [lerpSpeed] = usePaneInput(animFolder, 'lerpSpeed', 10, { min: 1, max: 20, step: 1 })

  const colorFolder = usePaneFolder(pane, 'Color')
  const [hoverTint] = usePaneInput(colorFolder, 'hoverTint', '#99d9ef')

  useStatsMonitor(stats)

  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <InteractiveSprite
        baseScale={baseScale}
        hoverScale={hoverScale}
        pressedScale={pressedScale}
        rotationSpeed={rotationSpeed}
        lerpSpeed={lerpSpeed}
        hoverTint={hoverTint}
      />
    </>
  )
}

export default function App() {
  return (
    <Canvas
      dpr={1}
      renderer={{ antialias: false, trackTimestamp: true }}
      onCreated={({ gl }) => {
        gl.domElement.style.imageRendering = 'pixelated'
      }}
    >
      <OrthoCamera viewSize={400} />
      <Scene />
    </Canvas>
  )
}
