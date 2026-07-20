import { Suspense, useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { OrthographicCamera } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland, Sprite2D, TextureLoader } from 'three-flatland/react'

// R3F requires registration before Flatland classes appear as JSX elements.
extend({ Flatland, Sprite2D })

/**
 * Flatland renders with its own orthographic camera. Mirror its frustum onto
 * R3F's default camera so pointer events raycast in the same space Flatland
 * draws in. Order matters: resize() recomputes the frustum this copy reads,
 * so this component owns both. The Canvas must be `orthographic` — `copy`
 * across mismatched camera types produces a broken projection.
 */
function SyncEventCamera({ flatland }: { flatland: RefObject<Flatland | null> }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  useEffect(() => {
    const source = flatland.current
    if (!source) return
    source.resize(size.width, size.height)
    camera.copy(source.camera)
    camera.updateProjectionMatrix()
  }, [camera, size, flatland])
  return null
}

function Scene() {
  // Suspends until the texture resolves — the Suspense fallback OUTSIDE the
  // Canvas renders a DOM loading overlay meanwhile.
  const texture = useLoader(TextureLoader, `${import.meta.env.BASE_URL}sprite.svg`)
  const flatlandRef = useRef<Flatland>(null)
  const spriteRef = useRef<Sprite2D>(null)
  const gl = useThree((s) => s.gl)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  useFrame(() => {
    const sprite = spriteRef.current
    if (sprite) {
      sprite.rotation.z += 0.005
      const target = pressed ? 130 : hovered ? 170 : 150
      const next = sprite.scale.x + (target - sprite.scale.x) * 0.15
      sprite.scale.set(next, next, 1)
    }
  })

  // Flatland owns an internal scene + camera, so it renders manually.
  // Registering in the 'render' phase makes R3F skip its own render pass.
  useFrame(
    () => {
      flatlandRef.current?.render(gl as unknown as WebGPURenderer)
    },
    { phase: 'render' }
  )

  return (
    <>
      <SyncEventCamera flatland={flatlandRef} />
      <flatland ref={flatlandRef} viewSize={400} clearColor={0x16191e}>
        <sprite2D
          ref={spriteRef}
          texture={texture}
          anchor={[0.5, 0.5]}
          scale={[150, 150, 1]}
          tint={hovered ? '#47cca9' : '#ffffff'}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
        />
      </flatland>
    </>
  )
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Suspense fallback={<Loading />}>
        <Canvas orthographic renderer={{ antialias: false }}>
          <Scene />
        </Canvas>
      </Suspense>
      <button type="button" style={fullscreenStyle} onClick={() => void containerRef.current?.requestFullscreen()}>
        Fullscreen
      </button>
    </div>
  )
}

function Loading() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa4b2' }}>
      Loading…
    </div>
  )
}

const fullscreenStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  padding: '6px 10px',
  border: '1px solid #2c3340',
  borderRadius: 6,
  background: 'transparent',
  color: '#9aa4b2',
  font: '12px system-ui, sans-serif',
  cursor: 'pointer',
}
