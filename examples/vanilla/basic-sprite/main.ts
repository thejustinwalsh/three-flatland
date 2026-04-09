import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { Sprite2D, TextureLoader } from 'three-flatland'
import { createPane } from '@three-flatland/tweakpane'

async function main() {
  // Scene setup
  const scene = new Scene()
  scene.background = new Color(0x1a1a2e)

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
  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  // Wait for renderer to initialize
  await renderer.init()

  // Load the flatland logo (uses 'pixel-art' preset by default with proper colorSpace)
  const texture = await TextureLoader.load(import.meta.env.BASE_URL + 'icon.svg')

  // Create sprite with explicit size (SVGs may not have proper dimensions)
  const sprite = new Sprite2D({
    texture,
    anchor: [0.5, 0.5],
  })
  sprite.position.set(0, 0, 0)
  scene.add(sprite)

  // Tweakpane UI
  const { pane, stats } = createPane()

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

  // Interaction state
  let isHovered = false
  let isPressed = false
  let currentScale = params.baseScale

  // Colors for tint (only hover effect)
  const normalTint = new Color(1, 1, 1)
  const hoverTint = new Color(params.hoverTint)

  // Update hoverTint when tweakpane changes it
  colorFolder.on('change', () => {
    hoverTint.set(params.hoverTint)
  })

  // Helper to check if mouse is over sprite
  function isMouseOverSprite(mouseX: number, mouseY: number): boolean {
    // Convert mouse coords to normalized device coords
    const rect = renderer.domElement.getBoundingClientRect()
    const x = ((mouseX - rect.left) / rect.width) * 2 - 1
    const y = -((mouseY - rect.top) / rect.height) * 2 + 1

    // Convert to world coords (need to recalculate aspect for resize)
    const currentAspect = window.innerWidth / window.innerHeight
    const worldX = (x * frustumSize * currentAspect) / 2
    const worldY = (y * frustumSize) / 2

    // Get sprite bounds (currentScale is the actual size in world units)
    const halfSize = currentScale / 2

    return (
      worldX >= sprite.position.x - halfSize &&
      worldX <= sprite.position.x + halfSize &&
      worldY >= sprite.position.y - halfSize &&
      worldY <= sprite.position.y + halfSize
    )
  }

  // Mouse event handlers
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

  // Current tint (lerped each frame)
  const currentTint = new Color(1, 1, 1)

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)
    stats.begin()

    const now = performance.now()
    const deltaMs = now - lastTime
    const delta = deltaMs / 1000
    lastTime = now

    // Determine target scale and tint
    const targetScale = isPressed
      ? params.pressedScale
      : isHovered
        ? params.hoverScale
        : params.baseScale
    const targetTint = isHovered ? hoverTint : normalTint

    // Lerp scale
    const lerpFactor = Math.min(params.lerpSpeed * delta, 1)
    currentScale = currentScale + (targetScale - currentScale) * lerpFactor
    sprite.scale.set(currentScale, currentScale, 1)

    // Lerp tint (update our tracked tint, then set it)
    currentTint.r += (targetTint.r - currentTint.r) * lerpFactor
    currentTint.g += (targetTint.g - currentTint.g) * lerpFactor
    currentTint.b += (targetTint.b - currentTint.b) * lerpFactor
    sprite.tint = currentTint

    // Slow rotation
    sprite.rotation.z += params.rotationSpeed * delta

    renderer.render(scene, camera)
    stats.update({ drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles })
    stats.end()
  }

  animate()
}

main()
