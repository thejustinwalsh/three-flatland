import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import { uniform, float, floor, vec2 } from 'three/tsl'
import {
  Flatland,
  Sprite2D,
  SpriteSheetLoader,
  // Display effects
  crtComplete,
  scanlines,
  phosphorMask,
  lcdGrid,
  lcdGBC,
  dotMatrix,
  // Retro palettes
  dmgPalette,
  // Analog effects
  vhsDistortion,
  staticNoise,
  // Blur/post effects
  vignette,
  filmGrain,
  type SpriteSheet,
  type EffectFn,
} from '@three-flatland/react'

// Register Flatland and Sprite2D with R3F
extend({ Flatland, Sprite2D })

type EffectType = 'none' | 'crt' | 'dmg' | 'gbc' | 'vhs' | 'lcd' | 'arcade' | 'film'

const effectLabels: Record<EffectType, string> = {
  none: 'None',
  crt: 'CRT TV',
  dmg: 'Game Boy',
  gbc: 'Game Boy Color',
  vhs: 'VHS Tape',
  lcd: 'LCD Monitor',
  arcade: 'Arcade CRT',
  film: 'Film',
}

// Animation definitions
const animations = {
  idle: {
    frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
    fps: 8,
  },
  run: {
    frames: [
      'run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7',
      'run_8', 'run_9', 'run_10', 'run_11', 'run_12', 'run_13', 'run_14', 'run_15',
    ],
    fps: 16,
  },
}

// Time uniform shared across components
const timeUniform = uniform(0)

// Sprite positions
const positions: [number, number][] = [
  [-80, 0],
  [0, 0],
  [80, 0],
]

interface AnimatedSpriteProps {
  spriteSheet: SpriteSheet
  position: [number, number]
  animationOffset: number
}

function AnimatedSprite({ spriteSheet, position, animationOffset }: AnimatedSpriteProps) {
  const spriteRef = useRef<Sprite2D>(null)
  const animStateRef = useRef({
    animation: 'idle',
    frameIndex: 0,
    timer: 0,
  })

  useFrame((_, delta) => {
    const sprite = spriteRef.current
    if (!sprite) return

    const state = animStateRef.current
    const anim = animations[state.animation as keyof typeof animations]

    state.timer += delta * 1000
    const frameDuration = 1000 / anim.fps

    if (state.timer >= frameDuration) {
      state.timer -= frameDuration
      state.frameIndex = (state.frameIndex + 1) % anim.frames.length
    }

    sprite.setFrame(spriteSheet.getFrame(anim.frames[state.frameIndex]))

    // Gentle bobbing movement
    sprite.position.y = Math.sin(timeUniform.value * 2 + animationOffset) * 10
  })

  return (
    <sprite2D
      ref={spriteRef}
      texture={spriteSheet.texture}
      frame={spriteSheet.getFrame('idle_0')}
      position={[position[0], position[1], 0]}
      scale={[64, 64, 1]}
    />
  )
}

interface FlatlandSceneProps {
  effect: EffectType
}

/**
 * Build an EffectFn for the given effect type, or null for 'none'.
 * Each EffectFn receives (input, uv) from Flatland's effect chain.
 */
