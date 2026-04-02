import { WebGPURenderer } from 'three/webgpu'
import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
} from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  SpriteSheetLoader,
  Layers,
} from 'three-flatland'
import { DefaultLightEffect, DirectLightEffect, SimpleLightEffect, AutoNormalProvider } from '@three-flatland/presets'

import '@awesome.me/webawesome/dist/styles/themes/default.css'
import '@awesome.me/webawesome/dist/components/radio-group/radio-group.js'
import '@awesome.me/webawesome/dist/components/radio/radio.js'
import '@awesome.me/webawesome/dist/components/switch/switch.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const VIEW_SIZE = 300
const INDICATOR_SIZE = 24

const spritePositions: [number, number][] = [
  [-60, -20],
  [0, -20],
  [60, -20],
]

const animFrames = ['idle_0', 'idle_1', 'idle_2', 'idle_3']
const ANIM_FPS = 8

// ─── Circle DataTexture for light indicators ─────────────────────────────────

function createCircleTexture(r: number, g: number, b: number, size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4)
  const center = size / 2
  const radius = size / 2 - 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5
      const dy = y - center + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      // Soft edge
      const alpha = dist < radius - 1 ? 255 : dist < radius ? Math.round((radius - dist) * 255) : 0
      data[i + 3] = alpha
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

// ─── Screen-to-world conversion ──────────────────────────────────────────────

function screenToWorld(
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
): Vector2 {
  const rect = canvas.getBoundingClientRect()
  const nx = ((sx - rect.left) / rect.width) * 2 - 1
  const ny = -((sy - rect.top) / rect.height) * 2 + 1
  const aspect = rect.width / rect.height
  return new Vector2(
    (nx * VIEW_SIZE * aspect) / 2,
    (ny * VIEW_SIZE) / 2,
  )
}

// ─── Wrapping Group Helper ──────────────────────────────────────────────────

