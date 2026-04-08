import { WebGPURenderer } from 'three/webgpu'
import {
  texture as sampleTexture,
  uv,
  attribute,
  vec2,
  vec4,
  float,
} from 'three/tsl'
import {
  Scene,
  OrthographicCamera,
  Color,
  NearestFilter,
  CanvasTexture,
  RepeatWrapping,
} from 'three'
import {
  AnimatedSprite2D,
  Sprite2DMaterial,
  SpriteSheetLoader,
  createMaterialEffect,
} from 'three-flatland'
import type { MaterialEffect, AnimationSetDefinition } from 'three-flatland'
import {
  tintAdditive,
  hueShift,
  saturate,
  outline8,
  pixelate,
  dissolvePixelated,
  tint,
} from '@three-flatland/nodes'
import { createPane } from '@three-flatland/tweakpane'

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

async function main() {
  // Scene setup
  const scene = new Scene()
  scene.background = new Color(0x1a1a2e)

  // Orthographic camera for 2D rendering
  const frustumSize = 200
  const aspect = window.innerWidth / window.innerHeight
  const camera = new OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    1000
  )
  camera.position.z = 100

  // WebGPU Renderer (required for TSL materials)
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1) // Pixel-perfect for pixel art
  document.body.appendChild(renderer.domElement)

  // Wait for renderer to initialize
  await renderer.init()

  // Load the knight spritesheet
  const spriteSheet = await SpriteSheetLoader.load('./sprites/knight.json')
  spriteSheet.texture.minFilter = NearestFilter
  spriteSheet.texture.magFilter = NearestFilter

  // Create noise texture for dissolve
  const noiseTexture = createNoiseTexture()
  noiseTexture.minFilter = NearestFilter
  noiseTexture.magFilter = NearestFilter

  // ========================================
  // Effect Definitions (texture closures)
  // ========================================

  const Dissolve = createMaterialEffect({
    name: 'dissolve',
    schema: { progress: 0 } as const,
    node: ({ inputColor, attrs }) =>
      dissolvePixelated(inputColor, uv(), attrs.progress, noiseTexture, 16),
  })

  const Select = createMaterialEffect({
    name: 'select',
    schema: { thickness: 0.003 } as const,
    node: ({ inputColor, inputUV, attrs }) =>
      outline8(inputColor, inputUV, spriteSheet.texture, {
        color: [0.3, 1, 0.3, 1],
        thickness: attrs.thickness,
      }),
  })

  const PixelateEffect = createMaterialEffect({
    name: 'pixelate',
    schema: { progress: 0 } as const,
    node: ({ attrs }) => {
      // Re-sample at pixelated UV — must read instanceUV and uv() directly
      const instanceUV = attribute<'vec4'>('instanceUV', 'vec4')
      const localUV = uv()

      // Pixel count: 32 (normal) → 4 (pixelated) → 32 (normal)
      const pixelAmount = float(1).sub(
        attrs.progress.mul(float(2)).sub(float(1)).abs()
      )
      const pixelCount = float(32).sub(pixelAmount.mul(float(28)))

      // Pixelate local UV then remap to atlas frame
      const pixelatedUV = pixelate(localUV, vec2(pixelCount, pixelCount))
      const frameOffset = vec2(instanceUV.x, instanceUV.y)
      const frameSize = vec2(instanceUV.z, instanceUV.w)
      const frameUV = pixelatedUV.mul(frameSize).add(frameOffset)

      // Sample texture at pixelated UV (premultiplied output)
      const color = sampleTexture(spriteSheet.texture, frameUV)
      return vec4(color.rgb.mul(color.a), color.a)
    },
  })

  // ========================================
  // Create animated sprite
  // ========================================

  const sprite = new AnimatedSprite2D({
    spriteSheet,
    animationSet,
    animation: 'idle',
  })

  // Replace material with premultiplied alpha so outline/pixelate effects
  // can operate on transparent pixels (no Discard in base color)
  sprite.material = new Sprite2DMaterial({
    map: spriteSheet.texture,
    transparent: true,
    premultipliedAlpha: true,
  })

  sprite.scale.set(128, 128, 1)
  scene.add(sprite)

  // ========================================
  // Create effect instances
  // ========================================

  const effectInstances: Record<EffectType, MaterialEffect | null> = {
    normal: null,
    damage: new DamageFlash(),
    dissolve: new Dissolve(),
    powerup: new Powerup(),
    petrify: new Petrify(),
    select: new Select(),
    shadow: new ShadowEffect(),
    pixelate: new PixelateEffect(),
  }

  // ========================================
  // Effect switching
  // ========================================

  let currentEffect: EffectType = 'normal'
  let currentInstance: MaterialEffect | null = null
  let effectStartTime = 0
  let elapsedTime = 0

  function applyEffect(effect: EffectType) {
    // Remove current effect
    if (currentInstance) {
      sprite.removeEffect(currentInstance)
    }

    currentEffect = effect
    currentInstance = effectInstances[effect]

    // Add new effect
    if (currentInstance) {
      sprite.addEffect(currentInstance)
    }

    // Reset effect-specific properties and start time
    effectStartTime = elapsedTime

    if (effect === 'dissolve') {
      ;(currentInstance as InstanceType<typeof Dissolve>).progress = 0
    }
    if (effect === 'damage') {
      ;(currentInstance as InstanceType<typeof DamageFlash>).intensity = 1
    }
    if (effect === 'pixelate') {
      ;(currentInstance as InstanceType<typeof PixelateEffect>).progress = 0
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
  }

  // ========================================
  // Tweakpane UI
  // ========================================

  const { pane, fpsGraph } = createPane()

  const params = {
    effect: 'normal' as string,
    drawCalls: 0,
  }

  const effectBinding = pane.addBinding(params, 'effect', {
    options: {
      Normal: 'normal',
      Damage: 'damage',
      Dissolve: 'dissolve',
      Rainbow: 'powerup',
      Stone: 'petrify',
      Outline: 'select',
      Shadow: 'shadow',
      Pixelate: 'pixelate',
    },
  })

  effectBinding.on('change', (ev) => {
    applyEffect(ev.value as EffectType)
  })

  pane.addBinding(params, 'drawCalls', { readonly: true, label: 'draws' })

  pane.addBlade({ view: 'separator' })
  pane.addBlade({ view: 'text', label: '', value: 'Keys 1\u20138 select effect' } as any)

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    const effects: EffectType[] = ['normal', 'damage', 'dissolve', 'powerup', 'petrify', 'select', 'shadow', 'pixelate']
    const idx = parseInt(e.key) - 1
    if (idx >= 0 && idx < effects.length) {
      params.effect = effects[idx]!
      effectBinding.refresh()
      applyEffect(effects[idx]!)
    }
  })

  // Handle resize
  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * aspect) / 2
    camera.right = (frustumSize * aspect) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // ========================================
  // Animation loop
  // ========================================

  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)
    fpsGraph?.begin()

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now
    const deltaSec = deltaMs / 1000

    elapsedTime += deltaSec

    // Update sprite animation
    sprite.update(deltaMs)

    // Animate one-shot effects
    const effectElapsed = elapsedTime - effectStartTime

    if (currentEffect === 'damage' && currentInstance) {
      ;(currentInstance as InstanceType<typeof DamageFlash>).intensity =
        Math.max(0, 1 - effectElapsed / 0.3)
    }

    if (currentEffect === 'dissolve' && currentInstance) {
      ;(currentInstance as InstanceType<typeof Dissolve>).progress =
        Math.min(1, effectElapsed / 1.5)
    }

    if (currentEffect === 'powerup' && currentInstance) {
      ;(currentInstance as InstanceType<typeof Powerup>).angle = elapsedTime * 3
    }

    if (currentEffect === 'pixelate' && currentInstance) {
      ;(currentInstance as InstanceType<typeof PixelateEffect>).progress =
        Math.min(1, effectElapsed / 1.0)
    }

    renderer.render(scene, camera)

    // Update draw calls monitor
    params.drawCalls = renderer.info.render.drawCalls
    pane.refresh()

    fpsGraph?.end()
  }

  animate()
}

main()
