import { Suspense, useRef, useEffect, useState, useMemo, use } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import { PostProcessing } from 'three/webgpu'
import { pass, uv, uniform } from 'three/tsl'
import { NearestFilter, Vector4 } from 'three'
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
  chromaticAberration,
  // Blur/post effects
  vignette,
  filmGrain,
  type SpriteSheet,
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

// Load sprite sheet (React 19 resource pattern)
const spriteSheetPromise = SpriteSheetLoader.load('./sprites/knight.json').then(
  (sheet) => {
    sheet.texture.minFilter = NearestFilter
    sheet.texture.magFilter = NearestFilter
    return sheet
  }
)

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

function FlatlandScene({ effect }: FlatlandSceneProps) {
  const spriteSheet = use(spriteSheetPromise) as SpriteSheet
  const { gl, size } = useThree()
  const flatlandRef = useRef<Flatland>(null)
  const postProcessingRef = useRef<PostProcessing | null>(null)

  // Create post-processing and connect to Flatland
  useEffect(() => {
    const flatland = flatlandRef.current
    if (!flatland) return

    const postProcessing = new PostProcessing(gl)
    const scenePass = pass(flatland.scene, flatland.camera)

    postProcessingRef.current = postProcessing
    flatland.setPostProcessing(postProcessing, scenePass)

    return () => {
      postProcessing.dispose?.()
    }
  }, [gl])

  // Update effect when it changes
  useEffect(() => {
    const flatland = flatlandRef.current
    const postProcessing = postProcessingRef.current
    if (!flatland || !postProcessing) return

    const scenePass = pass(flatland.scene, flatland.camera)

    // Effect functions that create TSL nodes
    const effectNodes: Record<EffectType, () => ReturnType<typeof pass>> = {
      none: () => scenePass,

      crt: () => crtComplete(scenePass, uv(), {
        curvature: 0.15,
        vignetteStrength: 0.3,
        scanlineIntensity: 0.15,
        scanlineCount: 240,
      }),

      dmg: () => {
        const palette = dmgPalette(scenePass)
        return dotMatrix(palette, uv(), {
          gridSize: 3,
          dotSize: 0.7,
          dotColor: [0.6, 0.7, 0.5, 1],
          bgColor: [0.5, 0.6, 0.4, 1],
        })
      },

      gbc: () => lcdGBC(scenePass, uv(), {
        gridSize: 3,
        subpixelBlend: 0.5,
        brightness: 1.1,
      }),

      vhs: () => {
        const distorted = vhsDistortion(scenePass, uv(), timeUniform, {
          trackingNoise: 0.02,
          jitter: 0.001,
          waveSpeed: 2.0,
        })
        const noisy = staticNoise(distorted, uv(), timeUniform, {
          intensity: 0.08,
          flickerSpeed: 15,
        })
        return chromaticAberration(noisy, uv(), {
          offsetR: [0.003, 0],
          offsetB: [-0.003, 0],
        })
      },

      lcd: () => lcdGrid(scenePass, uv(), {
        gridSize: 3,
        lineWidth: 0.2,
        lineColor: [0, 0, 0, 0.3],
      }),

      arcade: () => {
        const withPhosphor = phosphorMask(scenePass, uv(), {
          type: 'aperture-grille',
          scale: 3,
          intensity: 0.15,
        })
        return scanlines(withPhosphor, uv(), {
          count: 240,
          intensity: 0.2,
          offset: timeUniform.mul(0.5),
        })
      },

      film: () => {
        const grained = filmGrain(scenePass, uv(), timeUniform, {
          intensity: 0.15,
          luminanceThreshold: 0.3,
        })
        return vignette(grained, uv(), {
          offset: 0.5,
          darkness: 0.6,
        })
      },
    }

    postProcessing.outputNode = effectNodes[effect]()
  }, [effect])

  // Handle resize
  useEffect(() => {
    flatlandRef.current?.resize(size.width, size.height)
  }, [size.width, size.height])

  // Render loop
  useFrame((_, delta) => {
    const flatland = flatlandRef.current
    if (!flatland) return

    // Update time uniform
    timeUniform.value += delta

    // Update sprite batches
    flatland.spriteGroup.update()

    // Render with post-processing
    postProcessingRef.current?.render()
  }, 1) // Priority 1 to render after scene updates

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
