import { Canvas, extend, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useLayoutEffect } from 'react'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import { usePane, usePaneInput, useStatsMonitor } from '@three-flatland/devtools/react'

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
  const [tint] = usePaneInput(pane, 'tint', '#ffffff', {
    options: { White: '#ffffff', Cyan: '#47cca9', Pink: '#ff6b9d' },
  })

  useStatsMonitor(stats)

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
      dpr={1}
      camera={{
        position: [0, 0, 100],
        near: 0.1,
        far: 1000,
        left: -1, right: 1, top: 1, bottom: -1,
      }}
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
