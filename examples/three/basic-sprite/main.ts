import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { Sprite2D, TextureLoader, createDevtoolsProvider } from 'three-flatland'
import { createPane } from '@three-flatland/devtools'
import { gemGradientNode } from './GemBackground'
import { GEM } from './gem'

// HMR cleanup — stop the old animate loop + dispose the old renderer
// when Vite reloads this module. Without this, every dev save stacks a
// fresh renderer on top of the previous one's still-running rAF.
let rafId = 0
let activeRenderer: WebGPURenderer | null = null

async function main() {
  // Gem-tinted backdrop matching the masonry tile poster. The TSL
  // gradient paints the entire viewport via scene.backgroundNode (L2);
  // no separate L1 clear color so there's no flash of color before
  // the shader compiles — body bg (#16191e, see index.html) shows
  // through any uncovered pixels.
  const scene = new Scene()
  ;(scene as any).backgroundNode = gemGradientNode({ gem: GEM })

  // Orthographic camera for 2D rendering
  const frustumSize = 400
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
  activeRenderer = renderer
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(1) // Pixel-perfect for pixel art
  renderer.domElement.style.imageRendering = 'pixelated'
  document.body.appendChild(renderer.domElement)

  await renderer.init()

  const texture = await TextureLoader.load('./icon.svg')

  const sprite = new Sprite2D({
    texture,
    anchor: [0.5, 0.5],
  })
  sprite.position.set(0, 0, 0)
  scene.add(sprite)

  // Tweakpane UI
  const { pane, update: updateDevtools } = createPane({ driver: 'manual' })

  // Vanilla three.js apps don't get a devtools provider for free —
  // Flatland constructs one inside `Flatland.render()`. For non-
  // Flatland examples we spawn one ourselves and bracket the render
  // call below. No-op (zero cost) when the devtools build flag is
  // off in production.
  const devtools = createDevtoolsProvider({ name: 'basic-sprite' })

  const params = {
    baseScale: 150,
    hoverScale: 165,
    pressedScale: 135,
    rotationSpeed: 0.2,
    lerpSpeed: 10,
    hoverTint: '#99d9ef',
  }

  const spriteFolder = pane.addFolder({ title: 'Sprite', expanded: false })
  spriteFolder.addBinding(params, 'baseScale', { min: 10, max: 300 })
  spriteFolder.addBinding(params, 'hoverScale', { min: 10, max: 300 })
  spriteFolder.addBinding(params, 'pressedScale', { min: 10, max: 300 })

  const animFolder = pane.addFolder({ title: 'Animation', expanded: false })
  animFolder.addBinding(params, 'rotationSpeed', { min: 0, max: 2, step: 0.1 })
  animFolder.addBinding(params, 'lerpSpeed', { min: 1, max: 20, step: 1 })

  const colorFolder = pane.addFolder({ title: 'Color', expanded: false })
  colorFolder.addBinding(params, 'hoverTint')

  sprite.scale.set(params.baseScale, params.baseScale, 1)

  let isHovered = false
  let isPressed = false
  let currentScale = params.baseScale

  const normalTint = new Color(1, 1, 1)
  const hoverTint = new Color(params.hoverTint)

  colorFolder.on('change', () => {
    hoverTint.set(params.hoverTint)
  })

  function isMouseOverSprite(mouseX: number, mouseY: number): boolean {
    const rect = renderer.domElement.getBoundingClientRect()
    const x = ((mouseX - rect.left) / rect.width) * 2 - 1
    const y = -((mouseY - rect.top) / rect.height) * 2 + 1
    const currentAspect = window.innerWidth / window.innerHeight
    const worldX = (x * frustumSize * currentAspect) / 2
    const worldY = (y * frustumSize) / 2
    const halfSize = currentScale / 2
    return (
      worldX >= sprite.position.x - halfSize &&
      worldX <= sprite.position.x + halfSize &&
      worldY >= sprite.position.y - halfSize &&
      worldY <= sprite.position.y + halfSize
    )
  }

  renderer.domElement.addEventListener('mousemove', (event) => {
    isHovered = isMouseOverSprite(event.clientX, event.clientY)
    renderer.domElement.style.cursor = isHovered ? 'pointer' : 'default'
  })

  renderer.domElement.addEventListener('mousedown', (event) => {
    if (isMouseOverSprite(event.clientX, event.clientY)) {
      isPressed = true
    }
  })

  renderer.domElement.addEventListener('mouseup', () => {
    isPressed = false
  })

  renderer.domElement.addEventListener('mouseleave', () => {
    isHovered = false
    isPressed = false
  })

  window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight
    camera.left = (-frustumSize * aspect) / 2
    camera.right = (frustumSize * aspect) / 2
    camera.top = frustumSize / 2
    camera.bottom = -frustumSize / 2
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  const currentTint = new Color(1, 1, 1)
  let lastTime = performance.now()

  function animate() {
    rafId = requestAnimationFrame(animate)

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    const targetScale = isPressed
      ? params.pressedScale
      : isHovered
        ? params.hoverScale
        : params.baseScale
    const targetTint = isHovered ? hoverTint : normalTint

    const lerpFactor = Math.min(params.lerpSpeed * delta, 1)
    currentScale = currentScale + (targetScale - currentScale) * lerpFactor
    sprite.scale.set(currentScale, currentScale, 1)

    currentTint.r += (targetTint.r - currentTint.r) * lerpFactor
    currentTint.g += (targetTint.g - currentTint.g) * lerpFactor
    currentTint.b += (targetTint.b - currentTint.b) * lerpFactor
    sprite.tint = currentTint

    sprite.rotation.z += params.rotationSpeed * delta

    devtools.beginFrame(performance.now(), renderer)
    renderer.render(scene, camera)
    devtools.endFrame(renderer)
    updateDevtools()
  }

  animate()
}

main()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (activeRenderer) {
      activeRenderer.dispose?.()
      activeRenderer.domElement.remove()
      activeRenderer = null
    }
  })
}
