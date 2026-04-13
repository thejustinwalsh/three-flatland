import { Suspense, useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three'
import {
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import { usePane, usePaneFolder, useStatsMonitor } from '@three-flatland/tweakpane/react'

// Register AnimatedSprite2D with R3F (tree-shakeable)
extend({ AnimatedSprite2D })

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

// Animation definitions
const animationSet: AnimationSetDefinition = {
  fps: 10,
  animations: {
    idle: {
      frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
      fps: 8,
      loop: true,
    },
    run: {
      frames: [
        'run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7',
        'run_8', 'run_9', 'run_10', 'run_11', 'run_12', 'run_13', 'run_14', 'run_15',
      ],
      fps: 12,
      loop: true,
    },
    roll: {
      frames: ['roll_0', 'roll_1', 'roll_2', 'roll_3', 'roll_4', 'roll_5', 'roll_6', 'roll_7'],
      fps: 15,
      loop: true,
    },
    hit: {
      frames: ['hit_0', 'hit_1', 'hit_2', 'hit_3'],
      fps: 10,
      loop: false,
    },
    death: {
      frames: ['death_0', 'death_1', 'death_2', 'death_3'],
      fps: 8,
      loop: false,
    },
  },
}

interface KnightProps {
  animation: string
  speed: number
  onAnimationComplete: () => void
}

function Knight({ animation, speed, onAnimationComplete }: KnightProps) {
  const ref = useRef<AnimatedSprite2D>(null)
  const sheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const lastAnimation = useRef(animation)

  // Update animation when it changes
  if (ref.current && lastAnimation.current !== animation) {
    ref.current.play(animation, {
      onComplete: () => {
        if (animation === 'hit' || animation === 'death') {
          onAnimationComplete()
        }
      },
    })
    lastAnimation.current = animation
  }

  // Update speed
  if (ref.current) {
    ref.current.speed = speed
  }

  // Update animation each frame
  useFrame((_, delta) => {
    ref.current?.update(delta * 1000)
  })

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={sheet}
      animationSet={animationSet}
      animation="idle"
      layer={Layers.ENTITIES}
      anchor={[0.5, 0.5]}
      scale={[128, 128, 1]}
    />
  )
}

function Scene() {
  const { pane, stats } = usePane()
  const animFolder = usePaneFolder(pane, 'Animation', { expanded: true })

  // Use state so changes trigger re-render → Knight gets new props
  const [animation, setAnimation] = useState('idle')
  const [speed, setSpeed] = useState(1)

  // RadioGrid for animation selection
  const animGridRef = useRef<any>(null)
  useEffect(() => {
    if (!animFolder) return
    const names = ['idle', 'run', 'roll', 'hit', 'death']
    const labels = ['Idle', 'Run', 'Roll', 'Hit', 'Death']
    const blade = animFolder.addBlade({
      view: 'radiogrid',
      groupName: 'animation',
      size: [5, 1],
      cells: (x: number) => ({ title: labels[x]!, value: names[x]! }),
      value: 'idle',
      label: 'anim',
    } as any) as any
    animGridRef.current = blade
    blade.on('change', (ev: any) => { setAnimation(ev.value) })
    return () => { blade.dispose(); animGridRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animFolder])

  // RadioGrid for speed selection
  useEffect(() => {
    if (!animFolder) return
    const speeds = [0.5, 1, 1.5, 2, 3]
    const labels = ['0.5x', '1x', '1.5x', '2x', '3x']
    const blade = animFolder.addBlade({
      view: 'radiogrid',
      groupName: 'speed',
      size: [5, 1],
      cells: (x: number) => ({ title: labels[x]!, value: speeds[x]! }),
      value: 1,
      label: 'speed',
    } as any) as any
    blade.on('change', (ev: any) => { setSpeed(ev.value) })
    return () => blade.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animFolder])

  const handleAnimationComplete = useCallback(() => {
    setAnimation('idle')
    // Sync radiogrid
    if (animGridRef.current) {
      animGridRef.current.value.rawValue = 'idle'
    }
  }, [])

  useStatsMonitor(stats)

  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <Suspense fallback={null}>
        <Knight
          animation={animation}
          speed={speed}
          onAnimationComplete={handleAnimationComplete}
        />
      </Suspense>
    </>
  )
}

export default function App() {
  return (
    <>
      {/* Attribution */}
      <div
        style={{
          position: 'fixed',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#555',
          fontSize: 9,
          fontFamily: 'monospace',
          zIndex: 100,
          whiteSpace: 'nowrap',
        }}
      >
        Knight sprite by{' '}
        <a
          href="https://analogstudios.itch.io/camelot"
          target="_blank"
          style={{ color: '#777' }}
        >
          analogStudios_
        </a>{' '}
        (CC0)
      </div>

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
        <OrthoCamera viewSize={200} />
        <Scene />
      </Canvas>
    </>
  )
}
