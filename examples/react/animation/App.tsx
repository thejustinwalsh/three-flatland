import { Suspense, useRef, useState, use, useCallback } from 'react'
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber/webgpu'
import { NearestFilter } from 'three'
import {
  AnimatedSprite2D,
  SpriteSheetLoader,
  Layers,
  type AnimationSetDefinition,
} from '@three-flatland/react'

import '@shoelace-style/shoelace/dist/themes/dark.css'
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js'
import SlRadioGroup from '@shoelace-style/shoelace/dist/react/radio-group/index.js'
import SlRadioButton from '@shoelace-style/shoelace/dist/react/radio-button/index.js'
setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/')

const SPEEDS = [0.5, 1, 1.5, 2, 3]

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
  onAnimationComplete: () => void
}

function Knight({ animation, speed, onAnimationComplete }: KnightProps) {
  const ref = useRef<AnimatedSprite2D>(null)
  const sheet = use(knightSheetPromise)
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

function StatsTracker({ onStats }: { onStats: (fps: number, draws: number) => void }) {
  const gl = useThree((s) => s.gl)
  const frameCount = useRef(0)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    frameCount.current++
    elapsed.current += delta
    if (elapsed.current >= 1) {
      // Cast: R3F types gl as WebGLRenderer, but we use WebGPURenderer which has drawCalls
      const draws = (gl.info.render as any).drawCalls as number
      onStats(Math.round(frameCount.current / elapsed.current), draws)
      frameCount.current = 0
      elapsed.current = 0
    }
  })
  return null
}

export default function App() {
  const [animation, setAnimation] = useState('idle')
  const [speedIndex, setSpeedIndex] = useState(1)
  const speed = SPEEDS[speedIndex]!
  const [stats, setStats] = useState({ fps: '-' as string | number, draws: '-' as string | number })
  const handleStats = useCallback((fps: number, draws: number) => setStats({ fps, draws }), [])

  const handleAnimationComplete = useCallback(() => {
    setAnimation('idle')
  }, [])

  return (
    <>
      {/* Hide radio group label */}
      <style>{`
        .anim-bar sl-radio-group::part(form-control-label) { display: none; }
        .anim-bar sl-radio-group::part(form-control) { margin: 0; border: 0; padding: 0; }
      `}</style>

      {/* Controls — centered bottom bar */}
      <div
        className="anim-bar"
        style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          '--sl-input-height-small': '1.5rem',
          '--sl-font-size-small': '0.688rem',
        } as React.CSSProperties}
      >
        <SlRadioGroup
          label="Animation"
          size="small"
          value={animation}
          onSlChange={(e: Event) =>
            setAnimation((e.target as HTMLInputElement).value)
          }
        >
          <SlRadioButton size="small" pill value="idle">Idle</SlRadioButton>
          <SlRadioButton size="small" pill value="run">Run</SlRadioButton>
          <SlRadioButton size="small" pill value="roll">Roll</SlRadioButton>
          <SlRadioButton size="small" pill value="hit">Hit</SlRadioButton>
          <SlRadioButton size="small" pill value="death">Death</SlRadioButton>
        </SlRadioGroup>
        <button
          onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: 12,
            color: '#ccc',
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '4px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {speed}x
        </button>
      </div>

      {/* Attribution — centered bottom */}
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

      {/* Stats overlay */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          padding: '5px 10px',
          background: 'rgba(0, 2, 28, 0.7)',
          borderRadius: 6,
          color: '#4a9eff',
          fontFamily: 'monospace',
          fontSize: 10,
          lineHeight: 1.5,
          zIndex: 100,
          whiteSpace: 'pre',
        }}
      >
        {`FPS: ${stats.fps}\nDraws: ${stats.draws}`}
      </div>

      {/* Three.js Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <StatsTracker onStats={handleStats} />
        <Suspense fallback={null}>
          <Knight
            animation={animation}
            speed={speed}
            onAnimationComplete={handleAnimationComplete}
          />
        </Suspense>
      </Canvas>
    </>
  )
}
