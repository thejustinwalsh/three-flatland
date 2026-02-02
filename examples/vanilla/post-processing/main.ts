import { WebGPURenderer, PostProcessing } from 'three/webgpu'
import { pass } from 'three/tsl'
import { uv, uniform, convertToTexture, float, floor, vec2 } from 'three/tsl'
import { NearestFilter } from 'three'
import {
  Flatland,
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
  Sprite2D,
  type SpriteSheet,
} from '@three-flatland/core'

type EffectType = 'none' | 'crt' | 'dmg' | 'gbc' | 'vhs' | 'lcd' | 'arcade' | 'film'

async function main() {
  // Create renderer
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  // Create Flatland
  const flatland = new Flatland({
    viewSize: 300,
    aspect: window.innerWidth / window.innerHeight,
    clearColor: 0x1a1a2e,
  })

  // Load knight spritesheet
  const spriteSheet = await SpriteSheetLoader.load('./sprites/knight.json')
  spriteSheet.texture.minFilter = NearestFilter
  spriteSheet.texture.magFilter = NearestFilter

  // Create sprites in different positions
  const sprites: Sprite2D[] = []
  const positions = [
    [-80, 0],
    [0, 0],
    [80, 0],
  ]

  for (let i = 0; i < 3; i++) {
    const sprite = new Sprite2D({
      texture: spriteSheet.texture,
      frame: spriteSheet.getFrame('idle_0'),
    })
    sprite.scale.set(64, 64, 1)
    sprite.position.set(positions[i][0], positions[i][1], 0)
    flatland.add(sprite)
    sprites.push(sprite)
  }

  // Animation state
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

  const spriteAnimState = sprites.map(() => ({
    animation: 'idle',
    frameIndex: 0,
    timer: 0,
  }))

  // Time uniform for animated effects
  const timeUniform = uniform(0)

  // Post-processing setup
  const postProcessing = new PostProcessing(renderer)
  const scenePass = pass(flatland.scene, flatland.camera)
  // Convert PassNode to TextureNode so effects can .sample() at custom UVs
  const sceneTexture = convertToTexture(scenePass)

  // Effect functions that create TSL nodes
  const effectNodes: Record<EffectType, () => ReturnType<typeof pass>> = {
    none: () => scenePass,

    crt: () => {
      // CRT TV effect with curvature, scanlines, phosphor mask
      return crtComplete(sceneTexture, uv(), {
        curvature: 0.15,
        vignetteIntensity: 0.3,
        scanlineIntensity: 0.15,
        scanlineRes: 240,
      })
    },

    dmg: () => {
      // Game Boy DMG - pixelate, ghosting, 4-color green palette + square pixel grid
      const res = float(160)
      const pixelSize = float(1).div(res)
      const pixelatedUV = floor(uv().mul(res)).add(0.5).div(res)

      // Sample center and neighbors — simulates slow LCD response / ghosting
      const center = sceneTexture.sample(pixelatedUV)
      const left = sceneTexture.sample(pixelatedUV.sub(vec2(pixelSize, 0)))
      const right = sceneTexture.sample(pixelatedUV.add(vec2(pixelSize, 0)))
      const up = sceneTexture.sample(pixelatedUV.add(vec2(0, pixelSize)))
      const down = sceneTexture.sample(pixelatedUV.sub(vec2(0, pixelSize)))

      const ghost = float(0.08)
      const ghosted = center.mul(float(1).sub(ghost.mul(4)))
        .add(left.mul(ghost))
        .add(right.mul(ghost))
        .add(up.mul(ghost))
        .add(down.mul(ghost))

      // Apply DMG 4-color green palette
      const palette = dmgPalette(ghosted)
      // Square pixel grid on green LCD background
      return dotMatrix(palette, uv(), 160, 0.85, [0.61, 0.73, 0.06])
    },

    gbc: () => {
      // Game Boy Color LCD simulation
      return lcdGBC(scenePass, uv(), 160, 0.2)
    },

    vhs: () => {
      // VHS tape - distortion (includes color separation) + static noise
      const distorted = vhsDistortion(sceneTexture, uv(), timeUniform, 0.02, 0.1)
      return staticNoise(distorted, uv(), timeUniform, 0.08)
    },

    lcd: () => {
      // LCD monitor grid pattern
      return lcdGrid(scenePass, uv(), 240, 0.15, 0.1)
    },

    arcade: () => {
      // Arcade CRT - phosphor mask + scanlines
      const withPhosphor = phosphorMask(scenePass, uv(), 'aperture', 640, 0.15)
      return scanlines(withPhosphor, uv(), 240, 0.2, timeUniform.mul(0.5))
    },

    film: () => {
      // Film look - grain + vignette
      const grained = filmGrain(scenePass, uv(), timeUniform, 0.15, 0.3)
      return vignette(grained, uv(), 0.6, 0.5)
    },
  }

  // Current effect
  let currentEffect: EffectType = 'none'

  function setEffect(effect: EffectType) {
    currentEffect = effect
    postProcessing.outputNode = effectNodes[effect]()
    postProcessing.needsUpdate = true

    // Update UI
    const currentEffectEl = document.getElementById('current-effect')!
    const labels: Record<EffectType, string> = {
      none: 'None',
      crt: 'CRT TV',
      dmg: 'Game Boy',
      gbc: 'Game Boy Color',
      vhs: 'VHS Tape',
      lcd: 'LCD Monitor',
      arcade: 'Arcade CRT',
      film: 'Film',
    }
    currentEffectEl.textContent = labels[effect]

    // Update button states
    const buttons = document.querySelectorAll('button')
    buttons.forEach((btn) => {
      btn.classList.remove('active')
      if (btn.id === `btn-${effect}`) {
        btn.classList.add('active')
      }
    })
  }

  // Button listeners
  const effectKeys: EffectType[] = ['none', 'crt', 'dmg', 'gbc', 'vhs', 'lcd', 'arcade', 'film']
  effectKeys.forEach((effect) => {
    const btn = document.getElementById(`btn-${effect}`)
    if (btn) {
      btn.addEventListener('click', () => setEffect(effect))
    }
  })

  // Keyboard controls (1-8)
  window.addEventListener('keydown', (e) => {
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
      setEffect(keyMap[e.key])
    }
  })

  // Initialize with first effect
  setEffect('none')

  // Tell Flatland about post-processing
  flatland.setPostProcessing(postProcessing, scenePass)

  // Handle resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    // Update time uniform
    timeUniform.value += delta

    // Animate sprites
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i]
      const state = spriteAnimState[i]
      const anim = animations[state.animation as keyof typeof animations]

      state.timer += delta * 1000
      const frameDuration = 1000 / anim.fps

      if (state.timer >= frameDuration) {
        state.timer -= frameDuration
        state.frameIndex = (state.frameIndex + 1) % anim.frames.length
      }

      sprite.setFrame(spriteSheet.getFrame(anim.frames[state.frameIndex]))

      // Gentle movement
      sprite.position.y = Math.sin(timeUniform.value * 2 + i * 0.7) * 10
    }

    // Render — flatland.render() updates batches, syncs lights, then uses post-processing
    flatland.render(renderer)
  }

  animate()
}

main()
