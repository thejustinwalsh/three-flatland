import { Suspense, useMemo, use, useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import {
  texture as sampleTexture,
  uv,
  attribute,
  vec2,
  vec4,
  float,
} from 'three/tsl'
import {
  NearestFilter,
  CanvasTexture,
  RepeatWrapping,
} from 'three'
import {
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteSheetLoader,
  createMaterialEffect,
  tintAdditive,
  hueShift,
  saturate,
  outline8,
  pixelate,
  dissolvePixelated,
  tint,
  type SpriteSheet,
  type MaterialEffect,
  type AnimationSetDefinition,
} from '@three-flatland/react'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import WaRadioGroup from '@awesome.me/webawesome/dist/react/radio-group/index.js'
import WaRadio from '@awesome.me/webawesome/dist/react/radio/index.js'

// ========================================
// Types
// ========================================

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

// Animation set
const animationSet: AnimationSetDefinition = {
  animations: {
    idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 8 },
    run: {
      frames: ['run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5', 'run_6', 'run_7',
               'run_8', 'run_9', 'run_10', 'run_11', 'run_12', 'run_13', 'run_14', 'run_15'],
      fps: 16,
    },
    roll: {
      frames: ['roll_0', 'roll_1', 'roll_2', 'roll_3', 'roll_4', 'roll_5', 'roll_6', 'roll_7'],
      fps: 12,
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

// ========================================
// Effect Definitions (no texture closures)
// ========================================

const DamageFlash = createMaterialEffect({
  name: 'damageFlash',
  schema: { intensity: 1 } as const,
  node: ({ inputColor, attrs }) => {
    const flashed = tintAdditive(inputColor, [1, 1, 1], attrs.intensity)
    // Mask to sprite silhouette: premultiplied alpha means RGB must be scaled by alpha
    return vec4(flashed.rgb.mul(inputColor.a), inputColor.a)
  },
})

const Powerup = createMaterialEffect({
  name: 'powerup',
  schema: { angle: 0 } as const,
  node: ({ inputColor, attrs }) =>
    hueShift(inputColor, attrs.angle),
})

const Petrify = createMaterialEffect({
  name: 'petrify',
  schema: { amount: 0 } as const,
  node: ({ inputColor, attrs }) =>
    saturate(inputColor, attrs.amount),
})

const ShadowEffect = createMaterialEffect({
  name: 'shadow',
  schema: { alpha: 0.6 } as const,
  node: ({ inputColor, attrs }) => {
    const darkened = tint(tintAdditive(inputColor, [0, 0, 0.2], 0.3), [0.2, 0.2, 0.4])
    const finalAlpha = inputColor.a.mul(attrs.alpha)
    // Mask to sprite silhouette: premultiplied alpha means RGB must be scaled by finalAlpha
    return vec4(darkened.rgb.mul(finalAlpha), finalAlpha)
  },
})

// ========================================
// Noise texture helper
// ========================================

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

// ========================================
// Load sprite sheet (React 19 resource pattern)
// ========================================

const spriteSheetPromise = SpriteSheetLoader.load('./sprites/knight.json').then(
  (sheet) => {
    sheet.texture.minFilter = NearestFilter
    sheet.texture.magFilter = NearestFilter
    return sheet
  }
)

// ========================================
// EffectSprite component
// ========================================

interface EffectSpriteProps {
  effect: EffectType
}

function EffectSprite({ effect }: EffectSpriteProps) {
  const spriteSheet = use(spriteSheetPromise) as SpriteSheet
  const spriteRef = useRef<AnimatedSprite2D>(null)

  // Create premultiplied material (outline/pixelate need transparent pixels)
  const material = useMemo(
    () =>
      new Sprite2DMaterial({
        map: spriteSheet.texture,
        transparent: true,
        premultipliedAlpha: true,
      }),
    [spriteSheet]
  )

  // Create noise texture (memoized)
  const noiseTexture = useMemo(() => {
    const tex = createNoiseTexture()
    tex.minFilter = NearestFilter
    tex.magFilter = NearestFilter
    return tex
  }, [])

  // Create closure-based effect classes (need spriteSheet/noiseTexture)
  const closureEffects = useMemo(
    () => ({
      Dissolve: createMaterialEffect({
        name: 'dissolve',
        schema: { progress: 0 } as const,
        node: ({ inputColor, attrs }) =>
          dissolvePixelated(inputColor, uv(), attrs.progress, noiseTexture, 16),
      }),
      Select: createMaterialEffect({
        name: 'select',
        schema: { thickness: 0.003 } as const,
        node: ({ inputColor, inputUV, attrs }) =>
          outline8(inputColor, inputUV, spriteSheet.texture, {
            color: [0.3, 1, 0.3, 1],
            thickness: attrs.thickness,
          }),
      }),
      Pixelate: createMaterialEffect({
        name: 'pixelate',
        schema: { progress: 0 } as const,
        node: ({ attrs }) => {
          const instanceUV = attribute('instanceUV', 'vec4')
          const localUV = uv()

          const pixelAmount = float(1).sub(
            attrs.progress.mul(float(2)).sub(float(1)).abs()
          )
          const pixelCount = float(32).sub(pixelAmount.mul(float(28)))

          const pixelatedUV = pixelate(localUV, vec2(pixelCount, pixelCount))
          const frameOffset = vec2(instanceUV.x, instanceUV.y)
          const frameSize = vec2(instanceUV.z, instanceUV.w)
          const frameUV = pixelatedUV.mul(frameSize).add(frameOffset)

          const color = sampleTexture(spriteSheet.texture, frameUV)
          return vec4(color.rgb.mul(color.a), color.a)
        },
      }),
    }),
    [spriteSheet, noiseTexture]
  )

  // Create effect instances (stable references)
  const effects = useMemo(
    () =>
      ({
        normal: null,
        damage: new DamageFlash(),
        dissolve: new closureEffects.Dissolve(),
        powerup: new Powerup(),
        petrify: new Petrify(),
        select: new closureEffects.Select(),
        shadow: new ShadowEffect(),
        pixelate: new closureEffects.Pixelate(),
      }) as Record<EffectType, MaterialEffect | null>,
    [closureEffects]
  )

  // Track effect state
  const stateRef = useRef({
    effect: 'normal' as EffectType,
    instance: null as MaterialEffect | null,
    startTime: 0,
    elapsed: 0,
  })

  // Switch effects when prop changes
  useEffect(() => {
    const sprite = spriteRef.current
    if (!sprite) return

    // Remove previous effect
    if (stateRef.current.instance) {
      sprite.removeEffect(stateRef.current.instance)
    }

    const newInstance = effects[effect]

    stateRef.current.effect = effect
    stateRef.current.instance = newInstance
    stateRef.current.startTime = stateRef.current.elapsed

    // Add new effect
    if (newInstance) {
      sprite.addEffect(newInstance)
    }

    // Reset effect-specific properties
    if (effect === 'dissolve') {
      ;(newInstance as InstanceType<typeof closureEffects.Dissolve>).progress = 0
    }
    if (effect === 'damage') {
      ;(newInstance as InstanceType<typeof DamageFlash>).intensity = 1
    }
    if (effect === 'pixelate') {
      ;(newInstance as InstanceType<typeof closureEffects.Pixelate>).progress = 0
    }

    // Play matching animation
    const animName = effectAnimations[effect]
    if (effect === 'petrify') {
      sprite.play(animName)
      sprite.pause()
      sprite.gotoFrame(0)
    } else if (effect === 'damage') {
      sprite.play(animName, {
        onComplete: () => sprite.play('idle'),
      })
    } else if (effect === 'pixelate') {
      sprite.play(animName, {
        loop: false,
        onComplete: () => sprite.play('idle'),
      })
    } else {
      sprite.play(animName)
    }
  }, [effect, effects, closureEffects])

  // Animation loop
  useFrame((_, delta) => {
    const sprite = spriteRef.current
    if (!sprite) return

    stateRef.current.elapsed += delta
    sprite.update(delta * 1000)

    const { effect: currentEffect, instance, startTime } = stateRef.current
    const effectElapsed = stateRef.current.elapsed - startTime

    if (currentEffect === 'damage' && instance) {
      ;(instance as InstanceType<typeof DamageFlash>).intensity =
        Math.max(0, 1 - effectElapsed / 0.3)
    }

    if (currentEffect === 'dissolve' && instance) {
      ;(instance as InstanceType<typeof closureEffects.Dissolve>).progress =
        Math.min(1, effectElapsed / 1.5)
    }

    if (currentEffect === 'powerup' && instance) {
      ;(instance as InstanceType<typeof Powerup>).angle = stateRef.current.elapsed * 3
    }

    if (currentEffect === 'pixelate' && instance) {
      ;(instance as InstanceType<typeof closureEffects.Pixelate>).progress =
        Math.min(1, effectElapsed / 1.0)
    }
  })

  return (
    <animatedSprite2D
      ref={spriteRef}
      material={material}
      spriteSheet={spriteSheet}
      animationSet={animationSet}
      animation="idle"
      scale={[128, 128, 1]}
    />
  )
}

// ========================================
// Stats tracker
// ========================================

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

// ========================================
// App component
// ========================================

export default function App() {
  const [effect, setEffect] = useState<EffectType>('normal')
  const controlsRef = useRef<HTMLDivElement>(null)
  const [stats, setStats] = useState({ fps: '-' as string | number, draws: '-' as string | number })
  const handleStats = useCallback((fps: number, draws: number) => setStats({ fps, draws }), [])

  // Per-line pill rounding for wrapped radio groups
  useEffect(() => {
    const group = controlsRef.current?.querySelector('wa-radio-group')
    if (!group) return
    const update = () => {
      const radios = [...group.querySelectorAll('wa-radio')]
      if (!radios.length) return
      const lines: Element[][] = []
      let lastTop = -Infinity
      let line: Element[] = []
      for (const radio of radios) {
        const top = radio.getBoundingClientRect().top
        if (Math.abs(top - lastTop) > 2) {
          if (line.length) lines.push(line)
          line = []
          lastTop = top
        }
        line.push(radio)
      }
      if (line.length) lines.push(line)
      for (const ln of lines) {
        for (let i = 0; i < ln.length; i++) {
          const pos =
            ln.length === 1 ? 'solo' :
            i === 0 ? 'first' :
            i === ln.length - 1 ? 'last' : 'inner'
          ln[i]!.setAttribute('data-line-pos', pos)
        }
      }
    }
    const ro = new ResizeObserver(update)
    ro.observe(group)
    update()
    return () => ro.disconnect()
  }, [])

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
        .effect-bar wa-radio-group::part(form-control-label) { display: none; }
        .effect-bar wa-radio-group::part(form-control) { margin: 0; border: 0; padding: 0; }
        .effect-bar wa-radio-group::part(form-control-input) { row-gap: 4px; justify-content: center; }
        wa-radio[data-line-pos="first"] {
          border-start-start-radius: var(--wa-border-radius-m);
          border-end-start-radius: var(--wa-border-radius-m);
          border-start-end-radius: 0;
          border-end-end-radius: 0;
        }
        wa-radio[data-line-pos="inner"] { border-radius: 0; }
        wa-radio[data-line-pos="last"] {
          border-start-end-radius: var(--wa-border-radius-m);
          border-end-end-radius: var(--wa-border-radius-m);
          border-start-start-radius: 0;
          border-end-start-radius: 0;
        }
        wa-radio[data-line-pos="solo"] { border-radius: var(--wa-border-radius-m); }
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
        ref={controlsRef}
        className="effect-bar"
        style={{
          position: 'fixed',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'auto',
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <WaRadioGroup label="Effect" size="small" orientation="horizontal" value={effect} onChange={(e: any) => setEffect((e.target as HTMLInputElement).value as EffectType)}>
          {(Object.entries(effectLabels) as [EffectType, string][]).map(([value, label]) => (
            <WaRadio key={value} value={value} size="small" appearance="button">{label}</WaRadio>
          ))}
        </WaRadioGroup>
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
          <EffectSprite effect={effect} />
        </Suspense>
      </Canvas>
    </>
  )
}
