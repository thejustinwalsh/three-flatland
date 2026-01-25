import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'
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
// Note: sampleSprite handles most of the boilerplate - we only need raw TSL
// for special cases like pixelate (pre-transform UV) and outline (need UV for neighbors)
import {
  Scene,
  OrthographicCamera,
  Color,
  NearestFilter,
  PlaneGeometry,
  Mesh,
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
} from '@three-flatland/core'

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
  petrify: 'idle', // Will freeze on frame 0
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

  // Use nearest neighbor filtering for pixel art
  spriteSheet.texture.minFilter = NearestFilter
  spriteSheet.texture.magFilter = NearestFilter

  // Create noise texture for dissolve
  const noiseTexture = createNoiseTexture()
  noiseTexture.minFilter = NearestFilter
  noiseTexture.magFilter = NearestFilter

  // Shared geometry
  const geometry = new PlaneGeometry(1, 1)

  // Animated uniforms
  const timeUniform = uniform(0)
  const dissolveProgressUniform = uniform(0)
  const damageFlashUniform = uniform(0) // Decays from 1 to 0
  const pixelateProgressUniform = uniform(0) // 0 = normal, 1 = fully pixelated
  const effectStartTime = { value: 0 } // Track when effect started

  // Frame uniform - vec4(x, y, width, height) in UV space
  const frameUniform = uniform(new Vector4(0, 0, 0.125, 0.125))

  // Helper to create base material
  const createBaseMaterial = () => {
    const mat = new MeshBasicNodeMaterial()
    mat.transparent = true
    mat.depthWrite = true
    mat.depthTest = true
    return mat
  }

  // Shorthand for sampling sprite with alpha test
  const sample = () => sampleSprite(spriteSheet.texture, frameUniform, { alphaTest: 0.01 })

  // ========================================
  // Create materials for each effect
  // ========================================

  // Normal - just sample the sprite
  const normalMaterial = createBaseMaterial()
  normalMaterial.colorNode = sample()

  // Damage - one-shot white flash that decays
  const damageMaterial = createBaseMaterial()
  damageMaterial.colorNode = Fn(() => {
    const color = sample()
    return tintAdditive(color, [1, 1, 1], damageFlashUniform)
  })()

  // Dissolve - pixelated dissolve effect
  const dissolveMaterial = createBaseMaterial()
  dissolveMaterial.colorNode = Fn(() => {
    const color = sample()
    return dissolvePixelated(color, uv(), dissolveProgressUniform, noiseTexture, 16)
  })()

  // Power-up - animated rainbow hue shift
  const powerupMaterial = createBaseMaterial()
  powerupMaterial.colorNode = Fn(() => {
    const color = sample()
    return hueShift(color, timeUniform.mul(float(3)))
  })()

  // Petrify - grayscale
  const petrifyMaterial = createBaseMaterial()
  petrifyMaterial.colorNode = Fn(() => {
    const color = sample()
    return saturate(color, 0)
  })()

  // Select - glowing outline (needs UV for neighbor sampling)
  const selectMaterial = createBaseMaterial()
  selectMaterial.colorNode = Fn(() => {
    const frameUV = spriteUV(frameUniform)
    const color = sampleTexture(spriteSheet.texture, frameUV)
    return outline8(color, frameUV, spriteSheet.texture, {
      color: [0.3, 1, 0.3, 1],
      thickness: 0.003,
    })
  })()

  // Shadow - dark blue tint with reduced alpha
  const shadowMaterial = createBaseMaterial()
  shadowMaterial.colorNode = Fn(() => {
    const color = sample()
    const darkened = tint(tintAdditive(color, [0, 0, 0.2], 0.3), [0.2, 0.2, 0.4])
    return vec4(darkened.rgb, color.a.mul(float(0.6)))
  })()

  // Pixelate - one-shot teleport effect
  const pixelateMaterial = createBaseMaterial()
  pixelateMaterial.colorNode = Fn(() => {
    // Pixel count: 32 (normal) -> 4 (pixelated) -> 32 (normal)
    const pixelAmount = float(1).sub(pixelateProgressUniform.mul(float(2)).sub(float(1)).abs())
    const pixelCount = float(32).sub(pixelAmount.mul(float(28)))

    // Pixelate UV then sample
    const pixelatedUV = pixelate(uv(), vec2(pixelCount, pixelCount))
    const frameOffset = vec2(frameUniform.x, frameUniform.y)
    const frameSize = vec2(frameUniform.z, frameUniform.w)
    const frameUV = pixelatedUV.mul(frameSize).add(frameOffset)
    const color = sampleTexture(spriteSheet.texture, frameUV)

    If(color.a.lessThan(float(0.01)), () => {
      Discard()
    })
    return color
  })()

  // Map effect types to materials
  const materials: Record<EffectType, MeshBasicNodeMaterial> = {
    normal: normalMaterial,
    damage: damageMaterial,
    dissolve: dissolveMaterial,
    powerup: powerupMaterial,
    petrify: petrifyMaterial,
    select: selectMaterial,
    shadow: shadowMaterial,
    pixelate: pixelateMaterial,
  }

  // Create sprite mesh
  const sprite = new Mesh(geometry, normalMaterial)
  sprite.scale.set(128, 128, 1)
  scene.add(sprite)

  // Animation state
  let currentAnimation = 'idle'
  let currentFrameIndex = 0
  let frameTimer = 0
  let animationFrozen = false
  let forceNoLoop = false // Override loop for one-shot effects

  function setFrame(frameName: string) {
    const frame = spriteSheet.getFrame(frameName)
    frameUniform.value.set(frame.x, frame.y, frame.width, frame.height)
  }

  function playAnimation(animName: string, frozen = false, noLoop = false) {
    currentAnimation = animName
    currentFrameIndex = 0
    frameTimer = 0
    animationFrozen = frozen
    forceNoLoop = noLoop
    const anim = animations[animName]!
    setFrame(anim.frames[0]!)
  }

  // UI elements
  const currentEffectEl = document.getElementById('current-effect')!
  const buttons = {
    normal: document.getElementById('btn-normal')!,
    damage: document.getElementById('btn-damage')!,
    dissolve: document.getElementById('btn-dissolve')!,
    powerup: document.getElementById('btn-powerup')!,
    petrify: document.getElementById('btn-petrify')!,
    select: document.getElementById('btn-select')!,
    shadow: document.getElementById('btn-shadow')!,
    pixelate: document.getElementById('btn-pixelate')!,
  }

  const effectLabels: Record<EffectType, string> = {
    normal: 'Normal',
    damage: 'Damage Flash',
    dissolve: 'Dissolve',
    powerup: 'Power-Up (Rainbow)',
    petrify: 'Petrified (Grayscale)',
    select: 'Selection (Outline)',
    shadow: 'Shadow Form',
    pixelate: 'Pixelate (Teleport)',
  }

  let currentEffect: EffectType = 'normal'

  function setEffect(effect: EffectType) {
    currentEffect = effect
    sprite.material = materials[effect]
    currentEffectEl.textContent = effectLabels[effect]

    // Update button states
    Object.entries(buttons).forEach(([key, btn]) => {
      btn.classList.toggle('active', key === effect)
    })

    // Reset effect-specific uniforms and start time
    effectStartTime.value = timeUniform.value

    if (effect === 'dissolve') {
      dissolveProgressUniform.value = 0
    }
    if (effect === 'damage') {
      damageFlashUniform.value = 1 // Start at full flash
    }
    if (effect === 'pixelate') {
      pixelateProgressUniform.value = 0
    }

    // Play matching animation
    const animName = effectAnimations[effect]
    const frozen = effect === 'petrify' // Petrify freezes on frame 0
    const noLoop = effect === 'pixelate' // Pixelate plays roll once
    playAnimation(animName, frozen, noLoop)
  }

  // Button event listeners
  Object.entries(buttons).forEach(([key, btn]) => {
    btn.addEventListener('click', () => setEffect(key as EffectType))
  })

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
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
      setEffect(keyMap[e.key])
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

  // Initialize with idle animation
  playAnimation('idle')

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now
    const deltaSec = deltaMs / 1000

    timeUniform.value += deltaSec

    // Update sprite animation (unless frozen)
    if (!animationFrozen) {
      const anim = animations[currentAnimation]!
      frameTimer += deltaMs

      const frameDuration = 1000 / anim.fps
      if (frameTimer >= frameDuration) {
        frameTimer -= frameDuration
        currentFrameIndex++

        if (currentFrameIndex >= anim.frames.length) {
          if (anim.loop && !forceNoLoop) {
            currentFrameIndex = 0
          } else {
            // Non-looping animation finished - return to idle
            currentFrameIndex = anim.frames.length - 1
            if (currentEffect === 'damage' || currentEffect === 'pixelate') {
              playAnimation('idle')
            }
          }
        }

        setFrame(anim.frames[currentFrameIndex]!)
      }
    }

    // Animate one-shot effects
    const effectElapsed = timeUniform.value - effectStartTime.value

    if (currentEffect === 'damage') {
      // Flash decays quickly (0.3 seconds)
      damageFlashUniform.value = Math.max(0, 1 - effectElapsed / 0.3)
    }

    if (currentEffect === 'dissolve') {
      // Dissolve over 1.5 seconds, then stay dissolved
      dissolveProgressUniform.value = Math.min(1, effectElapsed / 1.5)
    }

    if (currentEffect === 'pixelate') {
      // Pixelate in and out over 1 second
      const progress = Math.min(1, effectElapsed / 1.0)
      pixelateProgressUniform.value = progress
    }

    renderer.render(scene, camera)
  }

  animate()
}

main()
