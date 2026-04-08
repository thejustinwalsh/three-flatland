import { Canvas, extend, useLoader, useFrame } from '@react-three/fiber/webgpu'
import { useRef } from 'react'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import { usePane, usePaneInput } from '@three-flatland/tweakpane/react'

extend({ Sprite2D })

function SpriteScene({ tint }: { tint: string }) {
  const texture = useLoader(TextureLoader, import.meta.env.BASE_URL + 'icon.svg')

  return (
    <sprite2D
      texture={texture}
      tint={tint}
      anchor={[0.5, 0.5]}
      scale={[30, 30, 1]}
    />
  )
}

function Scene() {
  const { pane, fpsGraph } = usePane()
  const [tint] = usePaneInput(pane, 'tint', '#ffffff', {
    options: { White: '#ffffff', Cyan: '#47cca9', Pink: '#ff6b9d' },
  })

  const fpsRef = useRef(fpsGraph)
  fpsRef.current = fpsGraph

  useFrame(() => {
    fpsRef.current?.begin()
  }, -Infinity)

  useFrame(() => {
    fpsRef.current?.end()
  }, Infinity)

  return (
    <>
      <color attach="background" args={['#00021c']} />
      <SpriteScene tint={tint} />
    </>
  )
}

export default function App() {
  return (
    <Canvas
      orthographic
      camera={{ zoom: 5, position: [0, 0, 100] }}
      renderer={{ antialias: true }}
    >
      <Scene />
    </Canvas>
  )
}
