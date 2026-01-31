import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color } from 'three'
import { Sprite2D, TextureLoader } from '@three-flatland/core'

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
  const spriteSize = 150
  const sprite = new Sprite2D({
    texture,
    anchor: [0.5, 0.5],
  })
  sprite.position.set(0, 0, 0)
  sprite.scale.set(spriteSize, spriteSize, 1)
  scene.add(sprite)

  // Interaction state
  let isHovered = false
  let isPressed = false
  let currentScale = spriteSize
  const baseScale = spriteSize
  const hoverScale = spriteSize * 1.1
  const pressedScale = spriteSize * 0.9
  const lerpSpeed = 10

  // Colors for tint (only hover effect)
  const normalTint = new Color(1, 1, 1)
  const hoverTint = new Color(0.6, 0.85, 1.0) // Soft cyan highlight

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

  // Stats
  const statsEl = document.getElementById('stats')!
  let frameCount = 0
  let fpsTime = 0
  let currentFps = 0

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const deltaMs = now - lastTime
    const delta = deltaMs / 1000
    lastTime = now

    // Determine target scale and tint
    const targetScale = isPressed ? pressedScale : isHovered ? hoverScale : baseScale
    const targetTint = isHovered ? hoverTint : normalTint

    // Lerp scale
    const lerpFactor = Math.min(lerpSpeed * delta, 1)
    currentScale = currentScale + (targetScale - currentScale) * lerpFactor
    sprite.scale.set(currentScale, currentScale, 1)

    // Lerp tint (update our tracked tint, then set it)
    currentTint.r += (targetTint.r - currentTint.r) * lerpFactor
    currentTint.g += (targetTint.g - currentTint.g) * lerpFactor
    currentTint.b += (targetTint.b - currentTint.b) * lerpFactor
    sprite.tint = currentTint

    // Slow rotation
    sprite.rotation.z += 0.2 * delta

    renderer.render(scene, camera)

    // Update stats (~once per second)
    frameCount++
    fpsTime += deltaMs
    if (fpsTime >= 1000) {
      currentFps = Math.round(frameCount * 1000 / fpsTime)
      frameCount = 0
      fpsTime = 0
      statsEl.textContent = `FPS: ${currentFps}\nDraws: ${renderer.info.render.drawCalls}`
    }
  }

  animate()
}

main()
