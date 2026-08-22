import { Activity, useEffect, useRef, useState } from 'react'
import { Canvas, extend, useFrame } from '@react-three/fiber/webgpu'
import { DevtoolsProvider, usePane } from '@three-flatland/devtools/react'
import { DataTexture, NearestFilter, RGBAFormat, type Group } from 'three'
import { Sprite2D, SpriteGroup, usePixelPerfectCamera } from 'three-flatland/react'
import { exampleRendererColorConfig } from './rendererColorManagement'
import { ExampleFallback } from './ExampleFallback'
import { GemBackground } from './GemBackground'
import { GEM } from './gem'

extend({ Sprite2D, SpriteGroup })

const palette = new Uint8Array([
  0x55, 0xd6, 0xbe, 0xff, 0xb4, 0x8e, 0xff, 0xff, 0xff, 0xc8, 0x57, 0xff, 0xff, 0x73, 0xa8, 0xff,
])
const paletteTexture = new DataTexture(palette, 4, 1, RGBAFormat)
paletteTexture.magFilter = NearestFilter
paletteTexture.needsUpdate = true
import.meta.hot?.dispose(() => paletteTexture.dispose())
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)')

/** Keep the orthographic example camera fitted to the current canvas aspect. */
function Camera() {
  usePixelPerfectCamera({ viewSize: 320, viewWidth: 480 })
  return null
}

/** Render and optionally animate one retained hierarchy of batched symbols. */
function Symbols({
  texture,
  rotated = false,
  animated = true,
}: {
  texture: DataTexture
  rotated?: boolean
  animated?: boolean
}) {
  const host = useRef<Group>(null)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    if (!animated) return
    elapsed.current += delta
    if (host.current) host.current.position.y = Math.sin(elapsed.current) * 55
  })

  return (
    <group ref={host} rotation-z={rotated ? Math.PI / 4 : 0}>
      {Array.from({ length: 36 }, (_, i) => (
        <sprite2D
          key={i}
          texture={texture}
          position={[(i % 6) * 42 - 105, Math.floor(i / 6) * 42 - 105, 0]}
          scale={[34, 34, 1]}
          frame={{
            name: String(i),
            x: (i % 4) / 4,
            y: 0,
            width: 1 / 4,
            height: 1,
            sourceWidth: 1,
            sourceHeight: 1,
          }}
        />
      ))}
    </group>
  )
}

/** Alternate two Activity-owned hierarchies inside a transformed clip group. */
function Scene() {
  usePane()
  const [active, setActive] = useState<0 | 1>(0)
  const [reducedMotion, setReducedMotion] = useState(motionPreference.matches)

  useEffect(() => {
    const handleChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    motionPreference.addEventListener('change', handleChange)
    return () => motionPreference.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (reducedMotion) return
    const timer = window.setInterval(() => setActive((value) => (value === 0 ? 1 : 0)), 2200)
    return () => window.clearInterval(timer)
  }, [reducedMotion])

  return (
    <spriteGroup clipRect={[-120, -80, 240, 160]} rotation-z={-0.08}>
      <Activity mode={active === 0 ? 'visible' : 'hidden'}>
        <Symbols texture={paletteTexture} animated={!reducedMotion} />
      </Activity>
      <Activity mode={active === 1 ? 'visible' : 'hidden'}>
        <Symbols texture={paletteTexture} rotated animated={!reducedMotion} />
      </Activity>
    </spriteGroup>
  )
}

/** Mount the React hierarchy, Activity, and clipping demonstration. */
export default function App() {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      renderer={{ ...exampleRendererColorConfig }}
      frameloop="always"
      camera={{ position: [0, 0, 100], near: 0.1, far: 1000 }}
      fallback={<ExampleFallback />}
    >
      <DevtoolsProvider name="react-hierarchy-clipping" />
      <GemBackground gem={GEM} />
      <Camera />
      <Scene />
    </Canvas>
  )
}
