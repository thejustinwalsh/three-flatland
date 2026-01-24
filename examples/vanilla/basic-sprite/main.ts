import { WebGPURenderer } from 'three/webgpu'
import { Scene, OrthographicCamera, Color, CanvasTexture } from 'three'
import { Sprite2D } from '@three-flatland/core'

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

  // Create a test texture (a simple colored square)
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#4a9eff'
  ctx.fillRect(0, 0, 64, 64)
  ctx.fillStyle = '#ff4a9e'
  ctx.fillRect(16, 16, 32, 32)

  const texture = new CanvasTexture(canvas)

  // Create sprite
  const sprite = new Sprite2D({
    texture,
    anchor: [0.5, 0.5],
  })
  sprite.position.set(0, 0, 0)
  scene.add(sprite)

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

  // Animation loop
  function animate() {
    requestAnimationFrame(animate)

    // Rotate the sprite
    sprite.rotation.z += 0.01

    renderer.render(scene, camera)
  }

  animate()
}

main()
