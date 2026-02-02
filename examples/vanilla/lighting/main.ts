import { WebGPURenderer, MeshBasicNodeMaterial } from 'three/webgpu'
import { vec4 } from 'three/tsl'
import { NearestFilter, Vector2, PlaneGeometry, Mesh } from 'three'
import {
  Flatland,
  Light2D,
  Sprite2D,
  Sprite2DMaterial,
  SpriteSheetLoader,
} from '@three-flatland/core'

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
    clearColor: 0x0a0a12,
  })

  // Load knight spritesheet
  const spriteSheet = await SpriteSheetLoader.load('./sprites/knight.json')
  spriteSheet.texture.minFilter = NearestFilter
  spriteSheet.texture.magFilter = NearestFilter

  // Create Light2D instances
  const torch1 = new Light2D({
    type: 'point',
    position: [-80, 50],
    color: 0xff6600,
    intensity: 1.2,
    radius: 150,
    falloff: 2,
  })

  const torch2 = new Light2D({
    type: 'point',
    position: [80, 50],
    color: 0xffaa00,
    intensity: 1.0,
    radius: 150,
    falloff: 2,
  })

  const ambient = new Light2D({
    type: 'ambient',
    color: 0x111122,
    intensity: 0.15,
  })

  // Add lights to flatland (must be added before createLitColorTransform)
  flatland.add(torch1)
  flatland.add(torch2)
  flatland.add(ambient)

  // Create lit material using the framework's colorTransform
  const litMaterial = new Sprite2DMaterial({
    map: spriteSheet.texture,
    colorTransform: flatland.createLitColorTransform(),
  })

  // Create sprites using Sprite2D + lit material
  const spritePositions: [number, number][] = [
    [-60, -20],
    [0, -20],
    [60, -20],
  ]

  const sprites: Sprite2D[] = []
  for (const pos of spritePositions) {
    const sprite = new Sprite2D({
      texture: spriteSheet.texture,
      frame: spriteSheet.getFrame('idle_0'),
      material: litMaterial,
    })
    sprite.position.set(pos[0], pos[1], 0)
    flatland.add(sprite)
    sprites.push(sprite)
  }

  // Create light indicator meshes (small colored squares)
  const indicatorGeometry = new PlaneGeometry(1, 1)

  const indicator1Mat = new MeshBasicNodeMaterial()
  indicator1Mat.transparent = true
  indicator1Mat.colorNode = vec4(0.9, 0.4, 0, 0.8)
  const indicator1 = new Mesh(indicatorGeometry, indicator1Mat)
  indicator1.scale.set(20, 20, 1)
  indicator1.position.set(torch1.position.x, torch1.position.y, 1)
  flatland.scene.add(indicator1)

  const indicator2Mat = new MeshBasicNodeMaterial()
  indicator2Mat.transparent = true
  indicator2Mat.colorNode = vec4(0.9, 0.6, 0, 0.8)
  const indicator2 = new Mesh(indicatorGeometry, indicator2Mat)
  indicator2.scale.set(20, 20, 1)
  indicator2.position.set(torch2.position.x, torch2.position.y, 1)
  flatland.scene.add(indicator2)

  // Animation state
  const animations = {
    idle: {
      frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'],
      fps: 8,
    },
  }
  let frameIndex = 0
  let frameTimer = 0

  // Drag state
  let draggingLight: Light2D | null = null
  const dragOffset = new Vector2()

  // Convert screen to world coordinates
  function screenToWorld(screenX: number, screenY: number): Vector2 {
    const rect = renderer.domElement.getBoundingClientRect()
    const x = ((screenX - rect.left) / rect.width) * 2 - 1
    const y = -((screenY - rect.top) / rect.height) * 2 + 1

    const viewSize = flatland.viewSize
    const aspect = window.innerWidth / window.innerHeight
    const worldX = (x * viewSize * aspect) / 2
    const worldY = (y * viewSize) / 2

    return new Vector2(worldX, worldY)
  }

  // Mouse event handlers
  renderer.domElement.addEventListener('mousedown', (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)

    const dist1 = worldPos.distanceTo(torch1.position2D)
    const dist2 = worldPos.distanceTo(torch2.position2D)

    if (dist1 < 15) {
      draggingLight = torch1
      dragOffset.copy(torch1.position2D).sub(worldPos)
    } else if (dist2 < 15) {
      draggingLight = torch2
      dragOffset.copy(torch2.position2D).sub(worldPos)
    }

    if (draggingLight) {
      renderer.domElement.style.cursor = 'grabbing'
    }
  })

  renderer.domElement.addEventListener('mousemove', (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY)

    if (draggingLight) {
      const newPos = worldPos.clone().add(dragOffset)
      draggingLight.position2D = newPos

      // Update indicator position
      if (draggingLight === torch1) {
        indicator1.position.set(newPos.x, newPos.y, 1)
      } else {
        indicator2.position.set(newPos.x, newPos.y, 1)
      }
    } else {
      const dist1 = worldPos.distanceTo(torch1.position2D)
      const dist2 = worldPos.distanceTo(torch2.position2D)
      if (dist1 < 15 || dist2 < 15) {
        renderer.domElement.style.cursor = 'grab'
      } else {
        renderer.domElement.style.cursor = 'default'
      }
    }
  })

  renderer.domElement.addEventListener('mouseup', () => {
    draggingLight = null
    renderer.domElement.style.cursor = 'default'
  })

  renderer.domElement.addEventListener('mouseleave', () => {
    draggingLight = null
    renderer.domElement.style.cursor = 'default'
  })

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (e.key === '1') {
      torch1.enabled = !torch1.enabled
    }
    if (e.key === '2') {
      torch2.enabled = !torch2.enabled
    }
    if (e.key === 'ArrowUp') {
      ambient.intensity = Math.min(1, ambient.intensity + 0.05)
    }
    if (e.key === 'ArrowDown') {
      ambient.intensity = Math.max(0, ambient.intensity - 0.05)
    }
  })

  // Handle resize
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    flatland.resize(window.innerWidth, window.innerHeight)
  })

  // Flickering effect
  let flickerTimer = 0

  // Animation loop
  let lastTime = performance.now()

  function animate() {
    requestAnimationFrame(animate)

    const now = performance.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    // Animate sprites
    frameTimer += delta * 1000
    const anim = animations.idle
    const frameDuration = 1000 / anim.fps

    if (frameTimer >= frameDuration) {
      frameTimer -= frameDuration
      frameIndex = (frameIndex + 1) % anim.frames.length
    }

    const frameName = anim.frames[frameIndex]
    const frame = spriteSheet.getFrame(frameName)
    for (const sprite of sprites) {
      sprite.setFrame(frame)
    }

    // Flicker effect for torches — just set properties, Flatland syncs uniforms
    flickerTimer += delta
    const flicker1 = 1 + Math.sin(flickerTimer * 15) * 0.1 + Math.sin(flickerTimer * 23) * 0.05
    const flicker2 =
      1 + Math.sin(flickerTimer * 17 + 1) * 0.1 + Math.sin(flickerTimer * 19 + 2) * 0.05

    if (torch1.enabled) {
      torch1.intensity = 1.2 * flicker1
    }
    if (torch2.enabled) {
      torch2.intensity = 1.0 * flicker2
    }

    // Render — Flatland syncs light uniforms and updates batches automatically
    flatland.render(renderer)
  }

  animate()
}

main()
