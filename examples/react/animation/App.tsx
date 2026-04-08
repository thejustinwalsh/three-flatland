import { Suspense, useRef, useCallback, useEffect } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import {
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import { usePane, usePaneInput, usePaneFolder } from '@three-flatland/tweakpane/react'

// Register AnimatedSprite2D with R3F (tree-shakeable)
extend({ AnimatedSprite2D })

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
        'run_0',
        'run_1',
        'run_2',
        'run_3',
        'run_4',
        'run_5',
        'run_6',
        'run_7',
        'run_8',
        'run_9',
        'run_10',
        'run_11',
        'run_12',
        'run_13',
        'run_14',
        'run_15',
      ],
      fps: 12,
      loop: true,
    },
    roll: {
      frames: [
        'roll_0',
        'roll_1',
        'roll_2',
        'roll_3',
        'roll_4',
        'roll_5',
        'roll_6',
        'roll_7',
      ],
      fps: 15,
      loop: true,
    },
    hit: {
      frames: ['hit_0', 'hit_1', 'hit_2', 'hit_3'],
      fps: 10,
      loop: false,
    },
    death: {
      frames: [
        'death_0',
        'death_1',
        'death_2',
        'death_3',
      ],
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
        // Return to idle after non-looping animations
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
  const { pane, fpsGraph } = usePane()
  const animFolder = usePaneFolder(pane, 'Animation')

  const [animation, setAnimation] = usePaneInput(animFolder, 'animation', 'idle', {
    options: { Idle: 'idle', Run: 'run', Roll: 'roll', Hit: 'hit', Death: 'death' },
  })

  const [speed] = usePaneInput(animFolder, 'speed', 1, {
    options: { '0.5x': 0.5, '1x': 1, '1.5x': 1.5, '2x': 2, '3x': 3 },
  })

  // Draw calls monitor
  const gl = useThree((s) => s.gl)
  const drawCallsParams = useRef({ drawCalls: 0 })
  const drawBindingRef = useRef<{ refresh(): void; dispose(): void } | null>(null)

  useEffect(() => {
    if (!pane) return
    const binding = pane.addBinding(drawCallsParams.current, 'drawCalls', {
      readonly: true,
      label: 'draws',
    })
    drawBindingRef.current = binding as unknown as { refresh(): void; dispose(): void }
    return () => {
      binding.dispose()
      drawBindingRef.current = null
    }
  }, [pane])

  const handleAnimationComplete = useCallback(() => {
    setAnimation('idle')
  }, [setAnimation])

  const fpsRef = useRef(fpsGraph)
  fpsRef.current = fpsGraph

  useFrame(() => {
    fpsRef.current?.begin()
  }, -Infinity)

  useFrame(() => {
    fpsRef.current?.end()
    // Update draw calls
    drawCallsParams.current.drawCalls = (gl.info.render as any).drawCalls as number
    drawBindingRef.current?.refresh()
  }, Infinity)

  return (
    <>
      <color attach="background" args={['#1a1a2e']} />
      <Suspense fallback={null}>
        <Knight
          animation={animation}
          speed={speed as number}
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
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <Scene />
      </Canvas>
    </>
  )
}
