import { Suspense, useRef, useState, use } from 'react'
import { Canvas, extend, useFrame } from '@react-three/fiber/webgpu'
import { NearestFilter } from 'three'
import {
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
  type AnimationSetDefinition,
} from '@three-flatland/core'
// Import for ThreeElements type augmentation
import type {} from '@three-flatland/react'

// Register AnimatedSprite2D with R3F (tree-shakeable)
extend({ AnimatedSprite2D })

// Load the knight spritesheet (React 19 resource pattern)
const knightSheetPromise = SpriteSheetLoader.load('./sprites/knight.json').then(
  (sheet) => {
    // Use nearest neighbor filtering for pixel art
    sheet.texture.minFilter = NearestFilter
    sheet.texture.magFilter = NearestFilter
    return sheet
  }
)

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
  onAnimationComplete?: () => void
}

function Knight({ animation, speed, onAnimationComplete }: KnightProps) {
  const ref = useRef<AnimatedSprite2D>(null)
  const sheet = use(knightSheetPromise)
  const lastAnimation = useRef(animation)

  // Update animation when it changes
  if (ref.current && lastAnimation.current !== animation) {
    ref.current.play(animation, {
      onComplete: onAnimationComplete,
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

const animations = ['idle', 'run', 'roll', 'hit', 'death'] as const
const animationLabels = ['Idle', 'Run', 'Roll', 'Hit', 'Death'] as const
const speeds = [0.5, 1, 2, 3] as const

export default function App() {
  const [currentAnim, setCurrentAnim] = useState<string>('idle')
  const [speedIndex, setSpeedIndex] = useState(1)

  const handleAnimationComplete = () => {
    // Return to idle after non-looping animations
    if (currentAnim === 'hit' || currentAnim === 'death') {
      setCurrentAnim('idle')
    }
  }

  return (
    <>
      {/* UI Controls */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          color: '#4a9eff',
          fontSize: 12,
          fontFamily: 'monospace',
          zIndex: 100,
        }}
      >
        Animation: {currentAnim}
        <br />
        Speed: {speeds[speedIndex]}x
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#666',
          fontSize: 10,
          fontFamily: 'monospace',
          textAlign: 'center',
          zIndex: 100,
        }}
      >
        Knight sprite by{' '}
        <a
          href="https://analogstudios.itch.io/camelot"
          target="_blank"
          style={{ color: '#888' }}
        >
          analogStudios_
        </a>{' '}
        (CC0)
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          zIndex: 100,
        }}
      >
        {animations.map((anim, i) => (
          <button
            key={anim}
            onClick={() => setCurrentAnim(anim)}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontFamily: 'monospace',
              border: '2px solid #4a9eff',
              background:
                currentAnim === anim ? '#4a9eff' : 'rgba(74, 158, 255, 0.1)',
              color: currentAnim === anim ? '#1a1a2e' : '#4a9eff',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            {animationLabels[i]}
          </button>
        ))}
        <button
          onClick={() => setSpeedIndex((i) => (i + 1) % speeds.length)}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontFamily: 'monospace',
            border: '2px solid #4a9eff',
            background: 'rgba(74, 158, 255, 0.1)',
            color: '#4a9eff',
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          Speed: {speeds[speedIndex]}x
        </button>
      </div>

      {/* Three.js Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <Suspense fallback={null}>
          <Knight
            animation={currentAnim}
            speed={speeds[speedIndex]}
            onAnimationComplete={handleAnimationComplete}
          />
        </Suspense>
      </Canvas>
    </>
  )
}
