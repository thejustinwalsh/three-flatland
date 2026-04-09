import { Canvas, extend, useLoader, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useRef, useLayoutEffect } from 'react'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import { usePane, usePaneInput } from '@three-flatland/tweakpane/react'

extend({ Sprite2D })

function OrthoCamera({ viewSize }: { viewSize: number }) {
  const camera = useThree((s) => s.camera) as ThreeOrthographicCamera
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const aspect = size.width / size.height
    camera.left = (-viewSize * aspect) / 2
    camera.right = (viewSize * aspect) / 2
    camera.top = viewSize / 2
    camera.bottom = -viewSize / 2
    camera.updateProjectionMatrix()
  }, [camera, size, viewSize])
  return null
}

function SpriteScene({ tint }: { tint: string }) {
  const texture = useLoader(TextureLoader, './icon.svg')

  return (
    <sprite2D
      texture={texture}
      tint={tint}
      anchor={[0.5, 0.5]}
      scale={[150, 150, 1]}
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
      camera={{
        position: [0, 0, 100],
        near: 0.1,
        far: 1000,
        left: -1, right: 1, top: 1, bottom: -1,
      }}
      renderer={{ antialias: true }}
    >
      <OrthoCamera viewSize={400} />
      <Scene />
    </Canvas>
  )
}
