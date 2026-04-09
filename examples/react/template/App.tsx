import { Canvas, extend, useLoader, useFrame, useThree } from '@react-three/fiber/webgpu'
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
  const { pane, stats } = usePane()
  const gl = useThree((s) => s.gl)
  const [tint] = usePaneInput(pane, 'tint', '#ffffff', {
    options: { White: '#ffffff', Cyan: '#47cca9', Pink: '#ff6b9d' },
  })

  const statsRef = useRef(stats)
  statsRef.current = stats

  useFrame(() => {
    statsRef.current.begin()
  }, { priority: -Infinity })

  useFrame(() => {
    statsRef.current.update({ drawCalls: (gl.info.render as any).drawCalls as number, triangles: (gl.info.render as any).triangles as number })
    statsRef.current.end()
  }, { priority: Infinity })

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
