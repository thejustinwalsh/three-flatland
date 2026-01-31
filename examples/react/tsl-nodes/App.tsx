import { Suspense, useMemo, use, useRef, useImperativeHandle, forwardRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  texture as sampleTexture,
  uv,
  uniform,
  vec2,
  vec4,
  float,
  If,
  Discard,
  Fn,
} from 'three/tsl'
import {
  NearestFilter,
  PlaneGeometry,
  CanvasTexture,
  RepeatWrapping,
  Vector4,
} from 'three'
import {
  SpriteSheetLoader,
  sampleSprite,
  spriteUV,
  tint,
  tintAdditive,
  hueShift,
  saturate,
  outline8,
  pixelate,
  dissolvePixelated,
  type SpriteSheet,
} from '@three-flatland/react'

import '@shoelace-style/shoelace/dist/themes/dark.css'
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js'
import SlRadioGroup from '@shoelace-style/shoelace/dist/react/radio-group/index.js'
import SlRadioButton from '@shoelace-style/shoelace/dist/react/radio-button/index.js'
setBasePath('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/')

// Effect types
type EffectType =
  | 'normal'
  | 'damage'
  | 'dissolve'
  | 'powerup'
  | 'petrify'
  | 'select'
  | 'shadow'
  | 'pixelate'

const effectLabels: Record<EffectType, string> = {
  normal: 'Normal',
  damage: 'Damage',
  dissolve: 'Dissolve',
  powerup: 'Rainbow',
  petrify: 'Stone',
  select: 'Outline',
  shadow: 'Shadow',
  pixelate: 'Pixelate',
}

// Animation definitions
interface Animation {
  frames: string[]
  fps: number
  loop: boolean
}

const animations: Record<string, Animation> = {
  idle: {
    frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
    fps: 8,
    loop: true,
  },
  run: {
    frames: ['run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7',
             'run_8', 'run_9', 'run_10', 'run_11', 'run_12', 'run_13', 'run_14', 'run_15'],
    fps: 16,
    loop: true,
  },
  roll: {
    frames: ['roll_0', 'roll_1', 'roll_2', 'roll_3', 'roll_4', 'roll_5', 'roll_6', 'roll_7'],
    fps: 12,
    loop: true,
  },
  hit: {
    frames: ['hit_0', 'hit_1', 'hit_2', 'hit_3'],
    fps: 12,
    loop: false,
  },
  death: {
    frames: ['death_0', 'death_1', 'death_2', 'death_3'],
    fps: 6,
    loop: false,
  },
}

// Map effects to animations
const effectAnimations: Record<EffectType, string> = {
  normal: 'idle',
  damage: 'hit',
  dissolve: 'death',
  powerup: 'run',
  petrify: 'idle',
  select: 'idle',
  shadow: 'roll',
  pixelate: 'roll',
}