function buildEffectFn(
  effect: EffectType,
  time: ReturnType<typeof uniform>
): EffectFn | null {
  switch (effect) {
    case 'crt':
      return (input, uvCoord) => crtComplete(input, uvCoord, {
        curvature: 0.15,
        vignetteIntensity: 0.3,
        scanlineIntensity: 0.15,
        scanlineRes: 240,
      })

    case 'dmg':
      return (input, uvCoord) => {
        // Pixelate by snapping UVs to 160-wide pixel grid
        const res = float(160)
        const pixelSize = float(1).div(res)
        const pixelatedUV = floor(uvCoord.mul(res)).add(0.5).div(res)

        // Sample center and neighbors — simulates slow LCD response / ghosting
        const center = input.sample(pixelatedUV)
        const left = input.sample(pixelatedUV.sub(vec2(pixelSize, 0)))
        const right = input.sample(pixelatedUV.add(vec2(pixelSize, 0)))
        const up = input.sample(pixelatedUV.add(vec2(0, pixelSize)))
        const down = input.sample(pixelatedUV.sub(vec2(0, pixelSize)))

        const ghost = float(0.08)
        const ghosted = center.mul(float(1).sub(ghost.mul(4)))
          .add(left.mul(ghost))
          .add(right.mul(ghost))
          .add(up.mul(ghost))
          .add(down.mul(ghost))

        // Apply DMG 4-color green palette
        const palette = dmgPalette(ghosted)
        // Square pixel grid on green LCD background
        return dotMatrix(palette, uvCoord, 160, 0.85, [0.61, 0.73, 0.06])
      }

    case 'gbc':
      return (input, uvCoord) => lcdGBC(input, uvCoord, 160, 0.2)

    case 'vhs':
      return (input, uvCoord) => {
        // vhsDistortion includes built-in color channel separation
        const distorted = vhsDistortion(input, uvCoord, time, 0.02, 0.1)
        return staticNoise(distorted, uvCoord, time, 0.08)
      }

    case 'lcd':
      return (input, uvCoord) => lcdGrid(input, uvCoord, 240, 0.15, 0.1)

    case 'arcade':
      return (input, uvCoord) => {
        const withPhosphor = phosphorMask(input, uvCoord, 'aperture', 640, 0.15)
        return scanlines(withPhosphor, uvCoord, 240, 0.2, time.mul(0.5))
      }

    case 'film':
      return (input, uvCoord) => {
        const grained = filmGrain(input, uvCoord, time, 0.15, 0.3)
        return vignette(grained, uvCoord, 0.6, 0.5)
      }

    case 'none':
    default:
      return null
  }
}

function FlatlandScene({ effect }: FlatlandSceneProps) {
  const spriteSheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
  const { gl, size } = useThree()
  const flatlandRef = useRef<Flatland>(null)

  // Update effect chain when effect changes
  // Flatland auto-creates PostProcessing during render() when effects are present
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return

    flatland.clearEffects()

    const effectFn = buildEffectFn(effect, timeUniform)
    if (effectFn) {
      flatland.addEffect(effectFn)
    }
  }, [effect])

  // Handle resize
  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Render loop — Flatland.render() handles batch updates + post-processing
  useFrame((_, delta) => {
    const flatland = flatlandRef.current
    if (!flatland) return

    timeUniform.value += delta
    flatland.render(gl)
  }, 1) // Priority 1 to take over rendering from R3F

  return (
    <flatland
      ref={flatlandRef}
      viewSize={300}
      clearColor={0x1a1a2e}
    >
      {positions.map((pos, i) => (
        <AnimatedSprite
          key={i}
          spriteSheet={spriteSheet}
          position={pos}
          animationOffset={i * 0.7}
        />
      ))}
    </flatland>
  )
}

const effects: EffectType[] = ['none', 'crt', 'dmg', 'gbc', 'vhs', 'lcd', 'arcade', 'film']

export default function App() {
  const [currentEffect, setCurrentEffect] = useState<EffectType>('none')

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, EffectType> = {
        '1': 'none',
        '2': 'crt',
        '3': 'dmg',
        '4': 'gbc',
        '5': 'vhs',
        '6': 'lcd',
        '7': 'arcade',
        '8': 'film',
      }
      if (keyMap[e.key]) {
        setCurrentEffect(keyMap[e.key])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      {/* UI Controls */}
      <div
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          color: '#4a9eff',
          fontSize: 14,
          fontFamily: 'monospace',
          zIndex: 100,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
          {effectLabels[currentEffect]}
        </div>
        <div style={{ color: '#666', fontSize: 11 }}>Press 1-8 to change effects</div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '90vw',
          zIndex: 100,
        }}
      >
        {effects.map((effect, i) => (
          <button
            key={effect}
            onClick={() => setCurrentEffect(effect)}
            style={{
              padding: '10px 16px',
              fontSize: 12,
              fontFamily: 'monospace',
              border: '2px solid #4a9eff',
              background:
                currentEffect === effect
                  ? '#4a9eff'
                  : 'rgba(74, 158, 255, 0.1)',
              color: currentEffect === effect ? '#1a1a2e' : '#4a9eff',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            {i + 1}: {effectLabels[effect]}
          </button>
        ))}
      </div>

      {/* Three.js Canvas */}
      <Canvas
        gl={{ antialias: false }}
        frameloop="always"
      >
        <Suspense fallback={null}>
          <FlatlandScene effect={currentEffect} />
        </Suspense>
      </Canvas>
    </>
  )
}
