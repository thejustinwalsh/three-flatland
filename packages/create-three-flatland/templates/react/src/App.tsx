import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Canvas, extend, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { Flatland, Sprite2D, TextureLoader } from 'three-flatland/react'
// Pure scene maths, extracted so it can be unit-tested without a GPU or a
// React renderer. See src/interaction.test.ts — `npm run test`.
import { approach, SPRITE_SCALE, targetScale, tintFor } from './interaction'

// R3F requires registration before Flatland classes appear as JSX elements.
extend({ Flatland, Sprite2D })

function Scene() {
  // Suspends until the texture resolves — the Suspense fallback OUTSIDE the
  // Canvas renders a DOM loading overlay meanwhile.
  const texture = useLoader(TextureLoader, `${import.meta.env.BASE_URL}sprite.svg`)

  // Scene renders only after the texture resolves, so this is the ready signal.
  useEffect(() => {
    document.querySelector('#loader')?.remove()
  }, [])
  const flatlandRef = useRef<Flatland>(null)
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)

  /**
   * Hand Flatland's own camera to R3F as the default, so pointer events raycast
   * through the exact object Flatland draws with — one camera, nothing to sync.
   *
   * This must be a CALLBACK REF, not an effect reading a ref: React 19's
   * StrictMode double-mount detaches and reattaches, and a callback ref re-runs
   * on every attach while an effect can end up holding a stale instance. Getting
   * this wrong leaves pointer events dead in dev and fine in production.
   * Re-created when size changes, which re-registers after a resize.
   */
  const attachFlatland = useCallback(
    (instance: Flatland | null) => {
      flatlandRef.current = instance
      if (!instance) return
      instance.resize(size.width, size.height)
      // `manual` is read by R3F but not declared on three's camera type.
      ;(instance.camera as typeof instance.camera & { manual?: boolean }).manual = true
      instance.camera.updateProjectionMatrix()
      set({ camera: instance.camera })
    },
    [set, size.width, size.height]
  )
  const spriteRef = useRef<Sprite2D>(null)
  const renderer = useThree((s) => s.renderer as WebGPURenderer)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)

  useFrame(() => {
    const sprite = spriteRef.current
    if (sprite) {
      sprite.rotation.z += 0.005
      const next = approach(sprite.scale.x, targetScale({ hovered, pressed }))
      sprite.scale.set(next, next, 1)
    }
  })

  // Flatland owns an internal scene + camera, so it renders manually.
  // Registering in the 'render' phase makes R3F skip its own render pass.
  useFrame(
    () => {
      flatlandRef.current?.render(renderer)
    },
    { phase: 'render' }
  )

  return (
    <>
      <flatland ref={attachFlatland} viewSize={400} clearColor={0x16191e}>
        <sprite2D
          ref={spriteRef}
          texture={texture}
          anchor={[0.5, 0.5]}
          scale={[SPRITE_SCALE.idle, SPRITE_SCALE.idle, 1]}
          tint={tintFor({ hovered, pressed })}
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
      <Canvas orthographic renderer={{ antialias: false }}>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <FullscreenButton containerRef={containerRef} />
    </div>
  )
}

/**
 * Fullscreen toggle. Tracks `fullscreenchange` rather than local state so the
 * icon stays correct when the browser exits on its own — Esc, gesture, or the
 * OS. Safari does not wire Esc to `exitFullscreen`, so it is handled here.
 */
function FullscreenButton({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement) void document.exitFullscreen()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void containerRef.current?.requestFullscreen()
  }

  return (
    <button
      type="button"
      style={fullscreenStyle}
      onClick={toggle}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path
          d={
            isFullscreen
              ? 'M1.5 5.5H6V1M14.5 5.5H10V1M1.5 10.5H6V15M14.5 10.5H10V15'
              : 'M6 1.5H1.5V6M10 1.5h4.5V6M6 14.5H1.5V10M10 14.5h4.5V10'
          }
        />
      </svg>
    </button>
  )
}

const fullscreenStyle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  display: 'grid',
  placeItems: 'center',
  width: 34,
  height: 34,
  padding: 0,
  border: '1px solid #2c3340',
  borderRadius: 8,
  background: 'rgb(22 25 30 / 0.6)',
  color: '#9aa4b2',
  cursor: 'pointer',
}