function setupWrappingGroup(container: Element, childSelector: string) {
  const update = () => {
    const children = [...container.querySelectorAll(childSelector)]
    if (!children.length) return
    const lines: Element[][] = []
    let lastTop = -Infinity
    let line: Element[] = []
    for (const child of children) {
      const top = child.getBoundingClientRect().top
      if (Math.abs(top - lastTop) > 2) {
        if (line.length) lines.push(line)
        line = []
        lastTop = top
      }
      line.push(child)
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
  ro.observe(container)
  update()
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const renderer = new WebGPURenderer({ antialias: false })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1)
  document.body.appendChild(renderer.domElement)
  await renderer.init()

  const flatland = new Flatland({
    viewSize: VIEW_SIZE,
    aspect: window.innerWidth / window.innerHeight,
    clearColor: 0x0a0a12,
  })
  const defaultEffect = new DefaultLightEffect()
  const directEffect = new DirectLightEffect()
  const simpleEffect = new SimpleLightEffect()
  type LightingMode = 'default' | 'direct' | 'simple'
  let mode: LightingMode = 'default'
  flatland.setLighting(defaultEffect)

  // ─── Load knight sprite sheet ────────────────────────────────────────────

  const asset = (path: string) => new URL(path, import.meta.url).href
  const knightSheet = await SpriteSheetLoader.load(asset('./sprites/knight.json'))
  knightSheet.texture.minFilter = NearestFilter
  knightSheet.texture.magFilter = NearestFilter

  // ─── Lit knight sprites ──────────────────────────────────────────────────

  const knights: Sprite2D[] = []
  for (const pos of spritePositions) {
    const knight = new Sprite2D({
      texture: knightSheet.texture,
      frame: knightSheet.getFrame('idle_0'),
      anchor: [0.5, 0.5],
    })
    knight.addEffect(new AutoNormalProvider())
    knight.scale.set(64, 64, 1)
    knight.position.set(pos[0], pos[1], 0)
    flatland.add(knight)
    knights.push(knight)
  }

  // ─── Lights ──────────────────────────────────────────────────────────────

  const torch1 = new Light2D({
    type: 'point',
    position: [-80, 50],
    color: 0xff6600,
    intensity: 1.2,
    distance: 150,
    decay: 2,
  })
  const torch2 = new Light2D({
    type: 'point',
    position: [80, 50],
    color: 0xffaa00,
    intensity: 1.0,
    distance: 150,
    decay: 2,
  })
  const ambient = new Light2D({
    type: 'ambient',
    color: 0x111122,
    intensity: 0.15,
  })

  flatland.add(torch1)
  flatland.add(torch2)
  flatland.add(ambient)

  const torches = [torch1, torch2]

  // ─── Light indicator sprites ─────────────────────────────────────────────

  const indicator1 = new Sprite2D({
    texture: createCircleTexture(255, 102, 0), // 0xff6600
    anchor: [0.5, 0.5],
    alpha: 0.8,
    layer: Layers.FOREGROUND,
    lit: false,
  })
  indicator1.scale.set(INDICATOR_SIZE, INDICATOR_SIZE, 1)
  indicator1.position.set(-80, 50, 0)
  flatland.add(indicator1)

  const indicator2 = new Sprite2D({
    texture: createCircleTexture(255, 170, 0), // 0xffaa00
    anchor: [0.5, 0.5],
    alpha: 0.8,
    layer: Layers.FOREGROUND,
    lit: false,
  })
  indicator2.scale.set(INDICATOR_SIZE, INDICATOR_SIZE, 1)
  indicator2.position.set(80, 50, 0)
  flatland.add(indicator2)

  const indicators = [indicator1, indicator2]

  // ─── Pointer drag (touch + mouse) ──────────────────────────────────────

  let draggingIndex = -1
  const dragOffset = new Vector2()

  renderer.domElement.style.touchAction = 'none'

  renderer.domElement.addEventListener('pointerdown', (e) => {
    const wp = screenToWorld(e.clientX, e.clientY, renderer.domElement)
    for (let i = 0; i < torches.length; i++) {
      if (wp.distanceTo(torches[i].position2D) < INDICATOR_SIZE) {
        draggingIndex = i
        dragOffset.copy(torches[i].position2D).sub(wp)
        renderer.domElement.style.cursor = 'grabbing'
        renderer.domElement.setPointerCapture(e.pointerId)
        return
      }
    }
  })

  renderer.domElement.addEventListener('pointermove', (e) => {
    const wp = screenToWorld(e.clientX, e.clientY, renderer.domElement)
    if (draggingIndex >= 0) {
      const newPos = wp.clone().add(dragOffset)
      torches[draggingIndex].position2D = newPos
      indicators[draggingIndex].position.set(newPos.x, newPos.y, 0)
    } else {
      let hovering = false
      for (const torch of torches) {
        if (wp.distanceTo(torch.position2D) < INDICATOR_SIZE) {
          hovering = true
          break
        }
      }
      renderer.domElement.style.cursor = hovering ? 'grab' : 'default'
    }
  })

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (draggingIndex >= 0) {
      draggingIndex = -1
      renderer.domElement.style.cursor = 'default'
      renderer.domElement.releasePointerCapture(e.pointerId)
    }
  })

  // ─── UI Controls ─────────────────────────────────────────────────────────

  const radioGroup = document.querySelector('wa-radio-group')!
  setupWrappingGroup(radioGroup, 'wa-radio')

  function applyMode(newMode: LightingMode) {
    mode = newMode
    const effects = { default: defaultEffect, direct: directEffect, simple: simpleEffect }
    flatland.setLighting(effects[mode])
  }

  radioGroup.addEventListener('change', () => {
    applyMode((radioGroup as HTMLInputElement).value as LightingMode)
  })

  const torch1Switch = document.getElementById('torch1-switch') as HTMLInputElement
  const torch2Switch = document.getElementById('torch2-switch') as HTMLInputElement

  torch1Switch.addEventListener('change', () => {
    torch1.enabled = torch1Switch.checked
  })
  torch2Switch.addEventListener('change', () => {
    torch2.enabled = torch2Switch.checked
  })

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
      torch1.enabled = !torch1.enabled
      torch1Switch.checked = torch1.enabled
    }
    if (e.key === '2') {
      torch2.enabled = !torch2.enabled
      torch2Switch.checked = torch2.enabled
    }
    if (e.key === 't' || e.key === 'T') {
      const modes: LightingMode[] = ['default', 'direct', 'simple']
      const next = modes[(modes.indexOf(mode) + 1) % modes.length]
      applyMode(next)
      ;(radioGroup as HTMLInputElement).value = next
    }
  })

  // ─── Resize ──────────────────────────────────────────────────────────────

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // ─── Animation loop ─────────────────────────────────────────────────────

  const statsEl = document.getElementById('stats')!
  let animFrame = 0
  let animTimer = 0
  let flickerTimer = 0
  let lastTime = performance.now()
  let frameCount = 0
  let fpsElapsed = 0
  let displayFps: string | number = '-'
  let displayDraws: string | number = '-'

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    lastTime = now
    const delta = deltaMs / 1000

    // Animate knight sprites
    animTimer += deltaMs
    const frameDuration = 1000 / ANIM_FPS
    if (animTimer >= frameDuration) {
      animTimer -= frameDuration
      animFrame = (animFrame + 1) % animFrames.length
      for (const knight of knights) {
        knight.setFrame(knightSheet.getFrame(animFrames[animFrame]))
      }
    }

    // Flicker — light intensity + indicator tint pulse
    flickerTimer += delta
    const t = flickerTimer

    if (torch1.enabled) {
      const f1 = 1 + Math.sin(t * 15) * 0.1 + Math.sin(t * 23) * 0.05
      torch1.intensity = 1.2 * f1
      indicator1.tint = [f1, f1, f1]
      indicator1.alpha = 0.8
    } else {
      indicator1.alpha = 0.3
    }

    if (torch2.enabled) {
      const f2 = 1 + Math.sin(t * 17 + 1) * 0.1 + Math.sin(t * 19 + 2) * 0.05
      torch2.intensity = 1.0 * f2
      indicator2.tint = [f2, f2, f2]
      indicator2.alpha = 0.8
    } else {
      indicator2.alpha = 0.3
    }

    // Render
    flatland.render(renderer)

    // Stats (update once per second)
    frameCount++
    fpsElapsed += delta
    if (fpsElapsed >= 1) {
      displayFps = Math.round(frameCount / fpsElapsed)
      displayDraws = flatland.stats.drawCalls
      frameCount = 0
      fpsElapsed = 0
    }
    const activeLights = [torch1, torch2].filter(t => t.enabled).length + 1
    const modeLabels = { default: 'Default', direct: 'Direct', simple: 'Simple' }
    statsEl.textContent =
      `FPS: ${displayFps}\n` +
      `Draws: ${displayDraws}\n` +
      `Lights: ${activeLights}\n` +
      `Mode: ${modeLabels[mode]}`
  }
  animate()
}

main()