// Generate a noise texture for dissolve effect
function createNoiseTexture(size = 256): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(size, size)

  for (let i = 0; i < imageData.data.length; i += 4) {
    const value = Math.random() * 255
    imageData.data[i] = value
    imageData.data[i + 1] = value
    imageData.data[i + 2] = value
    imageData.data[i + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

// Load sprite sheet (React 19 resource pattern)
const spriteSheetPromise = SpriteSheetLoader.load('./sprites/knight.json').then(
  (sheet) => {
    sheet.texture.minFilter = NearestFilter
    sheet.texture.magFilter = NearestFilter
    return sheet
  }
)

// Create shared geometry
const sharedGeometry = new PlaneGeometry(1, 1)

// Helper to create base material
function createBaseMaterial(): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial()
  mat.transparent = true
  mat.depthWrite = true
  mat.depthTest = true
  return mat
}

interface EffectSpriteProps {
  effect: EffectType
}

interface EffectSpriteHandle {
  play: (effect: EffectType) => void
}

const EffectSprite = forwardRef<EffectSpriteHandle, EffectSpriteProps>(
  function EffectSprite({ effect }, ref) {
    const spriteSheet = use(spriteSheetPromise) as SpriteSheet

    // Animation state
    const animState = useRef({
      currentAnimation: 'idle',
      currentFrameIndex: 0,
      frameTimer: 0,
      frozen: false,
      forceNoLoop: false,
    })

    // Track current effect for animation loop
    const currentEffectRef = useRef<EffectType>(effect)
    currentEffectRef.current = effect

    // Create noise texture (memoized)
    const noiseTexture = useMemo(() => {
      const tex = createNoiseTexture()
      tex.minFilter = NearestFilter
      tex.magFilter = NearestFilter
      return tex
    }, [])

    // Create uniforms (memoized)
    const uniforms = useMemo(
      () => ({
        time: uniform(0),
        dissolveProgress: uniform(0),
        damageFlash: uniform(0),
        pixelateProgress: uniform(0),
        frame: uniform(new Vector4(0, 0, 0.125, 0.125)),
      }),
      []
    )

    // Track effect start time
    const effectStartTime = useRef(0)

    // Helper to set frame
    const setFrame = (frameName: string) => {
      const frame = spriteSheet.getFrame(frameName)
      uniforms.frame.value.set(frame.x, frame.y, frame.width, frame.height)
    }

    // Play effect (can be called multiple times)
    const playEffect = (eff: EffectType) => {
      const animName = effectAnimations[eff]
      const anim = animations[animName]!

      animState.current.currentAnimation = animName
      animState.current.currentFrameIndex = 0
      animState.current.frameTimer = 0
      animState.current.frozen = eff === 'petrify'
      animState.current.forceNoLoop = eff === 'pixelate'

      setFrame(anim.frames[0]!)

      // Reset effect-specific uniforms
      effectStartTime.current = uniforms.time.value

      if (eff === 'dissolve') {
        uniforms.dissolveProgress.value = 0
      }
      if (eff === 'damage') {
        uniforms.damageFlash.value = 1
      }
      if (eff === 'pixelate') {
        uniforms.pixelateProgress.value = 0
      }
    }

    // Expose play method via ref
    useImperativeHandle(ref, () => ({
      play: playEffect,
    }))

  // Create all materials (memoized)
  const materials = useMemo(() => {
    // Shorthand for sampling sprite with alpha test
    const sample = () => sampleSprite(spriteSheet.texture, uniforms.frame, { alphaTest: 0.01 })

    // Normal
    const normal = createBaseMaterial()
    normal.colorNode = sample()

    // Damage - one-shot white flash
    const damage = createBaseMaterial()
    damage.colorNode = Fn(() => {
      const color = sample()
      return tintAdditive(color, [1, 1, 1], uniforms.damageFlash)
    })()

    // Dissolve - pixelated dissolve
    const dissolve = createBaseMaterial()
    dissolve.colorNode = Fn(() => {
      const color = sample()
      return dissolvePixelated(color, uv(), uniforms.dissolveProgress, noiseTexture, 16)
    })()

    // Power-up - rainbow hue shift
    const powerup = createBaseMaterial()
    powerup.colorNode = Fn(() => {
      const color = sample()
      return hueShift(color, uniforms.time.mul(float(3)))
    })()

    // Petrify - grayscale
    const petrify = createBaseMaterial()
    petrify.colorNode = Fn(() => {
      const color = sample()
      return saturate(color, 0)
    })()

    // Select - outline (needs UV for neighbor sampling)
    const select = createBaseMaterial()
    select.colorNode = Fn(() => {
      const frameUV = spriteUV(uniforms.frame)
      const color = sampleTexture(spriteSheet.texture, frameUV)
      return outline8(color, frameUV, spriteSheet.texture, {
        color: [0.3, 1, 0.3, 1],
        thickness: 0.003,
      })
    })()

    // Shadow - dark blue tint
    const shadow = createBaseMaterial()
    shadow.colorNode = Fn(() => {
      const color = sample()
      const darkened = tint(
        tintAdditive(color, [0, 0, 0.2], 0.3),
        [0.2, 0.2, 0.4]
      )
      return vec4(darkened.rgb, color.a.mul(float(0.6)))
    })()

    // Pixelate - one-shot teleport effect
    const pixelateMat = createBaseMaterial()
    pixelateMat.colorNode = Fn(() => {
      const pixelAmount = float(1).sub(uniforms.pixelateProgress.mul(float(2)).sub(float(1)).abs())
      const pixelCount = float(32).sub(pixelAmount.mul(float(28)))

      const pixelatedUV = pixelate(uv(), vec2(pixelCount, pixelCount))
      const frameOffset = vec2(uniforms.frame.x, uniforms.frame.y)
      const frameSize = vec2(uniforms.frame.z, uniforms.frame.w)
      const frameUV = pixelatedUV.mul(frameSize).add(frameOffset)
      const color = sampleTexture(spriteSheet.texture, frameUV)
      If(color.a.lessThan(float(0.01)), () => {
        Discard()
      })
      return color
    })()

    return {
      normal,
      damage,
      dissolve,
      powerup,
      petrify,
      select,
      shadow,
      pixelate: pixelateMat,
    } as Record<EffectType, MeshBasicNodeMaterial>
  }, [spriteSheet, noiseTexture, uniforms])

  // Animation loop
  useFrame((_, delta) => {
    uniforms.time.value += delta

    // Update sprite animation (unless frozen)
    if (!animState.current.frozen) {
      const anim = animations[animState.current.currentAnimation]!
      animState.current.frameTimer += delta * 1000

      const frameDuration = 1000 / anim.fps
      if (animState.current.frameTimer >= frameDuration) {
        animState.current.frameTimer -= frameDuration
        animState.current.currentFrameIndex++

        if (animState.current.currentFrameIndex >= anim.frames.length) {
          if (anim.loop && !animState.current.forceNoLoop) {
            animState.current.currentFrameIndex = 0
          } else {
            animState.current.currentFrameIndex = anim.frames.length - 1
            // Return to idle after one-shot animations
            if (currentEffectRef.current === 'damage' || currentEffectRef.current === 'pixelate') {
              animState.current.currentAnimation = 'idle'
              animState.current.currentFrameIndex = 0
              animState.current.forceNoLoop = false
            }
          }
        }

        setFrame(anim.frames[animState.current.currentFrameIndex]!)
      }
    }

    // Animate one-shot effects
    const effectElapsed = uniforms.time.value - effectStartTime.current
    const eff = currentEffectRef.current

    if (eff === 'damage') {
      uniforms.damageFlash.value = Math.max(0, 1 - effectElapsed / 0.3)
    }

    if (eff === 'dissolve') {
      uniforms.dissolveProgress.value = Math.min(1, effectElapsed / 1.5)
    }

    if (eff === 'pixelate') {
      uniforms.pixelateProgress.value = Math.min(1, effectElapsed / 1.0)
    }
  })

    return (
      <mesh
        geometry={sharedGeometry}
        material={materials[effect]}
        scale={[128, 128, 1]}
      />
    )
  }
)

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
  const [effect, setEffect] = useState<EffectType>('normal')
  const spriteRef = useRef<EffectSpriteHandle>(null)
  const prevEffectRef = useRef(effect)
  const [stats, setStats] = useState({ fps: '-' as string | number, draws: '-' as string | number })
  const handleStats = useCallback((fps: number, draws: number) => setStats({ fps, draws }), [])

  // Trigger play when effect changes (including re-trigger via store)
  useEffect(() => {
    if (prevEffectRef.current !== effect) {
      spriteRef.current?.play(effect)
      prevEffectRef.current = effect
    }
  }, [effect])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, EffectType> = {
        '1': 'normal',
        '2': 'damage',
        '3': 'dissolve',
        '4': 'powerup',
        '5': 'petrify',
        '6': 'select',
        '7': 'shadow',
        '8': 'pixelate',
      }
      if (keyMap[e.key]) {
        setEffect(keyMap[e.key]!)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      {/* Hide radio group label via shadow DOM part */}
      <style>{`
        .effect-bar sl-radio-group::part(form-control-label) { display: none; }
        .effect-bar sl-radio-group::part(form-control) { margin: 0; border: 0; padding: 0; }
      `}</style>

      {/* Stats overlay with keyboard hint */}
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
        {`FPS: ${stats.fps}\nDraws: ${stats.draws}\n`}<span style={{ color: '#555' }}>1–8</span>
      </div>

      {/* Effect picker — centered, floating, game-like */}
      <div
        className="effect-bar"
        style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'auto',
          '--sl-input-height-small': '1.5rem',
          '--sl-font-size-small': '0.688rem',
        } as React.CSSProperties}
      >
        <SlRadioGroup label="Effect" size="small" value={effect} onSlChange={(e: Event) => setEffect((e.target as HTMLInputElement).value as EffectType)}>
          {(Object.entries(effectLabels) as [EffectType, string][]).map(([value, label]) => (
            <SlRadioButton key={value} value={value} size="small" pill>{label}</SlRadioButton>
          ))}
        </SlRadioGroup>
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

      {/* Three.js Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <StatsTracker onStats={handleStats} />
        <Suspense fallback={null}>
          <EffectSprite ref={spriteRef} effect={effect} />
        </Suspense>
      </Canvas>
    </>
  )
}
