import { Suspense, useState, useMemo, useRef, useEffect } from 'react'
import { Canvas, extend, useFrame, useThree, useLoader } from '@react-three/fiber/webgpu'
import {
  texture as sampleTexture,
  uv,
  attribute,
  vec2,
  vec4,
  float,
} from 'three/tsl'
import {
  CanvasTexture,
  RepeatWrapping,
} from 'three'
import {
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteSheetLoader,
  applyTextureOptions,
  createMaterialEffect,
  type SpriteSheet,
  type MaterialEffect,
  type AnimationSetDefinition,
} from 'three-flatland/react'
import {
  tintAdditive,
  hueShift,
  saturate,
  outline8,
  pixelate,
  dissolvePixelated,
  tint,
} from '@three-flatland/nodes'
import { usePane, usePaneFolder } from '@three-flatland/tweakpane/react'

extend({ AnimatedSprite2D })

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

// Pixel-art preset applied by SpriteSheetLoader (configured via TextureConfig or loader.preset)

// ========================================
// EffectSprite component
// ========================================

interface EffectSpriteProps {
  effect: EffectType
}

function EffectSprite({ effect }: EffectSpriteProps) {
  const spriteSheet = useLoader(SpriteSheetLoader, './sprites/knight.json') as SpriteSheet
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
    applyTextureOptions(tex, 'pixel-art')
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
          const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
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
// Scene component (Tweakpane lives here, inside Canvas)
// ========================================

const effectNames: EffectType[] = ['normal', 'damage', 'dissolve', 'powerup', 'petrify', 'select', 'shadow', 'pixelate']
const effectLabels = ['Normal', 'Damage', 'Dissolve', 'Rainbow', 'Stone', 'Outline', 'Shadow', 'Pixelate']

function Scene() {
  const { pane, stats } = usePane()
  const effectFolder = usePaneFolder(pane, 'Effects', { expanded: true })
  const gl = useThree((s) => s.gl)

  const [effect, setEffect] = useState('normal')
  const gridRef = useRef<any>(null)

  // 3×3 radiogrid for effect selection
  useEffect(() => {
    if (!effectFolder) return
    const grid = (effectFolder.addBlade({
      view: 'radiogrid',
      groupName: 'effect',
      size: [3, 3],
      cells: (x: number, y: number) => {
        const i = y * 3 + x
        if (i >= effectNames.length) return { title: '', value: '' }
        return { title: effectLabels[i]!, value: effectNames[i]! }
      },
      value: 'normal',
    } as any) as any)
    gridRef.current = grid
    grid.on('change', (ev: any) => { if (ev.value) setEffect(ev.value) })
    return () => { grid.dispose(); gridRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectFolder])

  // Keyboard controls (1-8 select effect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const idx = parseInt(e.key) - 1
      if (idx >= 0 && idx < effectNames.length) {
        if (gridRef.current) gridRef.current.value.rawValue = effectNames[idx]!
        setEffect(effectNames[idx]!)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Stats begin/end
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
      <color attach="background" args={['#1a1a2e']} />
      <Suspense fallback={null}>
        <EffectSprite effect={effect as EffectType} />
      </Suspense>
    </>
  )
}

// ========================================
// App component
// ========================================

export default function App() {
  return (
    <>
      {/* Attribution -- centered bottom */}
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
        camera={{ zoom: 3, position: [0, 0, 100] }}
        renderer={{ antialias: false }}
      >
        <Scene />
      </Canvas>
    </>
  )
}
